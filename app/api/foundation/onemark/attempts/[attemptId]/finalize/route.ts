export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  ATTEMPT_COLUMNS,
  UUID_RE,
  admin as adminClient,
  closeSitting,
  liveBlankItemIds,
  normaliseAnswer,
  resolveCaller,
  sittingQuestionCount,
  verifyServedSet,
  type AttemptRow,
} from '@/lib/services/onemark/attempt-server';

// OneMark — close a sitting and show how it went.
//
// POST /api/foundation/onemark/attempts/<attemptId>/finalize
//   body { skippedItemIds?: uuid[] }   // what was still blank when time ran out
//   -> { attemptId, mode, score, correct, answered, skipped, questions[] }
//
// Blank questions are recorded as SKIPPED responses through the same RPC that
// records answers (skipped = true), so they neither count as wrong nor enter
// the vault (decision 18). Then fn_onemark_finalize_attempt (Lane S) stamps
// submitted_at, sets score = count(is_correct) and status = 'submitted', and
// REFUSES a second call (decision 19 — single submission, server-side). A
// refused second call is answered here with 409 plus the stored result, so a
// learner who tries again sees their score rather than an error.
//
// WHICH BLANKS ARE ACCEPTED
//   live      the paper is a fixed list (fp_assessment_items), so the blanks
//             are DERIVED here — every paper question without a response —
//             and the caller's list is ignored. Nothing off the paper can be
//             named into the review.
//   others    the draw is not persisted (fp_attempts has no column for it),
//             so it is BOUND to the attempt by the signed servedToken the
//             attempts route minted: every named blank must be in that set,
//             then filtered to active, same-subject, not-yet-answered items
//             and CAPPED at one sitting's worth (onemark.paper.question_count).
//
// CORRECTNESS IS READ, NEVER RECOMPUTED. fp_responses.is_correct was written
// by the RPC; this route reports it. The answer key and explanations are the
// payload here because the sitting is over — the review is the point.
//
// RUNTIME DEPENDS ON LANE S — fn_onemark_record_response and
// fn_onemark_finalize_attempt.

interface FinalizeBody {
  skippedItemIds?: unknown;
  /** The signed served set from POST /attempts. Required whenever blanks are
   *  named on a practice / timed / vault-review sitting. */
  servedToken?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  await connection();
  try {
    const { attemptId } = await params;
    if (!UUID_RE.test(attemptId)) {
      return NextResponse.json({ error: 'attemptId must be a uuid' }, { status: 400 });
    }

    let body: FinalizeBody = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }
    const namedSkips = Array.isArray(body.skippedItemIds)
      ? (body.skippedItemIds as unknown[]).filter(
          (s): s is string => typeof s === 'string' && UUID_RE.test(s),
        )
      : [];

