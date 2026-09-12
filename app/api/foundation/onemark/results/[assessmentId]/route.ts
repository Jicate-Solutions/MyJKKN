export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseCohortResults } from '@/lib/services/onemark/results-service';
import {
  NOT_READY_MESSAGE,
  NO_ACCESS_MESSAGE,
  UUID_RE,
  hasResultsAccess,
  isMissingFunction,
  readMinLearners,
  resultsGate,
} from '../_shared';

// OneMark — Wave 3 Lane A. One cohort sheet.
//
// GET /api/foundation/onemark/results/[assessmentId] -> { results }
//
// The payload is Lane S3's `fn_onemark_cohort_results(p_assessment_id)`,
// normalized by lib/services/onemark/results-service. THE RPC OWNS THE ACCESS
// DECISION: it admits a holder of foundation.assessments.manage who manages the
// cohort's school AND — Wave 3 ruling #1 — a principal who holds only a
// school_jkkn_owners row ("an active `school_jkkn_owners` row alone grants read
// of every results sheet for that school, with no `assessments.manage`
// required"; `specs/onemark-wave3-2026-09-06.md`, "## Rulings of 2026-09-06",
// row 1). This route therefore refuses only the caller who has neither door at
// all, and otherwise lets the database's 42501 through as a 403. Nothing here
// narrows what the RPC allows.
//
// PRIVACY IS ENFORCED HERE, NOT IN THE BROWSER. Wave 3 ruling #9 hides
// per-question numbers below `onemark.results.min_learners_for_item_stats` (3)
// because "a single row identifies a person". A client-side gate leaves the
// per-question p-values and the top distractor of a one-learner cohort sitting
// in the raw JSON, readable from the Network tab or by curl with the caller's
// own session — which reconstructs that one learner's right/wrong pattern
// question by question, exactly what the rule exists to prevent. So the server
// EMPTIES `items` below the threshold and says it did (`items_withheld`); the
// score list, which the ruling says always shows, is untouched.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ assessmentId: string }> }) {
  await connection();
  try {
    const { assessmentId } = await params;
    if (!UUID_RE.test(assessmentId)) {
      return NextResponse.json({ error: 'assessmentId must be a uuid' }, { status: 400 });
    }

    const supabase = await createClient();
    const gate = await resultsGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasResultsAccess(gate)) {
      return NextResponse.json({ error: NO_ACCESS_MESSAGE }, { status: 403 });
    }

    const { data, error } = await supabase.rpc('fn_onemark_cohort_results', {
      p_assessment_id: assessmentId,
    });

    if (error) {
      if (isMissingFunction(error)) {
        return NextResponse.json({ error: NOT_READY_MESSAGE }, { status: 503 });
      }
      // 42501 is the RPC's own authorization raise; P0002 is "no such paper".
      if (error.code === '42501') {
        return NextResponse.json({ error: NO_ACCESS_MESSAGE }, { status: 403 });
      }
      if (error.code === 'P0002' || error.code === '02000') {
        return NextResponse.json({ error: 'That paper does not exist.' }, { status: 404 });
      }
      throw error;
    }
    if (data === null || data === undefined) {
      return NextResponse.json({ error: 'That paper does not exist.' }, { status: 404 });
    }

    const results = parseCohortResults(data);
    const policyThreshold = await readMinLearners(supabase);
    const withheld = results.learners_sat < policyThreshold;
    return NextResponse.json({
      results: {
        ...results,
        min_learners_for_item_stats: policyThreshold,
        items: withheld ? [] : results.items,
        items_withheld: withheld,
      },
      ...(withheld
        ? {
            items_withheld_reason: `Per-question numbers are hidden until ${policyThreshold} learners have submitted — below that, a single row identifies a person.`,
          }
        : {}),
    });
  } catch (err) {
    console.error('[onemark/results/[assessmentId]] GET failed', err);
    return NextResponse.json(
      { error: 'Could not load this cohort sheet. Please try again.' },
      { status: 500 },
    );
  }
}
