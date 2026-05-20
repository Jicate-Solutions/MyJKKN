/**
 * GET /api/pde/transcript/[learnerId]
 * ============================================================================
 *
 * Returns the assembled NAAC/NBA-ready PDE transcript JSON for a learner.
 *
 * Authorization
 * -------------
 * - Any authenticated user may fetch their OWN transcript (learnerId === uid).
 * - super_admin / administrator may fetch any learner's transcript.
 * - All other users → 403.
 *
 * Response shape: see `TranscriptData` in
 * `lib/services/pde-transcript-service.ts`.
 *
 * Phase: PDE Tier 4 — T4.4 (2026-05-19).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { PDETranscriptService } from '@/lib/services/pde-transcript-service';

const PRIVILEGED_ROLES = new Set(['super_admin', 'administrator']);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
): Promise<NextResponse> {
  const { learnerId } = await params;

  if (!learnerId) {
    return NextResponse.json(
      { success: false, error: 'learnerId is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();

    // ---------- Resolve caller ----------
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ---------- Authorize ----------
    const isSelf = user.id === learnerId;
    let isPrivileged = false;

    if (!isSelf) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      isPrivileged = !!profile?.role && PRIVILEGED_ROLES.has(profile.role);
    }

    if (!isSelf && !isPrivileged) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // ---------- Build ----------
    // Use service-role client for admin reads (bypass RLS once auth has passed).
    // For self-view, RLS would also work — service role is fine here since
    // we already verified the caller is the learner.
    const reader = isPrivileged ? createServiceRoleClient() : supabase;
    const data = await PDETranscriptService.buildTranscriptData(
      learnerId,
      reader as any,
      user.id
    );

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Learner not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PDE transcript API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build transcript' },
      { status: 500 }
    );
  }
}
