export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  ALREADY_SUBMITTED,
  ATTEMPT_COLUMNS,
  DEADLINE_GRACE_MS,
  RPC_MISSING,
  UUID_RE,
  admin as adminClient,
  deadlineFor,
  normaliseAnswer,
  resolveCaller,
  timedMinutes,
  verifyServedSet,
  type AttemptRow,
} from '@/lib/services/onemark/attempt-server';

// OneMark — record one answer (or one skip) on an open sitting.
//
// POST /api/foundation/onemark/attempts/<attemptId>/respond
//   body { itemId: uuid, chosen?: string, skipped?: boolean, timeMs?: number }
//   -> { isCorrect, vaultStatus, streak, reveal? }
//
// CORRECTNESS IS THE RPC'S VERDICT, NEVER COMPUTED HERE.
// fn_onemark_record_response (Lane S) is SECURITY DEFINER: it checks the caller
// owns the attempt, compares `chosen` with fp_items.answer, writes fp_responses,
// bumps times_served / times_correct and moves the Mistake Vault (decisions
// 9 / 10 / 18). It is called through the SESSION client so that check runs as
// the caller. This route only validates the request and shapes the reply.
//
// THE ANSWER IS RELEASED ONLY AFTER THE RESPONSE IS RECORDED, and only in the
// modes that show it question by question (practice, vault review). Timed and
// live sittings get the verdict at the end, from the finalize route.
//
// A skipped question is not a wrong one (decision 18): `skipped: true` is passed
// through to the RPC, which keeps it out of the vault.
//
// RUNTIME DEPENDS ON LANE S — until fn_onemark_record_response exists the RPC
// call fails and this route answers 503 with a plain sentence.

interface RespondBody {
  itemId?: string;
  chosen?: unknown;
  skipped?: boolean;
  timeMs?: number;
  /** The signed served set from POST /attempts. Required unless mode = live. */
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

