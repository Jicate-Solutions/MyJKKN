export const dynamic = 'force-dynamic';

// app/api/admission/analytics/dropoff/route.ts
// GET /api/admission/analytics/dropoff?institution_id=X
// Returns a drop-off funnel: for each stage, how many leads are AT or PAST that
// stage (cumulative count), the percentage of the initial cohort still present,
// and the drop-off rate from the previous stage.
//
// Auth: session cookie via getAuthUser() + service-role DB client.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

// ────────────────────────────────────────────────────────────────────────────
// Funnel configuration
// ────────────────────────────────────────────────────────────────────────────

// Ordered funnel stages (active progression path only).
// Terminal/exit stages (declined, withdrew, expired, lost, dormant)
// are excluded from the progression funnel.
const FUNNEL_ORDER: string[] = [
  'new',
  'contacted',
  'not_reachable',
  'follow_up_scheduled',
  'interested',
  'engaged',
  'qualified',
  'application_started',
  'applied',
  'application_submitted',
  'documents_pending',
  'documents_verified',
  'interview_scheduled',
  'interviewed',
  'interview_completed',
  'offer_sent',
  'offered',
  'offer_accepted',
  'token_paid',
  'enrolled',
  'confirmed',
];

// Stages that represent exits from the funnel — excluded entirely.
const TERMINAL_STAGES = new Set([
  'declined',
  'withdrew',
  'expired',
  'lost',
  'dormant',
]);

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DropoffStage {
  stage: string;
  /** Human-readable label */
  label: string;
  /** Leads currently at this stage */
  count: number;
  /** Percentage of total active leads at this stage (0-100) */
  pct: number;
  /** Percentage drop from the previous stage (null for the first stage) */
  dropoff: number | null;
}

export interface DropoffAnalyticsResponse {
  stages: DropoffStage[];
  total_active: number;
  biggest_bottleneck_stage: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Label map
// ────────────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new: 'New Leads',
  contacted: 'Contacted',
  not_reachable: 'Not Reachable',
  follow_up_scheduled: 'Follow-up Scheduled',
  interested: 'Interested',
  engaged: 'Engaged',
  qualified: 'Qualified',
  application_started: 'Application Started',
  applied: 'Applied',
  application_submitted: 'Application Submitted',
  documents_pending: 'Documents Pending',
  documents_verified: 'Documents Verified',
  interview_scheduled: 'Interview Scheduled',
  interviewed: 'Interviewed',
  interview_completed: 'Interview Completed',
  offer_sent: 'Offer Sent',
  offered: 'Offered',
  offer_accepted: 'Offer Accepted',
  token_paid: 'Token Paid',
  enrolled: 'Enrolled',
  confirmed: 'Confirmed',
};

// ────────────────────────────────────────────────────────────────────────────
// Route handler
// ────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    // 2. Parse params
    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id') || undefined;

    // 3. Query admission_leads — get funnel_stage counts excluding terminal stages
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('admission_leads')
      .select('funnel_stage')
      .not('funnel_stage', 'is', null)
      .not('funnel_stage', 'in', `(${[...TERMINAL_STAGES].join(',')})`);

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      return NextResponse.json(
        { error: 'DB_ERROR', message: dbError.message },
        { status: 500 },
      );
    }

    // 4. Build a per-stage count map
    const stageCounts: Record<string, number> = {};
    for (const row of data ?? []) {
      const s = row.funnel_stage as string;
      if (!TERMINAL_STAGES.has(s)) {
        stageCounts[s] = (stageCounts[s] ?? 0) + 1;
      }
    }

    // 5. Compute cumulative counts (AT or PAST each stage).
    //    A lead at stage N is counted in all stages 1..N.
    //    We do this by walking FUNNEL_ORDER and summing leads whose funnel_stage
    //    index >= the current stage index.
    const stageIndex: Record<string, number> = {};
    FUNNEL_ORDER.forEach((s, i) => { stageIndex[s] = i; });

    // For each stage in the funnel, count leads at that stage OR any later stage.
    const cumulativeCounts: number[] = FUNNEL_ORDER.map((_, stageIdx) => {
      return Object.entries(stageCounts).reduce((sum, [stage, count]) => {
        const idx = stageIndex[stage] ?? -1;
        return idx >= stageIdx ? sum + count : sum;
      }, 0);
    });

    const totalActive = cumulativeCounts[0] ?? 0;

    // 6. Build response stages
    let biggestBottleneckStage: string | null = null;
    let biggestDropoff = -1;

    const stages: DropoffStage[] = FUNNEL_ORDER.map((stage, i) => {
      const count = cumulativeCounts[i];
      const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;

      let dropoff: number | null = null;
      if (i > 0) {
        const prev = cumulativeCounts[i - 1];
        dropoff = prev > 0 ? Math.round(((prev - count) / prev) * 100) : 0;
        if (dropoff > biggestDropoff) {
          biggestDropoff = dropoff;
          biggestBottleneckStage = stage;
        }
      }

      return {
        stage,
        label: STAGE_LABELS[stage] ?? stage,
        count,
        pct,
        dropoff,
      };
    });

    const response: DropoffAnalyticsResponse = {
      stages,
      total_active: totalActive,
      biggest_bottleneck_stage: biggestBottleneckStage,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
