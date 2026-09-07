export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildScoreListCsv,
  parseCohortResults,
  scoreListFilename,
} from '@/lib/services/onemark/results-service';
import {
  NOT_READY_MESSAGE,
  NO_ACCESS_MESSAGE,
  UUID_RE,
  hasResultsAccess,
  isMissingFunction,
  resultsGate,
} from '../../_shared';

// OneMark — Wave 3 Lane A. The score list as CSV.
//
// GET /api/foundation/onemark/results/[assessmentId]/export -> text/csv
//
// RULING #14 — this file carries learner names and scores and NEVER an answer
// key or an explanation. It is built from the SCORE LIST alone: the cohort
// payload's item rows are not read here, and `buildScoreListCsv` has a closed
// column set (results-service.SCORE_LIST_CSV_COLUMNS) that a unit test pins.
// Access is the RPC's decision, exactly as on the sheet itself.

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
      if (error.code === '42501') {
        return NextResponse.json({ error: NO_ACCESS_MESSAGE }, { status: 403 });
      }
      throw error;
    }
    if (data === null || data === undefined) {
      return NextResponse.json({ error: 'That paper does not exist.' }, { status: 404 });
    }

    const results = parseCohortResults(data);
    const csv = buildScoreListCsv(results);
    // A leading BOM so Excel opens a name in any script as UTF-8.
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${scoreListFilename(results)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[onemark/results/[assessmentId]/export] GET failed', err);
    return NextResponse.json(
      { error: 'Could not build the score list. Please try again.' },
      { status: 500 },
    );
  }
}
