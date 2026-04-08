export const dynamic = 'force-dynamic';

// app/api/admission/analytics/time-to-convert/route.ts
// GET /api/admission/analytics/time-to-convert?institution_id=X
//
// Returns average and median hours each funnel stage takes from lead creation.
// Uses admission_leads.created_at vs stage_changed_at for current stage timing,
// and created_at vs last_contact_at for the new→contacted transition.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StageTransition {
  from: string;
  to: string;
  avg_hours: number;
  median_hours: number;
  count: number;
}

export interface TimeToConvertData {
  stages: StageTransition[];
  bottleneck: StageTransition | null; // Stage with the highest avg_hours
  generated_at: string;
}

// ── Helper: compute median from sorted numeric array ─────────────────────────

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Helper: hours between two ISO strings ────────────────────────────────────

function hoursBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff / (1000 * 60 * 60);
}

// ── Route Handler ─────────────────────────────────────────────────────────────

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

    // Fetch leads that have progressed beyond 'new' — we need timing data.
    // We pull enough fields to compute transitions without a heavy join.
    let query = supabase
      .from('admission_leads')
      .select(
        'id, created_at, last_contact_at, stage_changed_at, funnel_stage, previous_stage'
      )
      .eq('is_active', true);

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw new Error(`Leads query error: ${leadsError.message}`);

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          stages: [],
          bottleneck: null,
          generated_at: new Date().toISOString(),
        } satisfies TimeToConvertData,
      });
    }

    // ── Build transition buckets ─────────────────────────────────────────────
    //
    // Transition 1: new → contacted
    //   Measured by: last_contact_at - created_at (when counselor first touched lead)
    //
    // Transition 2: contacted → <current_stage>  (for all other stages)
    //   Measured by: stage_changed_at - created_at (time from creation to reaching current stage)
    //   We group by funnel_stage to get average time per stage.
    //
    // This simpler approach avoids requiring a full stage history table
    // while still revealing where leads are getting stuck.

    type HoursBucket = number[];
    const transitionMap: Map<string, { from: string; to: string; hours: HoursBucket }> = new Map();

    // Helper to add a data point
    function addPoint(key: string, from: string, to: string, hours: number) {
      if (hours <= 0) return; // skip invalid/same-time entries
      if (!transitionMap.has(key)) {
        transitionMap.set(key, { from, to, hours: [] });
      }
      transitionMap.get(key)!.hours.push(hours);
    }

    // Ordered funnel stages for display purposes
    const FUNNEL_ORDER: string[] = [
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
      'enrolled',
    ];

    for (const lead of leads) {
      const createdAt = lead.created_at as string | null;
      const contactedAt = lead.last_contact_at as string | null;
      const stageChangedAt = lead.stage_changed_at as string | null;
      const currentStage = lead.funnel_stage as string | null;
      const prevStage = lead.previous_stage as string | null;

      if (!createdAt) continue;

      // Transition: new → contacted
      if (contactedAt) {
        const hrs = hoursBetween(createdAt, contactedAt);
        addPoint('new__contacted', 'new', 'contacted', hrs);
      }

      // Transition: from previous_stage → current_stage (when stage_changed_at exists)
      if (stageChangedAt && currentStage && currentStage !== 'new') {
        const from = prevStage || 'new';
        const key = `${from}__${currentStage}`;
        const hrs = hoursBetween(createdAt, stageChangedAt);
        addPoint(key, from, currentStage, hrs);
      }
    }

    // ── Compute statistics per transition ─────────────────────────────────────

    const stages: StageTransition[] = [];

    for (const [, entry] of transitionMap) {
      if (entry.hours.length === 0) continue;
      const sorted = [...entry.hours].sort((a, b) => a - b);
      const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      stages.push({
        from: entry.from,
        to: entry.to,
        avg_hours: Math.round(avg * 100) / 100,
        median_hours: Math.round(median(sorted) * 100) / 100,
        count: sorted.length,
      });
    }

    // Sort by funnel order (from stage position), then alphabetically for unknowns
    stages.sort((a, b) => {
      const ai = FUNNEL_ORDER.indexOf(a.from);
      const bi = FUNNEL_ORDER.indexOf(b.from);
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      const aj = FUNNEL_ORDER.indexOf(a.to);
      const bj = FUNNEL_ORDER.indexOf(b.to);
      return (aj === -1 ? 999 : aj) - (bj === -1 ? 999 : bj);
    });

    // Identify bottleneck: stage with highest avg_hours and at least 5 leads
    const bottleneck =
      stages
        .filter((s) => s.count >= 5)
        .sort((a, b) => b.avg_hours - a.avg_hours)[0] ?? null;

    const data: TimeToConvertData = {
      stages,
      bottleneck,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('admission/analytics/time-to-convert', 'Query error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
