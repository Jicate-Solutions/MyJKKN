// =====================================================================
// RCLTP Part-B question generation — ₹0 Max lane handler (cron)
// =====================================================================
// Decision #2 of the Senior-Learner⇄AI offload set: prepare ahead of time,
// overnight, on the free lane — so a Senior Learner opens a pile that is
// already drafted and self-checked, and spends their time approving rather
// than waiting on a model.
//
// ENQUEUE (?mode=enqueue): the overnight sweep. Finds approved, active,
//   English passages that have NO questions at all and puts stage 1 on the
//   lane, bounded by the rcltp.question_generation.nightly_cap config row.
//   ?passageId=X enqueues exactly that passage instead (on-demand + proof).
//
// COLLECT (default / ?mode=collect): drains BOTH stages off the lane and
//   dispatches on job_type — the scf.judge → scf.suggest_* chain pattern.
//     stage 1 (rcltp.question_generation) → parse the set, then CHAIN stage 2.
//     stage 2 (rcltp.question_keycheck)   → parse verdicts, write draft rows.
//   Rows are written once, at stage 2, so ai_meta.checker is never half-filled
//   — ai_agreed_count feeds the "Approve all AI-agreed" batch button, and a
//   partially-checked set would inflate it.
//
// GENERATE_NOW (?mode=generate_now&passageId=X): both model calls inline via a
//   direct Anthropic call. Paid (not the ₹0 lane) — secret-gated, never a
//   learner-facing path. For an operator "generate now" and for a deterministic
//   proof when the Max seat is idle. NOTE: a green run here does NOT prove the
//   async lane; it bypasses seat validation entirely.
//
// HARD INVARIANT: nothing here ever writes status='approved'. AI is the author;
// a Senior Learner approves in the review console. English only (Nattraja CBSE).
//
// DURABILITY: a generated set lives only in the stage-2 job payload until it is
// recorded. If that job errors on the seat, the set is lost — and self-heals,
// because the passage still has zero questions and so re-qualifies for the next
// nightly sweep.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-07-25 (rank-2 of the Senior-Learner⇄AI offload decisions).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  QUESTION_GEN_JOB_TYPE,
  QUESTION_KEYCHECK_JOB_TYPE,
  RCLTP_QGEN_JOB_TYPES,
  enqueueQuestionGeneration,
  enqueueKeyCheck,
  loadGenPassage,
  recordQuestions,
  parseQuestionMessage,
  parseCheckMessage,
  generateQuestionsForPassage,
  type QGenContext,
  type QKeyCheckContext,
} from '@/lib/services/rcltp/question-generation-service';

const NIGHTLY_CAP_CEILING = 25;
const COLLECT_CAP = 25;
const NIGHTLY_CAP_KEY = 'rcltp.question_generation.nightly_cap';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Passages that are ready to be read but have no questions yet. */
async function findCandidatePassages(admin: Admin, cap: number): Promise<string[]> {
  const { data: passages, error } = await admin
    .from('rcltp_passages')
    .select('id')
    .eq('is_active', true)
    .eq('status', 'approved')
    .eq('language', 'en')
    .order('created_at', { ascending: true });
  if (error || !Array.isArray(passages)) {
    if (error) console.error('[cron/rcltp-question-generate] passage scan failed:', error.message);
    return [];
  }
  if (passages.length === 0) return [];

  const ids = passages.map((p: { id: string }) => p.id);
  const { data: withQuestions, error: qErr } = await admin
    .from('rcltp_part_b_questions')
    .select('passage_id')
    .in('passage_id', ids);
  if (qErr) {
    console.error('[cron/rcltp-question-generate] question scan failed:', qErr.message);
    return [];
  }
  const covered = new Set((withQuestions ?? []).map((r: { passage_id: string }) => r.passage_id));
  return ids.filter((id) => !covered.has(id)).slice(0, cap);
}

const EMPTY_ALERT_AFTER_NIGHTS = 3;
const EMPTY_ALERT_REPEAT_NIGHTS = 7;
const EMPTY_ALERT_SOURCE = 'rcltp-question-generate-empty-streak';

/**
 * How long the nightly sweep has found nothing, and a notice when that has gone
 * on too long. Derived, not stored: the nightly sweep is the only thing that
 * enqueues stage 1 unattended, so "days since the last stage-1 job" IS the empty
 * streak — no run log or migration needed. Speaks at the threshold and weekly
 * after, so a long drought keeps saying so without becoming a nightly drip.
 * fanoutNotification's idempotencyKey makes a duplicate bell item impossible.
 */
