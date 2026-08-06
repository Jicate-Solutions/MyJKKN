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
// WHO IS TOLD (Director decisions 2, 3 and 7 of 2026-07-28):
//   • empty nights → the HEAD of the school whose reading material is missing,
//     resolved by the rcltp.config.manage permission, NOT by role name; falls
//     back to system administrators when that school has no active head or when
//     nothing owns the material. Both paths run through the single resolver in
//     lib/services/rcltp/notify-targets.ts and report `via` so an operator can
//     tell the two apart. This changed WHO hears — the 3-night threshold and the
//     weekly repeat are deliberately unchanged. The idempotency key gained the
//     drought's start date, because once WHO can differ between droughts a key
//     scoped only to the night count back-fills a stale notice onto the new
//     recipient (see reportEmptyStreak).
//   • non-English material → the person who added it (rcltp_passages.created_by),
//     told plainly that AI drafting does not cover that language and the
//     questions need writing by hand. Keyed on the passage id, so one passage
//     yields at most one such message ever. Inert until a non-English passage
//     exists; there are none in production today.
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
import {
  resolveRcltpNotifyTargets,
  resolveRcltpProgrammeInstitutionId,
} from '@/lib/services/rcltp/notify-targets';

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

  // The key has to identify THIS drought, not just how many nights in we are.
  // `last` is the drought's start — the moment the sweep last had something to
  // do — so the UTC date of it is stable for the whole drought and changes the
  // instant a stage-1 job resets the streak. Keying on nights alone meant a
  // SECOND drought reaching night 3 collided with the first drought's row:
  // fanoutNotification's idempotency pre-check would find it and fan the OLD,
  // weeks-stale notification out to the NEW recipient, while reportEmptyStreak
  // reported alerted:true. Harmless when every notice went to the same 14
  // administrators; a real mis-dated delivery now that WHO can change.
  const streakStartedOn = new Date(last).toISOString().slice(0, 10);

  // Director decision 2 + 3 (2026-07-28): the head of the school whose reading
  // material is missing, falling back to system administrators when that school
  // has no active head or nothing owns the material. This replaces the shipped
  // "every super admin" list — WHO changes here, never whether or when. The
  // threshold, the weekly repeat and the idempotency key below are untouched.
  const institutionId = await resolveRcltpProgrammeInstitutionId(admin);
  const targets = await resolveRcltpNotifyTargets(admin, { institutionId });
  const userIds = targets.userIds;
  if (userIds.length === 0) {
    console.error('[cron/rcltp-question-generate] empty streak but no recipient resolved');
    return {
      checked: true,
      nights,
      alerted: false,
      reason: 'no recipients',
      via: targets.via,
      institution_id: targets.institutionId,
    };
  }
  if (dry) {
    return {
      checked: true,
      nights,
      streak_started_on: streakStartedOn,
      alerted: false,
      would_notify: userIds.length,
      via: targets.via,
      institution_id: targets.institutionId,
    };
  }

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
    idempotencyKey: `rcltp-qgen-empty-${streakStartedOn}-${nights}`,
    metadata: {
      nights_empty: nights,
      streak_started_on: streakStartedOn,
      recipient_path: targets.via,
      institution_id: targets.institutionId,
      route: 'rcltp-question-generate',
    },
    source: EMPTY_ALERT_SOURCE,
  });

  return {
    checked: true,
    nights,
    streak_started_on: streakStartedOn,
    alerted: outcome.notified > 0 || outcome.skipped === 'idempotent',
    recipients: userIds.length,
    via: targets.via,
    institution_id: targets.institutionId,
  };
}

const NON_ENGLISH_ALERT_SOURCE = 'rcltp-question-generate-non-english';
const NON_ENGLISH_SCAN_CAP = 25;

/**
 * 'ta' is not a plain word. Decision 7 asks that the person be told PLAINLY, so
 * render the language code as its name where the runtime can, and fall back to
 * the raw code rather than losing the sentence.
 */
function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

interface NonEnglishPassage {
  id: string;
  title: string;
  language: string;
  institution_id: string | null;
  created_by: string | null;
}

/**
 * Director decision 7 (2026-07-28) — reading material in a language other than
 * English.
 *
 * findCandidatePassages() filters on language='en', so a passage in any other
 * language is skipped in TOTAL SILENCE: it never gets questions and nobody is
 * ever told why. This says so, once, to the person who added it — they are the
 * one who can write the questions by hand.
 *
 * Bounds that make this safe to run every night:
 *   • idempotencyKey is keyed on the passage id, and notifications has a UNIQUE
 *     partial index on it, so one passage produces at most one such message EVER.
 *   • It reads a disjoint set from the sweep (language != 'en'), so it cannot
 *     change `candidates`, the empty-streak threshold, or the weekly repeat.
 *   • A passage that already has questions is skipped — someone wrote them by
 *     hand and there is nothing left to say.
 *
 * INERT ON ARRIVAL: production has zero non-English passages today, so this
 * sends nothing until one is added. Verify what it WOULD send with ?dry=1.
 */
