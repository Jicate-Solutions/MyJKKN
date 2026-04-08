export const dynamic = 'force-dynamic';

// app/api/admission/analytics/reengagement/route.ts
// GET /api/admission/analytics/reengagement?institution_id=X
//
// Returns re-engagement funnel metrics:
//   dormant_count    — leads flagged dormant OR inactive for >7 days (excl. terminal stages)
//   lost_count       — leads in 'lost' funnel_stage
//   reengaged_count  — leads whose previous_stage was 'dormant' and current stage is active
//   avg_dormant_days — average days since last_activity_at for dormant leads
//   by_last_stage    — breakdown of dormant leads by the stage they were at when they went dormant

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ReengagementStageBreakdown {
  stage: string;
  count: number;
}

export interface ReengagementResponse {
  dormant_count: number;
  lost_count: number;
  reengaged_count: number;
  avg_dormant_days: number;
  by_last_stage: ReengagementStageBreakdown[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Stages where a lead is considered "done" — we don't count these as dormant
// even if their last_activity_at is stale.
// Includes legacy stages (applied, interviewed, offered) that some leads may still have.
const TERMINAL_STAGES = new Set([
  'lost',
  'enrolled',
  'confirmed',
  'declined',
  'withdrew',
  'expired',
  'dormant', // explicit dormant is handled separately
  'applied',
  'interviewed',
  'offered',
]);

// Active stages (lead is working through the funnel)
const ACTIVE_STAGES = new Set([
  'new',
  'contacted',
  'not_reachable',
  'interested',
  'follow_up_scheduled',
  'engaged',
  'qualified',
  'application_started',
  'application_submitted',
  'documents_pending',
  'documents_verified',
  'interview_scheduled',
  'interview_completed',
  'offer_sent',
  'offer_accepted',
  'token_paid',
  'applied',
  'interviewed',
  'offered',
]);

// Inactivity threshold in days to consider a lead implicitly dormant
const DORMANT_THRESHOLD_DAYS = 7;

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id') || undefined;

    const supabase = createServiceRoleClient();

    // -------------------------------------------------------------------------
    // 1. Fetch all leads with the fields we need for calculation.
    //    We pull everything in one query and compute in JS to avoid complex
    //    SQL edge cases with the dormancy threshold.
    // -------------------------------------------------------------------------
    let leadsQuery = supabase
      .from('admission_leads')
      .select('funnel_stage, previous_stage, last_activity_at, is_dormant, is_lost, dormant_at');

    if (institution_id) {
      leadsQuery = leadsQuery.eq('institution_id', institution_id);
    }

    const { data: leads, error: leadsError } = await leadsQuery;
    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }

    const allLeads = leads ?? [];

    // -------------------------------------------------------------------------
    // 2. Classify leads
    // -------------------------------------------------------------------------
    const now = Date.now();
    const thresholdMs = DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

    let dormant_count = 0;
    let lost_count = 0;
    let reengaged_count = 0;
    let total_dormant_days = 0;

    // Track which stage dormant leads were at when they went dormant
    const stageCountMap = new Map<string, number>();

    for (const lead of allLeads) {
      const stage: string = lead.funnel_stage ?? 'new';

      // Lost
      if (lead.is_lost || stage === 'lost') {
        lost_count++;
        continue;
      }

      // Re-engaged: previous stage was 'dormant', current stage is active
      if (lead.previous_stage === 'dormant' && ACTIVE_STAGES.has(stage)) {
        reengaged_count++;
        // Do NOT count as dormant (they've come back)
        continue;
      }

      // Explicitly dormant via flag or funnel_stage — but never for terminal stages
      // (a lead with is_dormant=true but stage='enrolled' is NOT dormant)
      const isExplicitlyDormant =
        (lead.is_dormant || stage === 'dormant') &&
        !['enrolled', 'confirmed', 'token_paid'].includes(stage);

      // Implicitly dormant: not in terminal stage, last activity too long ago
      const lastActivity = lead.last_activity_at ? new Date(lead.last_activity_at).getTime() : null;
      const isImplicitlyDormant =
        !TERMINAL_STAGES.has(stage) &&
        lastActivity !== null &&
        now - lastActivity > thresholdMs;

      if (isExplicitlyDormant || isImplicitlyDormant) {
        dormant_count++;

        // Calculate dormant days from dormant_at (if set) or last_activity_at
        const dormantSince = lead.dormant_at
          ? new Date(lead.dormant_at).getTime()
          : lastActivity;
        if (dormantSince) {
          const dormantDays = (now - dormantSince) / (24 * 60 * 60 * 1000);
          total_dormant_days += dormantDays;
        }

        // Track previous_stage (stage before going dormant) for the breakdown.
        // If no previous_stage, fall back to the current stage.
        const lastActiveStage = lead.previous_stage || stage;
        stageCountMap.set(lastActiveStage, (stageCountMap.get(lastActiveStage) ?? 0) + 1);
      }
    }

    // -------------------------------------------------------------------------
    // 3. Build response
    // -------------------------------------------------------------------------
    const avg_dormant_days =
      dormant_count > 0
        ? Math.round((total_dormant_days / dormant_count) * 10) / 10
        : 0;

    // Sort by count descending
    const by_last_stage: ReengagementStageBreakdown[] = Array.from(stageCountMap.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);

    const response: ReengagementResponse = {
      dormant_count,
      lost_count,
      reengaged_count,
      avg_dormant_days,
      by_last_stage,
    };

    logger.info('admission/analytics/reengagement', 'Re-engagement metrics computed', {
      institution_id,
      dormant_count,
      lost_count,
      reengaged_count,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('admission/analytics/reengagement', 'Get reengagement metrics error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
