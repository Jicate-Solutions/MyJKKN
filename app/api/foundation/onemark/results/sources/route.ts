export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OneMarkExamKeys } from '@/types/onemark';
import {
  UUID_RE,
  isForbidden,
  isMissingObject,
  loadOneMarkExams,
} from '../../sources/_shared';
import { parseSourceAnalytics } from '@/lib/services/onemark/sources-analytics';
import { UNRECORDED_SOURCE_LABEL } from '@/lib/services/onemark/sources-service';
import { MIN_EXAM_YEAR, MAX_EXAM_YEAR_LOOKAHEAD } from '@/lib/services/onemark/sources-board-paper';

// OneMark — did each question source earn its place?
//
// GET /api/foundation/onemark/results/sources?exam=<uuid>&year=<int>
//
// One call, straight to Lane S3's `fn_onemark_source_analytics`. The arithmetic
// — board hits, hit rate, the median-split lift and the floor that hides it
// below three learners (ruling #9) — all lives in the database, where it can see
// every sitting. This route resolves the subject list, calls the function
// through the SESSION client, and hands the payload on.
//
// THE GATE IS THE FUNCTION'S OWN, and it is an OR, not an AND (ruling #1 of
// 2026-09-06): `foundation.assessments.manage`, OR an active `school_jkkn_owners`
// row on its own — a principal reading their own school's evidence needs no
// paper-building permission. Duplicating that test here would be a second,
// drifting copy of a rule that already has an owner, so this route does not
// re-check it: a refusal from the function is passed through as a 403 with the
// reason, never as a silent empty list (CLAUDE.md #27).
//
// DEPENDS ON LANE S3 (migration 20260919120000, NOT YET APPLIED). Until it is,
// the response is `available: false` with a plain sentence, and the screen says
// "not set up yet" instead of showing a red error.

const ONEMARK_EXAM_KEYS = [OneMarkExamKeys.PHYSICS, OneMarkExamKeys.ENGLISH];

const NOT_SET_UP =
  'Source evidence is not switched on yet — the analysis it reads has not been added to the database.';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const examId = sp.get('exam');
    if (examId && !UUID_RE.test(examId)) {
      return NextResponse.json({ error: 'exam must be a uuid' }, { status: 400 });
    }

    const exams = await loadOneMarkExams(supabase, ONEMARK_EXAM_KEYS);
    const maxYear = new Date().getUTCFullYear() + MAX_EXAM_YEAR_LOOKAHEAD;

    if (!examId) {
      return NextResponse.json({
        exams,
        year_range: { min: MIN_EXAM_YEAR, max: maxYear },
        available: true,
        analytics: null,
      });
    }

    const yearRaw = sp.get('year');
    const year = yearRaw === null || yearRaw === '' ? null : Number(yearRaw);
    if (year !== null && (!Number.isInteger(year) || year < MIN_EXAM_YEAR || year > maxYear)) {
      return NextResponse.json({ error: 'year is out of range' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('fn_onemark_source_analytics', {
      p_exam_definition_id: examId,
      p_exam_year: year,
    });

    if (error) {
      if (isMissingObject(error)) {
        return NextResponse.json({
          exams,
          year_range: { min: MIN_EXAM_YEAR, max: maxYear },
          available: false,
          reason: NOT_SET_UP,
          analytics: null,
        });
      }
      if (isForbidden(error)) {
        return NextResponse.json(
          {
            error:
              'You do not have access to this evidence. It is open to a Senior Learner who builds papers, and to anyone who owns a school in the network.',
          },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      exams,
      year_range: { min: MIN_EXAM_YEAR, max: maxYear },
      available: true,
      analytics: parseSourceAnalytics(data, { unrecordedLabel: UNRECORDED_SOURCE_LABEL }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The source evidence could not be read.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
