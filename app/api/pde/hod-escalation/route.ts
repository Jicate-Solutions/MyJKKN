/**
 * POST /api/pde/hod-escalation
 * ============================================================================
 *
 * Resolves an HOD-block event against the active
 * `pde.rollout.hod_blocking_escalation` policy and returns the action the
 * caller must take (respect / bypass_to_coordinator / log_to_dean_kpi) along
 * with the resolved target profile_id when applicable.
 *
 * Body shape:
 *   {
 *     learnerId: string,
 *     blockedBy: string,
 *     demonstrationId: string,
 *     reason: string,
 *     institutionId?: string | null
 *   }
 *
 * Tier 2 Item 2 of PDE consumer wiring.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEHodEscalationService } from '@/lib/services/pde-hod-escalation-service';

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

    const body = await request.json().catch(() => ({}));
    const { learnerId, blockedBy, demonstrationId, reason, institutionId } = body ?? {};

    const missing: string[] = [];
    if (!learnerId) missing.push('learnerId');
    if (!blockedBy) missing.push('blockedBy');
    if (!demonstrationId) missing.push('demonstrationId');
    if (!reason) missing.push('reason');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const decision = await PDEHodEscalationService.resolveBlockAction({
      learnerId,
      blockedBy,
      demonstrationId,
      reason,
      institutionId: institutionId ?? null,
    });

    return NextResponse.json({ data: decision }, { status: 200 });
  } catch (error: any) {
    console.error('Error resolving HOD escalation:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
