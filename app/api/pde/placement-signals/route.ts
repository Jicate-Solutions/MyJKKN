/**
 * PDE Placement Signals — REST surface (T3.6)
 * ============================================================================
 *
 * GET  /api/pde/placement-signals
 *   → list learners currently crossing the placement-signal threshold,
 *     scoped to the caller's institution unless `institutionId` query is
 *     provided.
 *
 * POST /api/pde/placement-signals
 *   → body: { learnerId: string }
 *   → evaluates + triggers a briefing for the given learner.
 *     Returns BriefingResult.
 *
 * Auth pattern mirrors `app/api/pde/coordinators/can-onboard/route.ts`:
 * cookie SSR + getUser. We do not enforce a role beyond authentication at
 * the API edge — the dashboard page wraps the surface with `<SuperAdminOnly>`,
 * and `industry_partners` / `pde_demonstrations` RLS keeps non-privileged
 * reads bounded. POST is a deliberate manual override (placement staff can
 * fire briefings outside the automated path).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { PDEEmployerBriefingService } from '@/lib/services/pde-employer-briefing-service';

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

    const url = new URL(request.url);
    const institutionOverride = url.searchParams.get('institutionId');
    const institutionId = institutionOverride ?? (await resolveInstitutionId(user.id));

    const rows = await PDEEmployerBriefingService.listActiveBriefings(institutionId);
    return NextResponse.json({ data: rows });
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

    const body = (await request.json()) as { learnerId?: string };
    if (!body.learnerId || typeof body.learnerId !== 'string') {
      return NextResponse.json(
        { error: 'learnerId is required (string)' },
        { status: 400 },
      );
    }

    const result = await PDEEmployerBriefingService.triggerBriefing(body.learnerId);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