async function reportEmptyStreak(admin: Admin, dry: boolean) {
  const { data, error } = await admin
    .from('ai_jobs')
    .select('requested_at')
    .eq('job_type', QUESTION_GEN_JOB_TYPE)
    .order('requested_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[cron/rcltp-question-generate] empty-streak read failed:', error.message);
    return { checked: false, reason: 'streak read failed' };
  }

  const last = data?.[0]?.requested_at as string | undefined;
  if (!last) {
    // Never generated anything, so there is no baseline to measure a drought
    // against. Report that plainly rather than alert on a module that has not
    // started yet — a false alarm here teaches people to ignore the real one.
    return { checked: true, nights: null, alerted: false, reason: 'no prior run to measure from' };
  }

  const nights = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  const due =
    nights >= EMPTY_ALERT_AFTER_NIGHTS &&
    (nights - EMPTY_ALERT_AFTER_NIGHTS) % EMPTY_ALERT_REPEAT_NIGHTS === 0;
  if (!due) return { checked: true, nights, alerted: false };

  // No owner is recorded for the reading programme yet, so this goes to the
  // people who can actually act on it. Narrow this the day an owner exists.
  const { data: recipientRows } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .eq('is_active', true);
  const userIds = (recipientRows ?? []).map((r: { id: string }) => r.id);
  if (userIds.length === 0) {
    console.error('[cron/rcltp-question-generate] empty streak but no recipient resolved');
    return { checked: true, nights, alerted: false, reason: 'no recipients' };
  }
  if (dry) return { checked: true, nights, alerted: false, would_notify: userIds.length };

  const outcome = await fanoutNotification(admin, {
    title: 'Reading question drafting has had nothing to do',
    body:
      `The overnight helper has found nothing to work on for ${nights} nights running. ` +
      'It only picks up approved, active, English reading passages that have no questions yet, ' +
      'so this usually means no new reading material has been added. Add a passage under ' +
      'Reading (RCLTP) → Content Authoring and it will draft questions overnight, free.',
    url: '/rcltp/admin/content',
    userIds,
    kind: 'work_item',
    priority: 'normal',
    category: 'rcltp',
    idempotencyKey: `rcltp-qgen-empty-${nights}`,
    metadata: { nights_empty: nights, route: 'rcltp-question-generate' },
    source: EMPTY_ALERT_SOURCE,
  });

  return {
    checked: true,
    nights,
    alerted: outcome.notified > 0 || outcome.skipped === 'idempotent',
    recipients: userIds.length,
  };
}

