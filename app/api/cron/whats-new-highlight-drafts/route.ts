// =====================================================================
// What's New — the plain-English highlight writer: the cron.
// =====================================================================
// Turns the developer's commit subject into the three lines a Principal can
// read, for the handful of changes each week that actually affect someone.
//
// THE COMPLAINT THIS ANSWERS (Director, 2026-09-12): /whats-new "seems to be
// only for developers and not understandable by the actual users who are non
// developers and would like to know how it impacts them and how they can take
// advantage of the new changes just like all product companies."
//
// 20261203120000 built the table, the queue and the strip and left the WRITING
// to a person. Nobody wrote anything — changelog_highlights held 0 rows on
// 2026-09-13, and the strip's reader policy is `status = 'approved'`, so it
// rendered nothing and always would. This route is the missing writer.
//
// ── FLOW (one route, re-entrant, idempotent — mirrors aipulse-domain-starter)
//   COLLECT first: drain done ai_jobs, parse, file each as a changelog_highlights
//     row. fn_ai_collect_claim stamps delivered_at under FOR UPDATE SKIP LOCKED,
//     so a result is filed exactly once even if two runs overlap.
//   SUBMIT next: run the SAME deterministic selection the approver's queue uses
//     (lib/changelog/highlights.ts — this route does not re-invent picking), and
//     enqueue one Max-lane job per candidate that has no highlight row yet.
//
// ── PUBLISHED UNREVIEWED, AND WHY THAT IS NOT A SHORTCUT
// The Director reversed the earlier "a person writes and approves" clause on
// 2026-09-13: highlights publish unreviewed, no approval queue, because he wants
// zero ongoing work. He was shown the accuracy risk and chose this. So a parsed
// draft is filed with status = 'approved' and source = 'ai', carrying NO review
// stamp — nobody reviewed it, and the constraint in 20261203180000 makes
// claiming otherwise unrepresentable.
//
// Two things hold the risk down, and both are load-bearing:
//   1. THE ORIGINAL DEVELOPER LINE RENDERS BENEATH EVERY HIGHLIGHT, in smaller
//      type (components/changelog/highlights-strip.tsx). Unreviewed text about
//      ten applications now reaches every reader, on a page whose purpose is
//      teaching people what they can do; the original line keeps every claim
//      checkable against what actually shipped, by the reader, as they read it.
//   2. A super admin can still pull a bad line — the queue UI and every write
//      path from 20261203120000 are untouched.
//
// ── A REFUSAL IS A RESULT
// Most of what ships is invisible to a reader. The prompt tells the model to
// say so rather than invent an effect, and this route files that answer as
// 'skipped' — which takes the entry out of selection permanently, so the lane
// is never asked about it again. Publishing nothing is the correct outcome for
// most commits; a run that files more skips than highlights is working.
//
// ── THE OPERATING RULES (Director interview, 2026-09-13 evening)
// specs/whats-new/highlight-writer-rulings-2026-09-13.md. Five of the eight
// rulings live in this route:
//
//   1 BACKLOG CUT-OFF. Only changes on or after WRITEUP_BACKLOG_FLOOR are ever
//     written up — a fixed DATE in lib/changelog/highlights.ts, not a rolling
//     window, so a re-run months from now cannot creep back through the ~4,100
//     older entries the Director excluded. The per-run cap in selectHighlights
//     is what drains the ~800 in the window gradually instead of in one spike;
//     it stays.
//   5 NEVER REWRITE A HIDDEN ONE. See the COLLECT pass — a row that already
//     exists is never overwritten.
//   6 AUTO-HIDE WHEN A CHANGE IS UNDONE. See the TAKE DOWN pass. Matched BY
//     SHA since 2026-09-14 — the subject matching #3710 shipped could never
//     fire, and specs/whats-new/KNOWN-GAP-revert-detection.md says why.
//   7 REPORT IT. The tap is app/api/whats-new/highlights/report/route.ts; the
//     THRESHOLD is here — three distinct readers take a write-up down by
//     themselves (Director, 2026-09-13 22:20), configurable in
//     platform_policies, and never against a row a person has already touched.
//   8 ALERT AFTER REPEATED FAILURES. See the withCronRun wrapper at the bottom.
//     A run that STOPS happening is now caught too, but not here — that is
//     lib/cron/absence.ts, read by the same cron-failure-alerts route.
//
// ── THE OUTPUT GATE (2026-09-15)
// The prompt tells the model the vocabulary and the model obeys it 87% of the
// time: 64 of 475 write-ups on production said student, faculty or staff, all
// of them written after the rule went into the prompt. So nothing the model
// returns is published on the strength of the prompt any more. The COLLECT
// pass runs forbiddenVocabulary() on every parsed answer: a hit is sent back
// ONCE with the words named (the job carries the writer's subject for that),
// and a second hit files 'skipped' with skip_reason = 'vocab' — never
// 'approved'. The SUBMIT pass runs accessHoleLanguage() on the commit SUBJECT
// and files 'skipped' / 'security' without asking the model at all, because
// on 2026-09-15 the model wrote up a closed access hole for every reader
// (49ae115) and the "security lines reach super admins only" rule could not
// catch it — that rule keys on kind = 'security' and the commit was a fix.
//
// EVERY 'skipped' ROW NOW SAYS WHY. skip_reason was NULL on all 95 skipped
// rows because only the takedown path set it. Every path here sets it now,
// and changelog_highlights_skipped_has_reason_check refuses a row that does
// not.
//
// WHY 5, 7 AND 8 ARE NOT OPTIONAL EXTRAS. This route runs TWICE AN HOUR and
// publishes UNREVIEWED — both explicit rulings. A fault therefore repeats 48
// times a day onto a page nobody is paid to check. The spec records that the
// cadence is safe *because* those three exist, and that dropping any of them
// reopens the cadence decision. Removing one of them here is a Director
// decision, not a refactor.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-09-13.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  enqueueJobsLane,
  collectJobsLane,
  type JobsLaneEnqueueResult,
} from '@/lib/services/platform/ai-jobs-lane';
import { selectHighlights, WRITEUP_BACKLOG_FLOOR } from '@/lib/changelog/highlights';
import {
  accessHoleLanguage,
  buildHighlightPrompt,
  forbiddenVocabulary,
  highlightDedupeKey,
  isRefusal,
  parseHighlightResult,
  type HighlightSubject,
} from '@/lib/changelog/highlight-prompt';
import {
  findRevertTakedowns,
  findReportTakedowns,
  reportKey,
  type Takedown,
} from '@/lib/changelog/revert-detect';
import { withCronRun } from '@/lib/cron/run-log';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

