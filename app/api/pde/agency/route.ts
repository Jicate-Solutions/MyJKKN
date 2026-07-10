export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEAgencyLiveService } from '@/lib/services/pde-agency-live-service';
import { getAgencyIndexMode } from '@/lib/services/pde-policy-reader';
import type { AgencyLevel } from '@/types/pde';

// GET /api/pde/agency?learnerId=xxx&courseId=xxx
// Also supports mode=trends for historical data.
//
// Honours `pde.visibility.agency_index_mode` policy (Tier-2 T2.8):
//   - 'semester_end' -> snapshot row from pde_agency_index, or null
//   - 'live' / 'live_coarse' -> `overall` recomputed from pde_demonstrations,
//                               tagged with mode/source so the client polls
//
// RESPONSE CONTRACT
// `data` is either a pde_agency_index row shape (overall, level, initiative,
// self_direction, tool_mastery, critical_evaluation, ethical_judgment), an
// overall-only object `{ overall, level }` when a live score exists with no
// snapshot to draw dimensions from, or `null`. It is never a foreign shape:
// this route used to return `{overall_score, consistency_score, depth_score,
// ...}` from a local computeBasicAgencyIndex(), whose field names exist on no
// table, type, or component — so `AgencyIndexCard` rendered `NaN` bars and a
// false "Dependent" badge for every learner.
//
// `has_data` distinguishes "this learner has produced nothing measurable" from
// "this learner genuinely scored 0". Without it both arrive as `overall: 0`,
// and a bare zero reads to a learner as a judgement rather than an empty state.

/**
 * Canonical Agency-Index bands. Mirrors PDEService.calculateAgencyIndex so a
 * live-computed score is labelled the same way a snapshot row would be.
 */
function deriveLevel(overall: number): AgencyLevel {
  if (overall >= 80) return 'principal';
  if (overall >= 60) return 'self_directed';
  if (overall >= 40) return 'independent';
  if (overall >= 20) return 'directed';
  return 'dependent';
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const mode = searchParams.get('mode');

    // Own index only. RLS already bounds a learner to their own rows, but
    // `pde_demonstrations_faculty_same_inst` lets any faculty-role user read
    // every demonstration in their institution — so an unchecked `learnerId`
    // would let a facilitator enumerate real Agency Index scores for learners
    // they have never taught. Harmless while every score was 0; not harmless
    // now that they are real. Scoped cross-learner reads belong in a dedicated
    // SECURITY DEFINER RPC bound to teaching assignments, not in this param.
    const requestedLearnerId = searchParams.get('learnerId') ?? user.id;
    if (requestedLearnerId !== user.id) {
      return NextResponse.json(
        { error: 'You can only read your own Agency Index.' },
        { status: 403 }
      );
    }
    const learnerId = user.id;

    if (mode === 'trends') {
      // Historical snapshots. Empty until a semester-end snapshot is written.
      let query = (supabase as any)
        .from('pde_agency_index')
        .select('*')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: true });

      if (courseId) query = query.eq('course_id', courseId);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      return NextResponse.json({ data: rows, has_data: rows.length > 0 });
    }

    // Latest snapshot, if one exists.
    let query = (supabase as any)
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query;
    if (error) throw error;

    const latest = data?.[0] || null;
    const visibilityMode = await getAgencyIndexMode();

    if (visibilityMode === 'semester_end') {
      return NextResponse.json({
        data: latest,
        mode: visibilityMode,
        source: 'snapshot',
        has_data: latest !== null,
      });
    }

    // live / live_coarse — recompute `overall` from scored demonstrations.
    const live = await PDEAgencyLiveService.recomputeForLearner(learnerId);

    // `fell_back_to_snapshot` means the recompute found no scored
    // demonstrations in the window. With no snapshot to fall back on either,
    // the returned 0 is an absence of evidence, not a score of zero.
    const hasData = !(live.fell_back_to_snapshot && !latest);

    return NextResponse.json({
      data: latest
        ? { ...latest, overall: live.agency_score }
        : { overall: live.agency_score, level: deriveLevel(live.agency_score) },
      mode: visibilityMode,
      source: live.source,
      has_data: hasData,
    });
  } catch (error: any) {
    console.error('Error fetching agency index:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// NOTE: the POST handler and its computeBasicAgencyIndex() helper were removed.
// POST had zero callers, inserted columns that do not exist on pde_agency_index
// (`overall_score`, `consistency_score`, `depth_score`, ...) so it would have
// 500'd on first use, and was the only writer into a table whose
// `agency_admin_read` policy grants every admin/super_admin/hod a
// cross-institution read. Snapshots should be written by a scoring engine, not
// by an unauthenticated-shaped client POST.
