/**
 * PDE Coordinator Pace-Cap — REST surface
 * ============================================================================
 *
 * Wires the policy `pde.rollout.pace_cap_coordinators_per_60d` (previously
 * inert) to actual enforcement at the API boundary.
 *
 * GET  /api/pde/coordinators/can-onboard
 *   → returns PaceCapDecision for the current user's institution
 *
 * POST /api/pde/coordinators/can-onboard
 *   → body: { coordinatorId: string, notes?: string, institutionId?: string }
 *   → records an onboarding event; 403 if gate fails
 *
 * Auth pattern mirrors `app/api/pde/demonstrations/route.ts` (cookie SSR +
 * getUser). The pace-cap service additionally relies on RLS on
 * `pde_coordinator_onboarding_log` to restrict INSERT to super_admin — the
 * service-layer gate is the soft enforcement, RLS is the hard one.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { PDEPaceCapService } from '@/lib/services/pde-pace-cap-service';
import { PaceCapExceededError } from '@/lib/types/pde-coordinator-onboarding';

/**
 * Resolves the institution_id the current user should be scoped to.
 * Returns null if the user has no institution attached (treated as "global").
 */
async function resolveInstitutionId(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('institution_id')
    .eq('id', userId)
    .maybeSingle();
  return (data?.institution_id as string | null) ?? null;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow an override via query for super_admin tooling (e.g. /admin previews).
    // Falls back to the current user's institution.
    const url = new URL(request.url);
    const institutionOverride = url.searchParams.get('institutionId');
    const institutionId = institutionOverride ?? (await resolveInstitutionId(user.id));

    const decision = await PDEPaceCapService.canOnboardCoordinator(institutionId);
    return NextResponse.json({ data: decision });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      coordinatorId?: string;
      notes?: string | null;
      institutionId?: string | null;
    };

    if (!body.coordinatorId || typeof body.coordinatorId !== 'string') {
      return NextResponse.json(
        { error: 'coordinatorId is required (string)' },
        { status: 400 }
      );
    }

    const institutionId =
      body.institutionId !== undefined
        ? body.institutionId
        : await resolveInstitutionId(user.id);

    try {
      const row = await PDEPaceCapService.recordOnboarding(
        body.coordinatorId,
        institutionId,
        body.notes ?? null
      );
      return NextResponse.json({ data: row }, { status: 201 });
    } catch (gateErr) {
      if (gateErr instanceof PaceCapExceededError) {
        return NextResponse.json(
          {
            error: gateErr.message,
            current: gateErr.current,
            cap: gateErr.cap,
            window_days: gateErr.window_days,
          },
          { status: 403 }
        );
      }
      throw gateErr;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