const JOB_TYPE = 'whats_new.highlight_draft';

/** How many DISTINCT readers must flag a write-up before it comes down by
 *  itself. A config row, because it is a Director decision and not a constant
 *  buried here (docs/architecture/config-table-pattern.md). */
const REPORT_HIDE_POLICY_KEY = 'whats_new.highlight_report_hide_threshold';
const DEFAULT_REPORT_HIDE_THRESHOLD = 3;

/**
 * Max outstanding jobs this route will hold on the lane.
 *
 * WEEKLY_CAP is 10, so a settled week needs far less than this. The headroom is
 * for the FIRST run against a backlog and for a week where many candidates
 * refuse: a refusal costs a round trip and frees the slot for the next entry.
 * ONE seat drains this lane for every consumer on it (PDE, SCF, OneMark,
 * AI Pulse), and fn_ai_claim has no job_type filter — lane is the only
 * isolation — so a number this small is a courtesy to them, not a limit this
 * feature needs.
 */
const CAP = 20;

/**
 * Rows per page when reading the backlog window.
 *
 * This used to be a single `.range(0, 999)` over ONE WEEK — 222 entries on
 * 2026-09-12, so four times the headroom it needed. Ruling 1 widens the window
 * from a week to a month (~800 entries, and more on a busy month), which puts
 * that single read close enough to PostgREST's db-max-rows that it would start
 * truncating — SILENTLY, dropping the OLDEST entries first because the order is
 * newest-first, which is exactly the half of the backlog this ruling exists to
 * reach. So the read pages instead.
 */
const PAGE_ROWS = 1000;

/** Stop after this many pages. ~800 entries a month means one page today; five
 *  is room for a year's worth of unusually busy months and a hard stop on a
 *  filter that has gone wrong, rather than an unbounded loop in a cron. */
const MAX_PAGES = 5;

/** `.in()` travels in the URL. ~800 shas in one filter builds a query string
 *  long enough to be rejected, so every `.in()` over the window is chunked —
 *  same size as the sibling read route uses for the same reason. */
const IN_CHUNK = 200;

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Stashed in payload._ctx so the collect pass files the row without re-querying.
 *  The sha lives HERE, not in the prompt — it is the join key, not the question. */
type DraftContext = {
  app_key: string;
  sha: string;
  /** carried only so a log line can name the change a human recognises */
  subject: string;
  /** Everything the prompt was built from, so a vocabulary retry can rebuild it
   *  at collect time without re-reading the entry. Absent on jobs enqueued
   *  before 2026-09-15; those cannot be retried and are re-queued instead. */
  writer?: HighlightSubject;
  /** Present on the ONE retry the gate allows: the forbidden words the first
   *  answer used. A retry that still fails is filed 'skipped' / 'vocab'. */
  vocab_retry?: string[];
};

/** A highlight row as the SUBMIT and RETRACT passes need it. */
interface ExistingHighlight {
  sha: string;
  app_key: string;
  status: 'draft' | 'approved' | 'skipped';
  source: 'human' | 'ai';
  selection_reason: string | null;
  /** Stamped the moment a PERSON approves, skips or restores the row. The
   *  report takedown refuses to touch a row that carries it — see
   *  findReportTakedowns for why that is not politeness but a loop guard. */
  reviewed_at: string | null;
}