async function reportNonEnglishPassages(admin: Admin, dry: boolean) {
  // Select ALL, filter by coverage, THEN cap — the same shape as
  // findCandidatePassages() above, and for the same reason. Capping the RAW
  // scan would starve the tail permanently: a passage that has already been
  // notified still matches the raw filter, so it holds its place in the window
  // for ever and passage 26 onward would never be reached on any night. The cap
  // has to sit AFTER the ones with nothing left to say are dropped.
  const { data, error } = await admin
    .from('rcltp_passages')
    .select('id, title, language, institution_id, created_by')
    .eq('is_active', true)
    .eq('status', 'approved')
    .neq('language', 'en')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[cron/rcltp-question-generate] non-English scan failed:', error.message);
    return { checked: false, reason: 'scan failed' };
  }

  const rows = (data ?? []) as NonEnglishPassage[];
  if (rows.length === 0) return { checked: true, found: 0, notified: 0, already_sent: 0 };

  // Drop the ones somebody already wrote questions for by hand.
  const { data: covered, error: qErr } = await admin
    .from('rcltp_part_b_questions')
    .select('passage_id')
    .in(
      'passage_id',
      rows.map((r) => r.id),
    );
  if (qErr) {
    console.error('[cron/rcltp-question-generate] non-English coverage read failed:', qErr.message);
    return { checked: false, reason: 'coverage read failed' };
  }
  const coveredIds = new Set((covered ?? []).map((r: { passage_id: string }) => r.passage_id));
  const pending = rows.filter((r) => !coveredIds.has(r.id)).slice(0, NON_ENGLISH_SCAN_CAP);

  const summary = {
    checked: true,
    found: rows.length,
    pending: pending.length,
    notified: 0,
    already_sent: 0,
    no_recipients: 0,
    errors: 0,
    would_notify: [] as Array<{ passage_id: string; language: string; via: string; recipients: number }>,
  };

  for (const passage of pending) {
    try {
      // The person who added it, when that account is still active; otherwise
      // decision 2/3's resolver, so the message lands rather than evaporating.
      let userIds: string[] = [];
      let via = 'creator';
      if (passage.created_by) {
        const { data: creator } = await admin
          .from('profiles')
          .select('id')
          .eq('id', passage.created_by)
          .eq('is_active', true)
          .maybeSingle();
        if (creator?.id) userIds = [creator.id as string];
      }
      if (userIds.length === 0) {
        const targets = await resolveRcltpNotifyTargets(admin, {
          institutionId: passage.institution_id,
        });
        userIds = targets.userIds;
        via = targets.via;
      }
      if (userIds.length === 0) {
        summary.no_recipients++;
        console.error(
          '[cron/rcltp-question-generate] non-English passage with no recipient:',
          passage.id,
        );
        continue;
      }

      if (dry) {
        summary.would_notify.push({
          passage_id: passage.id,
          language: passage.language,
          via,
          recipients: userIds.length,
        });
        continue;
      }

      const outcome = await fanoutNotification(admin, {
        title: 'This reading passage needs its questions written by hand',
        body:
          `"${passage.title}" is saved in ${languageName(passage.language)}. The overnight helper only drafts ` +
          'comprehension questions for English passages, so it will never pick this one up and ' +
          'no questions will appear for it on their own. Add them under Reading (RCLTP) → ' +
          'Content Authoring, or save an English version of the passage.',
        url: '/rcltp/admin/content',
        userIds,
        kind: 'work_item',
        priority: 'normal',
        category: 'rcltp',
        idempotencyKey: `rcltp-qgen-lang-${passage.id}`,
        metadata: {
          passage_id: passage.id,
          language: passage.language,
          recipient_path: via,
          route: 'rcltp-question-generate',
        },
        source: NON_ENGLISH_ALERT_SOURCE,
      });

      if (outcome.skipped === 'idempotent') summary.already_sent++;
      else if (outcome.notified > 0) summary.notified++;
      else {
        summary.errors++;
        console.error(
          '[cron/rcltp-question-generate] non-English notice delivered nothing:',
          passage.id,
          outcome.skipped ?? 'no notification row returned',
        );
      }
    } catch (e) {
      summary.errors++;
      console.error(
        '[cron/rcltp-question-generate] non-English notice failed:',
        passage.id,
        e instanceof Error ? e.message : e,
      );
    }
  }

  const { would_notify, ...sent } = summary;
  return dry ? { ...sent, would_notify } : sent;
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
    const dry = request.nextUrl.searchParams.get('dry') === '1';
    const emptyRun = candidates.length === 0 ? await reportEmptyStreak(admin, dry) : null;

    // Director decision 7 — the silently-skipped non-English passages. Reads a
    // set disjoint from `candidates` (language != 'en'), so it can never change
    // the empty-streak threshold or the weekly repeat above.
    const nonEnglish = await reportNonEnglishPassages(admin, dry);

    return NextResponse.json({
      ok: true,
      mode: 'enqueue',
      cap,
      candidates: candidates.length,
      enqueued,
      in_flight: inFlight,
      failed,
      empty_streak: emptyRun,
      non_english: nonEnglish,
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