    let body: RespondBody = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }
    if (!body.itemId || !UUID_RE.test(body.itemId)) {
      return NextResponse.json({ error: 'itemId must be a uuid' }, { status: 400 });
    }
    const skipped = body.skipped === true;
    const chosen =
      skipped || body.chosen === undefined || body.chosen === null
        ? null
        : typeof body.chosen === 'string' || typeof body.chosen === 'number'
          ? body.chosen
          : null;
    if (!skipped && chosen === null) {
      return NextResponse.json(
        { error: 'chosen is required unless the question is skipped' },
        { status: 400 },
      );
    }
    const timeMs =
      typeof body.timeMs === 'number' && Number.isFinite(body.timeMs) && body.timeMs >= 0
        ? Math.min(Math.round(body.timeMs), 6 * 60 * 60 * 1000)
        : null;

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

    // RLS decides visibility (fn_fp_can_view_student). Nothing back = not
    // yours; say the same thing either way.
    const { data: attempt } = (await (supabase as any)
      .from('fp_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('id', attemptId)
      .maybeSingle()) as { data: AttemptRow | null };
    if (!attempt || attempt.student_id !== caller.learner.id) {
      return NextResponse.json({ error: 'That sitting could not be found.' }, { status: 404 });
    }
    if (attempt.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'This sitting has already been submitted.', alreadySubmitted: true },
        { status: 409 },
      );
    }

    // ---- The item must belong to this sitting --------------------------------
    // A response can only be recorded against a question this sitting DID
    // show. For practice / timed / vault review that is the signed served set
    // minted when the questions were drawn; for a live paper it is
    // fp_assessment_items (checked below). Either way the answer key of an
    // item that was never served cannot be reached through this route.
    if (attempt.mode !== 'live') {
      const served = verifyServedSet(attempt.id, body.servedToken);
      if (!served) {
        return NextResponse.json(
          { error: 'This sitting could not be verified. Please reopen it and try again.' },
          { status: 400 },
        );
      }
      if (!served.has(body.itemId)) {
        return NextResponse.json({ error: 'That question is not part of this sitting.' }, { status: 400 });
      }
    }
    const { data: assessment } = await admin
      .from('fp_assessments')
      .select('id, exam_definition_id, config')
      .eq('id', attempt.assessment_id)
      .maybeSingle();
    const { data: item } = await admin
      .from('fp_items')
      .select('id, exam_definition_id, is_active, answer, explanation, explanation_ta')
      .eq('id', body.itemId)
      .maybeSingle();
    if (
      !assessment ||
      !item ||
      !item.is_active ||
      item.exam_definition_id !== assessment.exam_definition_id
    ) {
      return NextResponse.json({ error: 'That question is not part of this sitting.' }, { status: 400 });
    }
    if (attempt.mode === 'live') {
      const { data: onPaper } = await admin
        .from('fp_assessment_items')
        .select('id')
        .eq('assessment_id', assessment.id)
        .eq('item_id', item.id)
        .maybeSingle();
      if (!onPaper) {
        return NextResponse.json({ error: 'That question is not on this paper.' }, { status: 400 });
      }
    }

    // ---- The clock -------------------------------------------------------------
    // After the deadline (plus a little slack for the last tap) an ANSWER is
    // refused; a SKIP is still accepted, because that is exactly what the
    // auto-submit does with whatever was left blank (decision 18).
    if (!skipped) {
      const deadline = deadlineFor(attempt, {
        timedMinutes: await timedMinutes(admin),
        assessmentConfig: assessment.config,
      });
      if (deadline !== null && Date.now() > deadline + DEADLINE_GRACE_MS) {
        return NextResponse.json(
          { error: 'Time is up for this sitting.', expired: true },
          { status: 409 },
        );
      }
    }

    // ---- Record, via Lane S's RPC ------------------------------------------------
    const { data: verdict, error: rpcError } = await (supabase as any).rpc(
      'fn_onemark_record_response',
      {
        p_attempt_id: attempt.id,
        p_item_id: item.id,
        p_chosen: chosen,
        p_skipped: skipped,
        p_time_ms: timeMs,
      },
    );
    if (rpcError) {
      const msg = rpcError.message ?? '';
      // The RPC's own refusals, told apart so the runner can act on them:
      // a closed attempt (decision 19) is "already submitted", not a retry.
      if (ALREADY_SUBMITTED.test(msg)) {
        return NextResponse.json(
          { error: 'This sitting has already been submitted.', alreadySubmitted: true },
          { status: 409 },
        );
      }
      if (/not authorized/i.test(msg)) {
        return NextResponse.json({ error: 'That sitting could not be found.' }, { status: 404 });
      }
      const missing = RPC_MISSING.test(msg);
      return NextResponse.json(
        {
          error: missing
            ? 'Answering is not switched on yet. Please tell whoever runs the programme at your school.'
            : 'Your answer could not be saved. Please try again.',
        },
        { status: missing ? 503 : 400 },
      );
    }

    // The RPC withholds is_correct / vault_status / streak (returns NULL) on a
    // timed or live paper — the verdict is released at finalize. NULL is
    // reported as null, never coerced to "wrong".
    const isCorrect =
      skipped ? null : typeof verdict?.is_correct === 'boolean' ? verdict.is_correct : null;
    const reveal =
      !skipped && (attempt.mode === 'practice' || attempt.mode === 'vault_review')
        ? {
            correctAnswer: normaliseAnswer(item.answer),
            explanation: item.explanation ?? null,
            explanationTa: item.explanation_ta ?? null,
          }
        : null;

    return NextResponse.json({
      itemId: item.id,
      skipped,
      isCorrect,
      vaultStatus: verdict?.vault_status ?? null,
      streak: typeof verdict?.streak === 'number' ? verdict.streak : null,
      reveal,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not record the answer' },
      { status: 500 },
    );
  }
}