interface EntryRow {
  sha: string;
  app_key: string;
  entry_date: string;
  kind: ChangelogEntry['t'];
  module_key: string;
  subject: string;
  author: string;
  pr_number: number | null;
  breaking: boolean;
  /** The commit that reverted this change, or null. Written by
   *  scripts/sync-changelog-db.mjs from the generator's revert graph. */
  reverted_by_sha: string | null;
}

function toEntry(r: EntryRow): ChangelogEntry {
  return {
    h: r.sha,
    d: r.entry_date,
    t: r.kind,
    m: r.module_key,
    s: r.subject,
    a: r.author,
    ...(r.pr_number ? { p: r.pr_number } : {}),
    ...(r.breaking ? { b: 1 as const } : {}),
  };
}

async function handler(request: NextRequest) {
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

  // `?sha=` writes up ONE named change and returns its text in the response.
  // This is the end-to-end proof hook: a registered job type that nothing ever
  // runs verifies perfectly and does nothing, which is the failure this whole
  // route exists to avoid making. It selects nothing and enqueues only that one.
  const onlySha = request.nextUrl.searchParams.get('sha');

  let published = 0;
  let skippedNoEffect = 0;
  let unparsed = 0;
  let fileFailed = 0;
  let enqueued = 0;
  let inFlight = 0;
  let candidatesTotal = 0;
  /** Ruling 5: answers discarded because a person had already decided the row. */
  let supersededByPerson = 0;
  /** The output gate: answers sent back once because they used a forbidden word. */
  let vocabRetried = 0;
  /** The output gate: answers that failed the vocabulary twice — filed 'skipped' / 'vocab'. */
  let vocabRejected = 0;
  /** The output gate: answers from pre-gate jobs that failed and carry no writer
   *  context to retry with — filed nothing, so the entry re-qualifies. */
  let vocabRequeued = 0;
  /** Access-hole subjects filed 'skipped' / 'security' without publishing — at
   *  submit (no model call) or at collect (a job already in flight). */
  let securityRouted = 0;
  const drafted: Array<Record<string, unknown>> = [];
  /** Ruling 6: write-ups taken down this run because the change was reverted. */
  const retracted: Array<Record<string, unknown>> = [];
  let alert: string | null = null;

  /**
   * RULING 8 — is this run's alert a FAULT, or just something worth saying?
   *
   * The alert field already existed and was returned in a 200 body that nobody
   * reads. The ruling is to extend that path rather than build a second
   * alerting system, and the platform already HAS the second half: every cron
   * wrapped in withCronRun writes to cron_run_log, and
   * app/api/cron/cron-failure-alerts (hourly at :14, min_streak 3, configurable
   * in platform_policies) turns a streak of failed runs into a bell
   * notification to every super admin. That is the whole of ruling 8 — provided
   * a faulty run actually ANSWERS >= 400, because statusIsOk() is the only
   * signal cron_run_log has.
   *
   * So a fault answers 500. What is NOT a fault, and must keep answering 200,
   * is an operator's manual `?sha=` call that named a change that is not there:
   * a typo at a terminal must not manufacture a failure streak that pages
   * people at two in the morning.
   *
   * The remaining blind spot, stated rather than papered over: a run that
   * succeeds at everything it attempts while the MAX SEAT quietly returns
   * nothing is a 200, and this will not catch it. `published` staying at 0 run
   * after run is the signal for that, and it is visible in the body.
   */
  let alertIsFault = false;
  function raiseAlert(message: string, fault: boolean) {
    alert = message;
    if (fault) alertIsFault = true;
  }

  // ── COLLECT: drain done jobs and file what came back. ──────────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);

    // RULING 5 — A HIDDEN WRITE-UP IS NEVER REWRITTEN, AND THIS IS WHERE THAT
    // COULD HAVE BEEN BROKEN.
    //
    // The file below is an UPSERT on (app_key, sha) with status 'approved'. A
    // job enqueued at :13 comes home at :43. If a super admin hides the
    // write-up at :20 — sets it to 'skipped', which is the existing mechanism
    // and the one the ruling says to extend — that upsert would resurrect it as
    // 'approved' twenty-three minutes later, and again on the next delivery.
    // The person's decision would be silently undone by a job that was already
    // in flight when they made it, and nothing in the response would say so.
    //
    // So: any sha that ALREADY has a row is left exactly as it is. A row exists
    // only because a person wrote it, a person hid it, or a previous collect
    // already filed this answer — and in all three cases the right move is to
    // keep what is there. Selection never offers a decided entry again
    // (`alreadyDecided` below), so this closes the one window that was left.
    const deliveredShas = [
      ...new Set(
        items
          .map((i) => (i.context as unknown as DraftContext)?.sha)
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
      ),
    ];
    let alreadyFiled = new Set<string>();
    if (deliveredShas.length > 0) {
      const { data: prior, error: priorErr } = await admin
        .from('changelog_highlights')
        .select('sha')
        .in('sha', deliveredShas);
      // A FAILED read must not become "file everything". Throwing here sends the
      // run down the catch below, which alerts and files nothing — the safe
      // direction, because the failure it is guarding against is overwriting a
      // person's takedown.
      if (priorErr) throw new Error(`prior highlights read: ${priorErr.message}`);
      alreadyFiled = new Set(((prior as { sha: string }[] | null) ?? []).map((p) => p.sha));
    }

    for (const item of items) {
      const ctx = item.context as unknown as DraftContext;
      if (!ctx?.sha) {
        unparsed++;
        continue;
      }
      // Ruling 5, enforced. The job is still marked delivered by the claim
      // above, so it does not come back — the answer is simply discarded in
      // favour of whatever a person decided.
      if (alreadyFiled.has(ctx.sha)) {
        supersededByPerson++;
        continue;
      }
      const block = item.message?.content?.find((b) => b.type === 'text');
      const raw = block && 'text' in block ? (block.text as string) : null;
      const parsed = parseHighlightResult(raw);

      if (!parsed) {
        // Nothing is filed, so the entry re-qualifies on the next run. A
        // half-read answer must never become a published sentence: there is no
        // approval step left to catch it.
        unparsed++;
        console.warn(`[cron/whats-new-highlight-drafts] unparseable result for ${ctx.sha}`);
        continue;
      }

      // THE SECURITY ROUTE, at collect. The submit pass below files these
      // before a job is ever enqueued, so this only meets jobs that were in
      // flight when the gate shipped — but "regardless of what the model
      // wrote" has to hold here too, or the first run after deploy publishes
      // exactly the line the gate exists to stop.
      const hole =
        accessHoleLanguage(ctx.subject ?? '') ??
        (ctx.writer?.kind === 'security' ? 'kind: security' : null);
      const refused = !hole && isRefusal(parsed);
      // THE VOCABULARY GATE. Only a draft can carry a forbidden word; a
      // refusal has no lines to publish and a security hit is never published.
      const badWords = hole || isRefusal(parsed) ? [] : forbiddenVocabulary(parsed);
      if (badWords.length > 0 && !ctx.vocab_retry) {
        if (!ctx.writer) {
          // A pre-gate job: nothing to rebuild the prompt from. File nothing —
          // the entry has no row, so selection offers it again with the new
          // context, and THAT job can be retried. Bounded: the new context is
          // always present from here on.
          vocabRequeued++;
          console.warn(
            `[cron/whats-new-highlight-drafts] vocabulary hit (${badWords.join(', ')}) on a pre-gate job for ${ctx.sha}; re-queued`
          );
          continue;
        }
        // THE ONE RETRY. Same dedupe key, so selection below sees it in flight
        // and does not enqueue a second job for the same change.
        const retry = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: buildHighlightPrompt(ctx.writer, { rewriteWithout: badWords }),
          context: { ...ctx, vocab_retry: badWords } as unknown as Record<string, unknown>,
          dedupeKey: highlightDedupeKey(ctx.app_key ?? 'myjkkn', ctx.sha),
        });
        if (retry.ok) {
          vocabRetried++;
        } else {
          // Not filed, so the entry re-qualifies on a later run rather than
          // being published with the words in it or retired without a retry.
          vocabRequeued++;
          console.warn(
            `[cron/whats-new-highlight-drafts] vocabulary retry could not be enqueued for ${ctx.sha}: ${(retry as { reason?: string }).reason ?? ''}`
          );
        }
        continue;
      }
      const vocabFailed = badWords.length > 0;
      const publish = !hole && !refused && !vocabFailed;
      const draft = isRefusal(parsed) ? null : parsed;

      const row = {
        app_key: ctx.app_key ?? 'myjkkn',
        sha: ctx.sha,
        headline: publish && draft ? draft.headline : null,
        affects: publish && draft ? draft.affects : null,
        action: publish && draft ? draft.action : null,
        // A refusal is retired as 'skipped' — kept rather than deleted so
        // selection never offers the same entry again, which is exactly what
        // that status is for. A gate rejection is retired the same way, and
        // skip_reason says which of the three it was.
        status: publish ? 'approved' : 'skipped',
        skip_reason: hole ? 'security' : refused ? 'ai_refused' : vocabFailed ? 'vocab' : null,
        selection_reason: hole
          ? `Not published: the change closes an access hole (subject says "${hole}"). Security lines do not go on the page.`
          : refused
            ? `Written up automatically; no user-visible effect. ${(parsed as { reason: string }).reason}`
            : vocabFailed
              ? `Not published: the writer used forbidden words twice (${badWords.join(', ')}; first answer used ${(ctx.vocab_retry ?? []).join(', ')}). A person can write this one from the queue.`
              : 'Written up automatically from the shipped change.',
        source: 'ai',
        // No review stamp. Nobody reviewed it, and the CHECK in
        // 20261203180000 requires an 'ai' row to carry neither column.
        reviewed_by: null,
        reviewed_at: null,
      };

      const { error } = await (admin as any)
        .from('changelog_highlights')
        .upsert(row, { onConflict: 'app_key,sha' });

      if (error) {
        // 23503 = the entry left changelog_entries between enqueue and collect
        // (the sync prunes). Nothing to write up any more; not worth alerting.
        fileFailed++;
        console.error(
          `[cron/whats-new-highlight-drafts] file failed for ${ctx.sha}: ${error.message}`
        );
        continue;
      }
      if (hole) securityRouted++;
      else if (refused) skippedNoEffect++;
      else if (vocabFailed) vocabRejected++;
      else published++;
      drafted.push(
        publish && draft
          ? {
              sha: ctx.sha,
              subject: ctx.subject,
              status: 'approved',
              headline: draft.headline,
              affects: draft.affects,
              action: draft.action,
            }
          : {
              sha: ctx.sha,
              subject: ctx.subject,
              status: 'skipped',
              skip_reason: row.skip_reason,
              reason: hole
                ? `access hole: ${hole}`
                : refused
                  ? (parsed as { reason: string }).reason
                  : `forbidden words: ${badWords.join(', ')}`,
            }
      );
    }
  } catch (e) {
    raiseAlert('collect phase threw — results may still be waiting', true);
    console.error('[cron/whats-new-highlight-drafts] collect failed:', e);
  }

  // ── SUBMIT: enqueue one job per candidate with no highlight row yet. ───────
  //
  // RULING 1 — THE WINDOW IS THE BACKLOG CUT-OFF, NOT THIS WEEK.
  //
  // This read used to start at weekStart(today), which meant the writer could
  // only ever see the current week — the ~800-entry backlog the Director asked
  // for was unreachable by construction, and every Monday the previous week's
  // unwritten changes fell out of view for good. The window is now the fixed
  // floor: on or after WRITEUP_BACKLOG_FLOOR, up to today, and never one day
  // older however many times this runs. The ~4,100 entries below the floor keep
  // their plain list, grouping and links, and are never written up.
  //
  // The per-run cap inside selectHighlights is what turns ~800 entries into a
  // gradual drain rather than one spike, and it is load-bearing now that the
  // window is a month wide. Do not remove it.
  const from = WRITEUP_BACKLOG_FLOOR;
  try {
    let rows: EntryRow[] = [];

    if (onlySha) {
      const { data, error } = await admin
        .from('changelog_entries')
        .select('sha,app_key,entry_date,kind,module_key,subject,author,pr_number,breaking,reverted_by_sha')
        .eq('sha', onlySha)
        .eq('hidden', false)
        .limit(1);
      if (error) throw new Error(error.message);
      rows = (data as EntryRow[] | null) ?? [];
      // NOT a fault: this only happens on a hand-typed `?sha=` call. See
      // raiseAlert's header — an operator's typo must not page anyone.
      if (rows.length === 0) raiseAlert(`no visible changelog entry for sha ${onlySha}`, false);
    } else {
      // Paged. A single .range() over a month-wide window would truncate at
      // db-max-rows SILENTLY and, because the order is newest-first, would drop
      // the OLDEST entries — the half of the backlog ruling 1 exists to reach.
      // The total order is the one app/api/whats-new/route.ts serves, so
      // selection keeps seeing entries in the order it documents.
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await admin
          .from('changelog_entries')
          .select('sha,app_key,entry_date,kind,module_key,subject,author,pr_number,breaking,reverted_by_sha')
          .eq('hidden', false)
          .gte('entry_date', from)
          .order('entry_date', { ascending: false })
          .order('ordinal', { ascending: true })
          .order('app_key', { ascending: true })
          .order('sha', { ascending: false })
          .range(page * PAGE_ROWS, page * PAGE_ROWS + PAGE_ROWS - 1);
        if (error) throw new Error(error.message);
        const batch = (data as EntryRow[] | null) ?? [];
        rows.push(...batch);
        if (batch.length < PAGE_ROWS) break;
      }
    }

    if (rows.length > 0) {
      // The module LABELS. This is the "send names, not ids" rule made
      // structural: the prompt is built from `label`, and `module_key` never
      // reaches the model.
      const keys = [...new Set(rows.map((r) => r.module_key))];
      const { data: modRows, error: modErr } = await admin
        .from('changelog_modules')
        .select('key,label,perm,href')
        .in('key', keys);
      if (modErr) throw new Error(modErr.message);
      const modules: Record<string, ChangelogModule> = {};
      for (const m of (modRows as
        | { key: string; label: string; perm: string[] | null; href: string | null }[]
        | null) ?? []) {
        // NULL and [] both mean platform-wide, exactly as the read routes
        // normalise them. Drifting from that here would change which entries
        // selection considers reachable.
        modules[m.key] = {
          label: m.label,
          perm: m.perm && m.perm.length > 0 ? m.perm : null,
          href: m.href ?? null,
        };
      }

      // Every sha that already HAS a highlight row, in any status. An approved
      // one is written; a skipped one was refused; a draft is a human's work in
      // progress the writer must not overwrite.
      //
      // CHUNKED, and that is ruling 1's doing rather than tidiness: `.in()`
      // travels in the URL, and a week's 222 shas fitted where a month's ~800
      // would build a query string long enough to be rejected — which would
      // throw, alert, and enqueue nothing, every run. Same chunk size as the
      // sibling read route.
      const existing: ExistingHighlight[] = [];
      for (let i = 0; i < rows.length; i += IN_CHUNK) {
        const { data, error: exErr } = await admin
          .from('changelog_highlights')
          .select('sha,app_key,status,source,selection_reason,reviewed_at')
          .in('sha', rows.slice(i, i + IN_CHUNK).map((r) => r.sha));
        if (exErr) throw new Error(exErr.message);
        existing.push(...((data as ExistingHighlight[] | null) ?? []));
      }
      const written = new Set(existing.map((h) => h.sha));

      const candidates = onlySha
        ? // The proof hook bypasses scoring on purpose: it must be able to write
          // up a NAMED change, including one selection would rank below the cap.
          rows.filter((r) => !written.has(r.sha)).map((r) => ({ entry: toEntry(r) }))
        : selectHighlights(rows.map(toEntry), modules, { from, alreadyDecided: written });
      candidatesTotal = candidates.length;

      const bySha = new Map(rows.map((r) => [r.sha, r]));
      for (const c of candidates) {
        if (enqueued + inFlight >= CAP) break;
        const row = bySha.get(c.entry.h);
        if (!row) continue;
        const mod = modules[row.module_key];

        // THE SECURITY ROUTE, at submit. A subject that describes an access
        // hole — or a commit typed security outright — is filed 'skipped' /
        // 'security' here and never reaches the model. Not asking is cheaper
        // than asking and discarding, and it cannot be argued with: on
        // 2026-09-15 the model was asked and wrote the hole up anyway.
        const hole =
          accessHoleLanguage(row.subject) ?? (row.kind === 'security' ? 'kind: security' : null);
        if (hole) {
          const { error: secErr } = await (admin as any).from('changelog_highlights').upsert(
            {
              app_key: row.app_key,
              sha: row.sha,
              headline: null,
              affects: null,
              action: null,
              status: 'skipped',
              skip_reason: 'security',
              selection_reason: `Not published: the change closes an access hole (subject says "${hole}"). Security lines do not go on the page.`,
              source: 'ai',
              reviewed_by: null,
              reviewed_at: null,
            },
            { onConflict: 'app_key,sha' }
          );
          if (secErr) {
            fileFailed++;
            console.error(
              `[cron/whats-new-highlight-drafts] security route failed for ${row.sha}: ${secErr.message}`
            );
          } else {
            securityRouted++;
            drafted.push({
              sha: row.sha,
              subject: row.subject,
              status: 'skipped',
              skip_reason: 'security',
              reason: `access hole: ${hole}`,
            });
          }
          continue;
        }

        const writer: HighlightSubject = {
          subject: row.subject,
          moduleLabel: mod?.label ?? row.module_key,
          moduleHref: mod?.href ?? null,
          author: row.author,
          kind: row.kind,
          breaking: row.breaking,
        };
        const ctx: DraftContext = {
          app_key: row.app_key,
          sha: row.sha,
          subject: row.subject,
          // So the collect pass can rebuild the prompt for the one vocabulary
          // retry without a second read of the entry.
          writer,
        };
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: buildHighlightPrompt(writer),
          context: ctx as unknown as Record<string, unknown>,
          dedupeKey: highlightDedupeKey(row.app_key, row.sha),
        });
        if (res.ok) {
          enqueued++;
          continue;
        }
        // This repo compiles with strictNullChecks OFF, and without it TypeScript
        // will not discriminate a union on a boolean literal — `res.reason` is an
        // error inside this branch even though `res.ok` is false here. The house
        // workaround (aipulse-domain-starter) casts to `{ reason?: string }`,
        // which compiles but throws away the literal union and would let a typo
        // like 'in_flght' pass every comparison below. Extract keeps it: the cast
        // names exactly the failure variant, so `reason` stays the four-value
        // union the compiler checks each `===` against.
        const fail = res as Extract<JobsLaneEnqueueResult, { ok: false }>;
        if (fail.reason === 'in_flight') {
          inFlight++;
          continue;
        }
        console.warn(
          `[cron/whats-new-highlight-drafts] enqueue failed for ${row.sha} (${fail.reason}): ${fail.error ?? ''}`
        );
        if (fail.reason === 'unknown_type') {
          raiseAlert(
            'job type whats_new.highlight_draft is not registered or is disabled — ' +
              'migration 20261203180000 has not been applied',
            true
          );
        } else if (fail.reason === 'no_seat') {
          // The alert path ruling 8 names by line number. It now reaches a
          // person instead of a JSON field: a run carrying a fault answers 500,
          // cron_run_log records the failure, and cron-failure-alerts bells
          // every super admin once the streak reaches three.
          raiseAlert('no seat owner configured for the max lane — nothing can be drafted', true);
        }
      }

      // ── TAKE DOWN: ruling 6 (the change was undone) and the 22:20 ruling
      //    (three readers said it is wrong). ──────────────────────────
      //
      // "Nobody should be told to go try something that no longer exists."
      // A reverted feature leaves a card on the page saying where to click and
      // what the reader can now do, and that is worse than no card: they go
      // looking, find nothing, and stop trusting the page.
      //
      // MATCHED BY SHA, NOT BY TEXT — this is the fix for the gap recorded in
      // specs/whats-new/KNOWN-GAP-revert-detection.md. The subject-matching
      // version shipped in #3710 could never fire (a `Revert "…"` commit never
      // became an entry, and the stored subject has had its prefix stripped
      // anyway) and, had it fired, would have taken down the WRONG module's
      // write-up, because two modules' subjects store as the same string once
      // that prefix is gone. scripts/generate-changelog.mjs now resolves the
      // revert graph against raw git output and writes the answer to
      // changelog_entries.reverted_by_sha; this pass only reads that column.
      //
      // STILL INVISIBLE, and accepted by the Director: a hand-written undo
      // ("fix: put the old behaviour back") and a feature removed by a later
      // redesign carry no revert signal at all.
      //
      // Only 'approved' rows come down — a draft renders nowhere and a skipped
      // one is already down, so touching either would be noise in the audit
      // trail for no change on the page.
      const approvedRows = existing.filter((h) => h.status === 'approved');
      const approvedByKey = new Map(approvedRows.map((h) => [h.sha, h]));

      // THE REPORT TALLY, for the write-ups that are actually on the page.
      // Scoped to this run's window and chunked for the same reason every other
      // `.in()` here is: a month's ~800 shas in one URL builds a query string
      // long enough to be rejected. The UNIQUE on (app_key, sha, reported_by)
      // is what makes a plain row count mean "distinct readers".
      const reportCounts = new Map<string, number>();
      const approvedShas = [...approvedByKey.keys()];
      for (let i = 0; i < approvedShas.length; i += IN_CHUNK) {
        const { data, error: repErr } = await admin
          .from('changelog_highlight_reports')
          .select('app_key,sha')
          .in('sha', approvedShas.slice(i, i + IN_CHUNK));
        if (repErr) throw new Error(repErr.message);
        for (const r of (data as { app_key: string; sha: string }[] | null) ?? []) {
          const k = reportKey(r.app_key, r.sha);
          reportCounts.set(k, (reportCounts.get(k) ?? 0) + 1);
        }
      }

      // The threshold is a config row, not a constant buried here. A policy read
      // that fails falls back to the default rather than returning early — the
      // alternative is a policy outage silently disabling a safeguard.
      let reportThreshold = DEFAULT_REPORT_HIDE_THRESHOLD;
      const { data: thresholdValue } = await admin.rpc('fn_get_policy', {
        p_key: REPORT_HIDE_POLICY_KEY,
        p_scope_id: null,
      });
      if (typeof thresholdValue === 'number' && thresholdValue >= 1) {
        reportThreshold = Math.floor(thresholdValue);
      }

      const takedowns: Takedown[] = [
        ...findRevertTakedowns(rows, approvedRows),
        ...findReportTakedowns(approvedRows, reportCounts, reportThreshold),
      ];

      for (const hit of takedowns) {
        const prior = approvedByKey.get(hit.sha);
        if (!prior) continue;
        // The audit line KEEPS the old reason rather than replacing it. A row
        // that came down silently is indistinguishable from one a person
        // skipped, and this is the only prose record of why the page changed —
        // skip_reason is the queryable one beside it.
        const why =
          hit.reason === 'reverted'
            ? `this change was reverted by ${hit.reverted_by}`
            : `${hit.reports} readers reported the write-up as wrong`;
        const reason =
          `Taken down automatically: ${why}. ` +
          `Previously: ${prior.selection_reason ?? '(no reason recorded)'}`;
        const { error: retErr } = await (admin as any)
          .from('changelog_highlights')
          .update({
            status: 'skipped',
            // QUERYABLE, unlike the sentence above it. Without this column a
            // machine takedown and a person's hide are the same row, so a super
            // admin cannot find the machine ones to review, and ruling 5's
            // never-rewrite check (which keys on status alone) leaves a restored
            // write-up permanently unwritable with nothing to say why.
            skip_reason: hit.reason,
            selection_reason: reason.slice(0, 2000),
          })
          .eq('app_key', hit.app_key)
          .eq('sha', hit.sha);
        if (retErr) {
          // Not a fault worth paging over: the card stays up one more run and
          // the next run tries again. Logged so a repeat is findable.
          console.warn(
            `[cron/whats-new-highlight-drafts] takedown failed for ${hit.sha}: ${retErr.message}`
          );
          continue;
        }
        // 'skipped' is also what ruling 5 keys on, so a retracted write-up is
        // never re-offered to the writer either — the two rulings meet here
        // rather than needing a second mechanism.
        retracted.push({
          sha: hit.sha,
          reason: hit.reason,
          ...(hit.reverted_by ? { reverted_by: hit.reverted_by } : {}),
          ...(hit.reports ? { reports: hit.reports } : {}),
          was_written_by: prior.source,
        });
      }
    }
  } catch (e) {
    raiseAlert('submit phase threw — no changes were enqueued this run', true);
    console.error('[cron/whats-new-highlight-drafts] submit failed:', e);
  }

  const body = {
    ok: !alertIsFault,
    // The backlog floor this run worked from (ruling 1). Named `from` rather
    // than `week_from` now that the window is the cut-off date and not a week;
    // `week_from` is kept alongside it for one release so a dashboard or a
    // saved query reading the old key does not silently start seeing undefined.
    from,
    week_from: from,
    only_sha: onlySha,
    // What this run FILED (the previous run's jobs coming home).
    published,
    skipped_no_effect: skippedNoEffect,
    // The output gate, by outcome. `vocab_rejected` climbing is the gate
    // working; `published` staying at 0 while `vocab_retried` climbs is the
    // model ignoring the retry and is worth a look at the prompt.
    vocab_retried: vocabRetried,
    vocab_rejected: vocabRejected,
    vocab_requeued: vocabRequeued,
    security_routed: securityRouted,
    unparsed,
    file_failed: fileFailed,
    // Ruling 5: answers thrown away because a person had already decided the
    // row — most often because they hid the write-up while the job was in
    // flight. A number that climbs here is the safeguard working, not a fault.
    superseded_by_person: supersededByPerson,
    // What this run SENT (lands on the next run).
    candidates_total: candidatesTotal,
    enqueued,
    in_flight: inFlight,
    cap: CAP,
    // The actual text filed this run — so a person reading the cron's output
    // can see what went on the page without opening the database.
    drafted,
    // Ruling 6: write-ups taken down this run because their change was reverted.
    retracted,
    alert,
    // THE LEDGER. withCronRun copies this object into cron_run_log.meta, which
    // was `{}` for every run of this job until 2026-09-15 — a takedown left no
    // trace beyond the row it changed. The counts and the takedown list are
    // enough to answer "what did the 02:13 run do" from the log alone;
    // `drafted` (the text) is left out because the row already holds it.
    meta: {
      published,
      skipped_no_effect: skippedNoEffect,
      vocab_retried: vocabRetried,
      vocab_rejected: vocabRejected,
      vocab_requeued: vocabRequeued,
      security_routed: securityRouted,
      unparsed,
      file_failed: fileFailed,
      superseded_by_person: supersededByPerson,
      candidates_total: candidatesTotal,
      enqueued,
      in_flight: inFlight,
      retracted,
      ...(alert ? { alert } : {}),
    },
    // `error` is the key withCronRun's peekError() reads off a failed response,
    // so a faulty run's reason lands in cron_run_log.error and then in the bell
    // notification cron-failure-alerts sends. Without it the alert would say a
    // job is failing and not say why.
    ...(alertIsFault ? { error: alert } : {}),
    elapsed_ms: Date.now() - started,
  };

  // RULING 8, the whole of it: a faulty run ANSWERS >= 400.
  //
  // statusIsOk() in lib/cron/run-log.ts is the only signal cron_run_log has, so
  // a fault that answered 200 — which is what this route did before — is a run
  // that reads healthy while nothing is being written. That is the exact shape
  // of the failure the Director was shown as precedent: three Instagram
  // pipeline jobs failed from June to September while the dashboards read
  // healthy. From here: three consecutive faulty runs (one and a half hours at
  // `13,43 * * * *`) put this job in fn_cron_failure_streaks, and
  // cron-failure-alerts — already scheduled hourly at :14, already fanning out
  // to every super admin — bells them once per streak. No second alerting
  // system, no new schedule, no new table.
  //
  // The page degrades gracefully throughout: changes keep appearing in the
  // plain list, just without write-ups.
  return NextResponse.json(body, { status: alertIsFault ? 500 : 200 });
}

// Ruling 8's other half. The wrapper opens a cron_run_log row before the work
// and closes it with the response's status, so a run that never comes back at
// all (timeout, OOM, a hard 502) is visible as an open row rather than as
// silence. It checks CRON_SECRET itself and logs nothing when that fails, so a
// stranger curling this public path cannot manufacture a failure streak.
export const GET = withCronRun('whats-new-highlight-drafts', handler);
