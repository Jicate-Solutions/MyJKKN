export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Foundation Programme — how one practice run went.
//
// GET /api/foundation/practice/attempts/<attemptId>
//   -> { score, total, correct, questions: [...] }
//
// Only reachable AFTER submission, which is when revealing answers and
// explanations becomes the point rather than a leak.
//
// CORRECTNESS IS READ, NEVER RECOMPUTED.
// fp_responses.is_correct was written by fn_fp_record_attempt at grading time
// and is the only authority on whether an answer was right. This route reports
// it. It does not re-run the comparison — a second implementation of grading
// would agree with itself right up until the day it quietly disagreed with the
// database, and the learner would be shown a mark the record does not hold.
//
// The one thing derived here is which option to LABEL as the right one, for
// display. fp_items.answer is stored either bare ("A") or wrapped
// ({"correct":"A"}); both shapes exist in the bank, so both are unwrapped, the
// same way fn_fp_record_attempt unwraps them.
//
// Access is RLS's decision: fp_attempts is gated on fn_fp_can_view_student and
// fp_responses on fn_fp_can_view_attempt, both of which admit the learner
// themself, their guardian, whoever teaches them, and the school's owner. An
// attempt belonging to somebody else simply does not come back.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Upper bound on the `skipped` list, so the query string cannot be used to
 *  dump the bank one id at a time. A practice run is ~10 questions. */
const MAX_SKIPPED = 50;

/** Fallback run size, mirroring the questions route. */
const DEFAULT_QUESTION_COUNT = 10;

/** Unwrap {"correct": X} to X; leave a bare value alone. Mirrors the RPC. */
function normaliseAnswer(answer: any): any {
  if (
    answer !== null &&
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    'correct' in answer
  ) {
    return answer.correct;
  }
  return answer;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  await connection();
  try {
    const { attemptId } = await params;
    if (!UUID_RE.test(attemptId)) {
      return NextResponse.json(
        { error: 'attemptId must be a uuid' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS decides visibility. Nothing back = not yours to see; say the same
    // thing either way rather than confirming the attempt exists.
    const { data: attempt } = await (supabase as any)
      .from('fp_attempts')
      .select('id, student_id, assessment_id, score, submitted_at')
      .eq('id', attemptId)
      .maybeSingle();

    if (!attempt) {
      return NextResponse.json(
        { error: 'That practice run could not be found.' },
        { status: 404 },
      );
    }

    const { data: responses, error: responsesError } = await (supabase as any)
      .from('fp_responses')
      .select('item_id, chosen, is_correct, time_ms')
      .eq('attempt_id', attemptId);

    if (responsesError) {
      return NextResponse.json(
        { error: responsesError.message },
        { status: 400 },
      );
    }

    const rows = responses ?? [];
    const answeredIds = rows.map((r: any) => r.item_id);

    // Questions the learner was shown but left blank. They are NOT recorded as
    // responses — a blank must not drag the score or the mastery average down,
    // and the only reliable way to guarantee that in both places at once is for
    // the row never to exist. But the moment a learner sees what they skipped
    // and why is the most useful moment on this screen, so the client hands the
    // ids back here and they are rendered alongside, clearly ungraded.
    // This parameter is caller-supplied, and it makes the route reveal an
    // answer key for an item the caller merely NAMES. Left uncapped that is a
    // way to dump the bank: collect ids from a few runs, then ask for all of
    // them at once. The cap below is what makes it safe — answered + skipped can
    // never exceed ONE run's worth of questions, so this returns nothing the
    // caller could not have obtained by answering that run and reading the
    // review. The leak is not "reduced"; the delta is zero.
    const admin = createServiceRoleClient();

    let runSize = DEFAULT_QUESTION_COUNT;
    const { data: configuredCount } = await (admin as any).rpc(
      'fn_get_policy_int',
      {
        p_key: 'foundation.practice.question_count',
        p_default: DEFAULT_QUESTION_COUNT,
      },
    );
    if (typeof configuredCount === 'number' && configuredCount > 0) {
      runSize = configuredCount;
    }

    const skippedBudget = Math.max(0, Math.min(MAX_SKIPPED, runSize - rows.length));

    // `new URL(request.url)` rather than `request.nextUrl`: the query string is
    // all this needs, and depending on the plain Request contract keeps the
    // handler drivable by anything that can build a Request.
    const skipped = new URL(request.url).searchParams.get('skipped') ?? '';

    const skippedIds = skipped
      .split(',')
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s) && !answeredIds.includes(s))
      .slice(0, skippedBudget);

    const allIds = [...answeredIds, ...skippedIds];

    // Now — and only now — the answer key and the explanation are the payload.
    const { data: items } = allIds.length
      ? await (admin as any)
          .from('fp_items')
          .select('id, stem, options, answer, explanation')
          .in('id', allIds)
      : { data: [] };

    const byId = new Map((items ?? []).map((it: any) => [it.id, it]));

    const shape = (itemId: string, chosen: any, isCorrect: boolean | null) => {
      const item: any = byId.get(itemId);
      return {
        itemId,
        stem: item?.stem ?? 'This question is no longer in the bank.',
        options: item?.options ?? [],
        chosen,
        correctAnswer: normaliseAnswer(item?.answer),
        isCorrect,
        explanation: item?.explanation ?? null,
      };
    };

    const questions = [
      ...rows.map((r: any) => shape(r.item_id, r.chosen, r.is_correct)),
      ...skippedIds.map((id) => shape(id, null, null)),
    ];

    const correct = rows.filter((r: any) => r.is_correct === true).length;

    return NextResponse.json({
      attemptId: attempt.id,
      score: attempt.score,
      submittedAt: attempt.submitted_at,
      // `total` is what was ANSWERED, which is what the score divides by.
      // Skipped questions are reported separately rather than folded in, so
      // "3 of 7" can never be mistaken for "3 of 10".
      total: rows.length,
      correct,
      skipped: skippedIds.length,
      questions,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load your results' },
      { status: 500 },
    );
  }
}
