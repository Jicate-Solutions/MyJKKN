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
  _request: NextRequest,
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
    const itemIds = rows.map((r: any) => r.item_id);

    // Now — and only now — the answer key and the explanation are the payload.
    const admin = createServiceRoleClient();
    const { data: items } = itemIds.length
      ? await (admin as any)
          .from('fp_items')
          .select('id, stem, options, answer, explanation')
          .in('id', itemIds)
      : { data: [] };

    const byId = new Map((items ?? []).map((it: any) => [it.id, it]));

    const questions = rows.map((r: any) => {
      const item: any = byId.get(r.item_id);
      return {
        itemId: r.item_id,
        stem: item?.stem ?? 'This question is no longer in the bank.',
        options: item?.options ?? [],
        chosen: r.chosen,
        correctAnswer: normaliseAnswer(item?.answer),
        isCorrect: r.is_correct,
        explanation: item?.explanation ?? null,
      };
    });

    const correct = rows.filter((r: any) => r.is_correct === true).length;

    return NextResponse.json({
      attemptId: attempt.id,
      score: attempt.score,
      submittedAt: attempt.submitted_at,
      total: rows.length,
      correct,
      questions,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load your results' },
      { status: 500 },
    );
  }
}
