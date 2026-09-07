export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OneMarkExamKeys } from '@/types/onemark';
import { UUID_RE, isMissingObject, loadOneMarkExams, sourceGate } from '../_shared';
import {
  MAX_EXAM_YEAR_LOOKAHEAD,
  MIN_EXAM_YEAR,
  MIN_SEARCH_LENGTH,
  isInvalid,
  normalizeSearch,
  normalizeSitting,
  questionPreview,
  validateNewHit,
  type TaggableQuestion,
} from '@/lib/services/onemark/sources-board-paper';

// OneMark — after the real board paper: which of our questions turned up?
//
// GET  /api/foundation/onemark/sources/board-paper?exam=<uuid>&year=<int>&sitting=&q=<text>
//        -> subjects, the ticks already recorded for that year, and (with q)
//           the bank questions whose wording matches
// POST /api/foundation/onemark/sources/board-paper
//        -> { exam_definition_id, exam_year, sitting?, item_id, match_kind, board_qno?, note? }
//
// Gate: `foundation.items.manage` on both verbs — this is a question author's
// once-a-year job, done with the real paper in hand.
//
// DEPENDS ON LANE S3 (migration 20260919120000, NOT YET APPLIED):
// `onemark_board_paper_hits`. Until it exists, GET reports `available: false`
// and the screen says "not set up yet" rather than showing a database error.
//
// The response never carries an answer or an explanation — only the stem, which
// is the thing being compared against the printed paper.

const HIT_COLUMNS =
  'id, exam_definition_id, exam_year, sitting, item_id, match_kind, board_qno, note, noted_by, noted_at';

const ONEMARK_EXAM_KEYS = [OneMarkExamKeys.PHYSICS, OneMarkExamKeys.ENGLISH];

const SEARCH_LIMIT = 40;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!gate.canManage) {
      return NextResponse.json(
        { error: 'Only a question author can record what appeared in the real board paper.' },
        { status: 403 },
      );
    }

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
        hits: [],
        questions: [],
      });
    }

    const yearRaw = sp.get('year');
    const year = yearRaw === null || yearRaw === '' ? null : Number(yearRaw);
    if (year !== null && (!Number.isInteger(year) || year < MIN_EXAM_YEAR || year > maxYear)) {
      return NextResponse.json({ error: 'year is out of range' }, { status: 400 });
    }
    const sitting = normalizeSitting(sp.get('sitting'));

    let hitQuery = supabase
      .from('onemark_board_paper_hits')
      .select(HIT_COLUMNS)
      .eq('exam_definition_id', examId)
      .order('noted_at', { ascending: false })
      .limit(500);
    if (year !== null) hitQuery = hitQuery.eq('exam_year', year);
    const hitRes = await hitQuery;

    // Lane S3's table is not in the database yet. That is a known state, not a
    // failure: say so plainly and let the screen render the honest empty page.
    if (hitRes.error && isMissingObject(hitRes.error)) {
      return NextResponse.json({
        exams,
        year_range: { min: MIN_EXAM_YEAR, max: maxYear },
        available: false,
        reason:
          'Recording board-paper matches is not switched on yet — the table it writes to has not been added to the database.',
        hits: [],
        questions: [],
      });
    }
    if (hitRes.error) return NextResponse.json({ error: hitRes.error.message }, { status: 400 });

    const search = normalizeSearch(sp.get('q'));
    let questions: TaggableQuestion[] = [];
    if (search) {
      const { data, error } = await supabase
        .from('fp_items')
        .select('id, stem, source_key, source_year, is_active')
        .eq('exam_definition_id', examId)
        .ilike('stem', `%${search}%`)
        .order('created_at')
        .limit(SEARCH_LIMIT);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      questions = (data ?? []).map((r: TaggableQuestion) => ({
        id: r.id,
        stem: questionPreview(r.stem),
        source_key: r.source_key ?? null,
        source_year: r.source_year ?? null,
        is_active: r.is_active === true,
      }));
    }

    return NextResponse.json({
      exams,
      year_range: { min: MIN_EXAM_YEAR, max: maxYear },
      available: true,
      exam_definition_id: examId,
      exam_year: year,
      sitting,
      hits: hitRes.data ?? [],
      questions,
      search_min_length: MIN_SEARCH_LENGTH,
      search_limit: SEARCH_LIMIT,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The board-paper record could not be read.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!gate.canManage) {
      return NextResponse.json(
        { error: 'Only a question author can record what appeared in the real board paper.' },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    const checked = validateNewHit(body, new Date().getUTCFullYear());
    if (isInvalid(checked)) return NextResponse.json({ error: checked.error }, { status: 400 });

    const { data, error } = await supabase
      .from('onemark_board_paper_hits')
      .insert({ ...checked.value, noted_by: gate.userId })
      .select(HIT_COLUMNS)
      .single();

    if (error) {
      if (isMissingObject(error)) {
        return NextResponse.json(
          {
            error:
              'Recording board-paper matches is not switched on yet — the table it writes to has not been added to the database.',
          },
          { status: 503 },
        );
      }
      // One tick per (question, year, sitting): the second is not a failure to
      // explain away, it is the record already saying what the person meant.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That question is already recorded for this board year and sitting.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ hit: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The match could not be recorded.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