/** Guard against a duplicate set landing on a passage that already has one. */
async function alreadyHasAiDraft(admin: Admin, passageId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('rcltp_part_b_questions')
    .select('id')
    .eq('passage_id', passageId)
    .eq('source', 'ai_generated')
    .limit(1);
  if (error) return false; // never drop a result over a failed guard read
  return Array.isArray(data) && data.length > 0;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();
  const mode = request.nextUrl.searchParams.get('mode') ?? 'collect';
  const passageId = request.nextUrl.searchParams.get('passageId');

  // ── GENERATE_NOW — paid, synchronous, one passage ─────────────────────────
  if (mode === 'generate_now') {
    if (!passageId) {
      return NextResponse.json(
        { ok: false, error: 'passageId is required for generate_now' },
        { status: 400 },
      );
    }
    const r = await generateQuestionsForPassage(admin, passageId);
    return NextResponse.json(
      { ok: r.ok, mode: 'generate_now', ...r, elapsed_ms: Date.now() - started },
      { status: r.ok ? 200 : 422 },
    );
  }

  // ── ENQUEUE — put stage 1 on the ₹0 lane ──────────────────────────────────
  if (mode === 'enqueue') {
    if (passageId) {
      const r = await enqueueQuestionGeneration(admin, passageId);
      return NextResponse.json(
        { ok: r.ok, mode: 'enqueue', passage_id: passageId, ...r, elapsed_ms: Date.now() - started },
        { status: r.ok ? 200 : 422 },
      );
    }

    let cap = NIGHTLY_CAP_CEILING;
    try {
      const { data: capData } = await admin.rpc('fn_get_policy_int', {
        p_key: NIGHTLY_CAP_KEY,
        p_default: 10,
        p_scope_id: null,
      });
      if (typeof capData === 'number' && capData > 0) cap = Math.min(capData, NIGHTLY_CAP_CEILING);
    } catch {
      // a knob read failure never aborts the run
    }

    const candidates = await findCandidatePassages(admin, cap);
    let enqueued = 0;
    let inFlight = 0;
    let failed = 0;
    for (const id of candidates) {
      const r = await enqueueQuestionGeneration(admin, id);
      if (r.inFlight) inFlight++;
      else if (r.ok) enqueued++;
      else {
        failed++;
        console.warn(`[cron/rcltp-question-generate] enqueue failed for ${id}: ${r.reason ?? r.error}`);
      }
    }
    // A sweep that finds nothing is indistinguishable from a sweep that never
    // ran. Director edge ruling (2026-07-25): say something after a few empty
    // nights rather than stay silent. Only the nightly sweep evaluates this —
    // an on-demand ?passageId= run returned above.
    const emptyRun =
      candidates.length === 0
        ? await reportEmptyStreak(admin, request.nextUrl.searchParams.get('dry') === '1')
        : null;

    return NextResponse.json({
      ok: true,
      mode: 'enqueue',
      cap,
      candidates: candidates.length,
      enqueued,
      in_flight: inFlight,
      failed,
      empty_streak: emptyRun,
      elapsed_ms: Date.now() - started,
    });
  }

  // ── COLLECT (default) — drain both stages, dispatch by job_type ───────────
  let collected = 0;
  let chained = 0;
  let recorded = 0;
  let questionsWritten = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const items = await collectJobsLane(admin, RCLTP_QGEN_JOB_TYPES, COLLECT_CAP);
    for (const item of items) {
      collected++;

      // ---- stage 1: parse the set, then chain the independent key check ----
      if (item.jobType === QUESTION_GEN_JOB_TYPE) {
        const ctx = item.context as unknown as QGenContext;
        if (!ctx?.passageId) {
          console.error('[cron/rcltp-question-generate] stage-1 job missing _ctx.passageId — skipping');
          skipped++;
          continue;
        }
        const parsed = parseQuestionMessage(item.message);
        if (!parsed) {
          skipped++;
          continue;
        }
        const loaded = await loadGenPassage(admin, ctx.passageId);
        if (!loaded.ok) {
          skipped++;
          continue;
        }
        const chain = await enqueueKeyCheck(admin, loaded.passage, parsed.questions, parsed.coverage_note);
        if (chain.ok) {
          chained++;
          continue;
        }
        // Stage 2 could not be queued at all — record now with unchecked
        // verdicts rather than discard a good set. 'unchecked' is already a
        // first-class verdict, and it does NOT count toward ai_agreed_count,
        // so an unchecked set can never be batch-approved by accident.
        console.warn(
          `[cron/rcltp-question-generate] key-check enqueue failed (${chain.reason ?? chain.error}) — recording unchecked`,
        );
        if (await alreadyHasAiDraft(admin, ctx.passageId)) {
          skipped++;
          continue;
        }
        const fallback = await recordQuestions(
          admin,
          loaded.passage,
          parsed.questions,
          parsed.coverage_note,
          [],
          `maxlane:${QUESTION_GEN_JOB_TYPE}:unchecked`,
        );
        if (fallback.ok) {
          recorded++;
          questionsWritten += fallback.count ?? 0;
        } else {
          failed++;
          console.error('[cron/rcltp-question-generate] unchecked record failed:', fallback.error);
        }
        continue;
      }

      // ---- stage 2: verdicts in hand → write the draft rows ----------------
      const ctx = item.context as unknown as QKeyCheckContext;
      if (!ctx?.passageId || !Array.isArray(ctx.questions) || ctx.questions.length === 0) {
        console.error('[cron/rcltp-question-generate] stage-2 job missing _ctx questions — skipping');
        skipped++;
        continue;
      }
      const loaded = await loadGenPassage(admin, ctx.passageId);
      if (!loaded.ok) {
        skipped++;
        continue;
      }
      if (await alreadyHasAiDraft(admin, ctx.passageId)) {
        skipped++;
        continue;
      }
      const checks = parseCheckMessage(item.message);
      const rec = await recordQuestions(
        admin,
        loaded.passage,
        ctx.questions,
        ctx.coverageNote ?? '',
        checks,
        `maxlane:${QUESTION_KEYCHECK_JOB_TYPE}`,
      );
      if (rec.ok) {
        recorded++;
        questionsWritten += rec.count ?? 0;
      } else {
        failed++;
        console.error('[cron/rcltp-question-generate] draft record failed:', rec.error);
      }
    }
  } catch (e) {
    console.error('[cron/rcltp-question-generate] collect failed:', e);
  }

  return NextResponse.json({
    ok: true,
    mode: 'collect',
    collected,
    chained_keycheck: chained,
    recorded,
    questions_written: questionsWritten,
    skipped,
    failed,
    elapsed_ms: Date.now() - started,
  });
}