    const caller = await resolveCaller();
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status });
    }
    if (!caller.learner) {
      return NextResponse.json(
        { error: 'You are not enrolled on the Foundation programme.' },
        { status: 403 },
      );
    }
    const supabase = caller.supabase;
    const admin = adminClient();

    const { data: attempt } = (await (supabase as any)
      .from('fp_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('id', attemptId)
      .maybeSingle()) as { data: AttemptRow | null };
    if (!attempt || attempt.student_id !== caller.learner.id) {
      return NextResponse.json({ error: 'That sitting could not be found.' }, { status: 404 });
    }

    let alreadySubmitted = attempt.status === 'submitted';

    if (!alreadySubmitted) {
      // ---- Which questions were left blank ----------------------------------
      let blanks: string[] = [];
      if (attempt.mode === 'live') {
        blanks = await liveBlankItemIds(admin, attempt);
      } else if (namedSkips.length > 0) {
        // Every named blank must be inside the signed served set — one id
        // outside it and the whole request is refused, because the only
        // client that names blanks is the runner, and it only ever names
        // what it was served.
        const served = verifyServedSet(attempt.id, body.servedToken);
        if (!served) {
          return NextResponse.json(
            { error: 'This sitting could not be verified. Please reopen it and try again.' },
            { status: 400 },
          );
        }
        if (namedSkips.some((id) => !served.has(id))) {
          return NextResponse.json(
            { error: 'A question named as blank is not part of this sitting.' },
            { status: 400 },
          );
        }
        const cap = await sittingQuestionCount(admin);
        const requested = new Set(namedSkips.slice(0, cap));
        const { data: assessment } = await admin
          .from('fp_assessments')
          .select('id, exam_definition_id')
          .eq('id', attempt.assessment_id)
          .maybeSingle();
        const { data: existing } = await admin
          .from('fp_responses')
          .select('item_id')
          .eq('attempt_id', attempt.id);
        const done = new Set((existing ?? []).map((r: any) => r.item_id));
        const { data: candidates } = await admin
          .from('fp_items')
          .select('id, exam_definition_id, is_active')
          .in('id', [...requested]);
        blanks = (candidates ?? [])
          .filter(
            (it: any) =>
              requested.has(it.id) &&
              it.is_active &&
              assessment &&
              it.exam_definition_id === assessment.exam_definition_id &&
              !done.has(it.id),
          )
          .map((it: any) => it.id as string)
          .slice(0, cap);
      }

      // ---- Skips in, then close, via Lane S's RPCs ---------------------------
      const outcome = await closeSitting(supabase, attempt.id, blanks);
      if (outcome.error) {
        return NextResponse.json(
          { error: outcome.error.message },
          { status: outcome.error.status },
        );
      }
      alreadySubmitted = outcome.alreadySubmitted;
    }

    // ---- The review ------------------------------------------------------------
    const { data: closed } = (await (supabase as any)
      .from('fp_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('id', attempt.id)
      .maybeSingle()) as { data: AttemptRow | null };

    const { data: responses, error: responsesError } = await (supabase as any)
      .from('fp_responses')
      .select('item_id, chosen, is_correct, time_ms, skipped, created_at')
      .eq('attempt_id', attempt.id)
      .order('created_at', { ascending: true });
    if (responsesError) {
      return NextResponse.json({ error: responsesError.message }, { status: 400 });
    }
    const rows = responses ?? [];
    const ids = rows.map((r: any) => r.item_id);

    // Now — and only now — the answer key and the explanation are the payload.
    const { data: items } = ids.length
      ? await admin
          .from('fp_items')
          .select('id, stem, stem_ta, options, options_ta, answer, explanation, explanation_ta')
          .in('id', ids)
      : { data: [] };
    const byId = new Map((items ?? []).map((it: any) => [it.id, it]));

    const questions = rows.map((r: any) => {
      const item: any = byId.get(r.item_id);
      return {
        itemId: r.item_id,
        stem: item?.stem ?? 'This question is no longer in the bank.',
        stemTa: item?.stem_ta ?? null,
        options: item?.options ?? [],
        optionsTa: item?.options_ta ?? null,
        chosen: r.chosen,
        skipped: r.skipped === true,
        isCorrect: r.skipped === true ? null : r.is_correct,
        correctAnswer: normaliseAnswer(item?.answer),
        explanation: item?.explanation ?? null,
        explanationTa: item?.explanation_ta ?? null,
        timeMs: r.time_ms ?? null,
      };
    });

    const answered = rows.filter((r: any) => r.skipped !== true).length;
    const skipped = rows.length - answered;
    const correct = rows.filter((r: any) => r.skipped !== true && r.is_correct === true).length;

    const payload = {
      attemptId: attempt.id,
      mode: attempt.mode,
      submittedAt: closed?.submitted_at ?? attempt.submitted_at,
      // The RPC's score is count(is_correct); reported as stored. NOTE the
      // unit: fp_attempts.score is a 0..1 RATIO on legacy Foundation rows
      // (fn_fp_record_attempt) and a COUNT on OneMark rows (mode NOT NULL).
      // Said out loud here so no reader averages the two.
      score: closed?.score ?? attempt.score ?? correct,
      scoreUnit: 'correct_count',
      correct,
      answered,
      skipped,
      total: rows.length,
      alreadySubmitted,
      questions,
    };

    return NextResponse.json(payload, { status: alreadySubmitted ? 409 : 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not close the sitting' },
      { status: 500 },
    );
  }
}
