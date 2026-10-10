// =====================================================================
// Bug AI — automatic producer (COLLECT first, then SUBMIT)
// =====================================================================
// THE GAP THIS CLOSES. Every piece of MyJKKN's bug AI works, and has worked
// since July: bug.triage and bug.duplicate_check both run clean on the ₹0 Max
// lane and both render on the admin bug card. But a job only ever existed when
// an admin CLICKED "AI briefing" or "Check duplicates" on one report. Nobody has
// clicked since August, so 462 reports arrived with no AI help at all. This cron
// is the missing producer: it creates the jobs nobody clicks for, and — the half
// a queue-only build would miss — writes the finished answers back onto the bug
// card where a human actually reads them.
//
// Director decisions this implements (2026-10-10, do not re-litigate):
//   • New reports get AI automatically: triage + duplicate check.
//   • The already-open backlog is caught up too, DRIP-FED a small batch per hour
//     over a day or two — explicitly NOT all at once, NOT nights-only, and the
//     old ones are NOT skipped.
//   • Duplicates are FLAGGED for a human to confirm. Never auto-closed.
//   • The AI text is for admins and bug fixers. The reporter never sees it.
//
// WHY COLLECT COMES FIRST. The click path enqueues AND long-polls AND persists,
// all inside one request. A cron cannot long-poll for a 4-minute job, so the two
// halves are split across ticks: SUBMIT queues the work, COLLECT claims the
// finished jobs and persists them to bug_reports.metadata. Collect runs first in
// each tick so an answer that landed since the last tick is on the card before
// we spend the lane on anything new. A submit-only build would leave every
// answer sitting in ai_jobs.result where no screen reads it.
//
// IDEMPOTENCE — three layers, because only the third is actually durable:
//   1. fn_ai_enqueue_system's p_dedupe_key blocks a SECOND IN-FLIGHT job for the
//      same report. It does NOT block re-queueing once a job reaches done/error.
//   2. So the real guard is the metadata check: a report already carrying
//      ai_triage is never submitted for triage again (same for the duplicate
//      check, independently — a report can need one and not the other).
//   3. And a 24-hour recent-job guard, so a report whose job ERRORED gets one
//      retry per day rather than a fresh failure every hour forever.
//
// CROSS-APP SAFETY. From 2026-10 five other college apps file their bugs into
// this same table, tagged with application_id. Those are NOT MyJKKN code. This
// route filters `application_id IS NULL` on both job types and defaults safe, so
// a foreign row arriving before the cross-app path is finished is SKIPPED rather
// than analysed against the wrong product. (Foreign-app triage is a separate
// tab's work, from its own Supabase project.)
//
// Auth + shape match app/api/cron/bug-cluster-scan/route.ts (CRON_SECRET via
// Authorization: Bearer header OR ?secret=, service-role client).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { parseBriefing } from '@/lib/api/bug-reports/handlers/ai-triage';
import {
  parseCheck,
  persist as persistDuplicateCheck,
  CANDIDATE_LIMIT,
  CANDIDATE_FLOOR,
  CANDIDATE_DESC_CHARS,
  type CandidateRow
} from '@/lib/api/bug-reports/handlers/duplicate-check';
import { readCount } from '@/lib/bug-reports/read-count';

type Admin = ReturnType<typeof createServiceRoleClient>;

const TRIAGE = 'bug.triage';
const DUPCHECK = 'bug.duplicate_check';
const OPEN_STATUSES = ['new', 'seen', 'in_progress'];

/** Collect is cheap (a claim + a metadata write each) — drain generously. */
const COLLECT_LIMIT = 100;
/** Hours a terminal job for the same report suppresses a resubmit. */
const RECENT_JOB_HOURS = 24;

// ── Pacing policy (platform_policies, global scope) ──────────────────────────
// Code defaults make this work the moment it deploys, before the migration that
// seeds the rows is applied. Every default is the conservative end.
const POLICY = {
  /** Master switch. false = submit nothing (collect still runs, so answers
   *  already in flight still reach their cards). */
  enabled: 'bug_reports.ai_auto.enabled',
  /** Reports submitted per tick. ×2 job types = jobs per hour. Sized from a
   *  MEASURED run (2026-10-10): a bug.triage job finished in 19s and a
   *  bug.duplicate_check in 9s, so 15 reports/hour is ~30 jobs ≈ 7 minutes of
   *  lane time per hour against 2 reliable Windows workers. That clears the
   *  187-report approved backlog in about 13 hours and the whole 603-report open
   *  queue in under two days — the Director's "a small batch per hour, clearing
   *  over a day or two". An earlier guess of 6 would have taken four days. */
  batchPerTick: 'bug_reports.ai_auto.batch_per_tick',
  /** Which OTHER college apps' bug reports may get text-only AI triage here.
   *  A list of app slugs; EMPTY means none, which is the shipped default and
   *  makes the whole sibling path inert. See the sibling block in submit(). */
  siblingAllowlist: 'bug_reports.ai_auto.sibling_app_allowlist',
  /** Oldest report the catch-up reaches back to. The Director's "already open"
   *  was scoped to the post-14-Aug arrivals; 416 open reports predate that and
   *  are deliberately out of reach until he widens this row. No deploy needed. */
  backlogSince: 'bug_reports.ai_auto.backlog_since'
} as const;

const DEFAULT_ENABLED = true;
const DEFAULT_BATCH_PER_TICK = 15;
const DEFAULT_BACKLOG_SINCE = '2026-08-14';
/** EMPTY on purpose. Nothing about another product is analysed until the
 *  Director names an app in the policy row — no deploy needed to do that. */
const DEFAULT_SIBLING_ALLOWLIST: string[] = [];

async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await (admin as any).rpc('fn_get_policy', {
      p_key: key,
      p_scope_id: null
    });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get('mode') ?? 'both';
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const batchOverride = readCount(req.nextUrl.searchParams.get('batch'));
  // null = "no override, read the policy row". An EMPTY ?sibling= is a
  // deliberate "none this run", which is why absence and empty differ here too.
  const siblingRaw = req.nextUrl.searchParams.get('sibling');
  const siblingOverride =
    siblingRaw === null
      ? null
      : siblingRaw
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '');

  const admin = createServiceRoleClient();
  const startedAt = Date.now();

  // COLLECT FIRST — see the header. Never gated by the enabled switch: results
  // already paid for must always reach the card.
  const collected =
    mode === 'submit' ? null : await collect(admin, dry);

  const submitted =
    mode === 'collect' ? null : await submit(admin, dry, batchOverride, siblingOverride);

  return NextResponse.json({
    ok: true,
    mode,
    dry,
    collect: collected,
    submit: submitted,
    elapsed_ms: Date.now() - startedAt
  });
}

// ════════════════════════════════════════════════════════════════════════════
// COLLECT — claim finished jobs and write their answers onto the bug card
// ════════════════════════════════════════════════════════════════════════════
interface CollectReport {
  claimed: number;
  persisted_triage: number;
  persisted_dupcheck: number;
  /** Jobs with no _ctx.report_id — a click-path job (the button never set _ctx)
   *  swept up by the same claim. Not an error: nothing for us to persist, and the
   *  click path already persisted it itself. */
  no_context: number;
  unparseable: number;
  /** Click-era jobs whose answer was reunited with its bug card via the dedupe
   *  key, because the original request timed out before it could persist. */
  recovered: number;
  /** Recovered answers dropped because the card already shows a newer one. */
  skipped_older: number;
  errors: string[];
}

async function collect(admin: Admin, dry: boolean): Promise<CollectReport> {
  const out: CollectReport = {
    claimed: 0,
    persisted_triage: 0,
    persisted_dupcheck: 0,
    no_context: 0,
    unparseable: 0,
    recovered: 0,
    skipped_older: 0,
    errors: []
  };

  // fn_ai_collect_claim stamps delivered_at under FOR UPDATE SKIP LOCKED, so a
  // finished job is handed to exactly one collector, once. On a dry run we must
  // NOT claim (it would consume the delivery) — read instead.
  let rows: Array<{
    id: string;
    job_type: string;
    payload: Record<string, unknown> | null;
    result: unknown;
    completed_at: string | null;
  }> = [];

  if (dry) {
    const { data, error } = await (admin as any)
      .from('ai_jobs')
      .select('id, job_type, payload, result, completed_at')
      .in('job_type', [TRIAGE, DUPCHECK])
      .eq('status', 'done')
      .is('delivered_at', null)
      .order('completed_at', { ascending: true })
      .limit(COLLECT_LIMIT);
    if (error) out.errors.push(`dry read: ${error.message}`);
    rows = Array.isArray(data) ? data : [];
  } else {
    const { data, error } = await (admin as any).rpc('fn_ai_collect_claim', {
      p_job_types: [TRIAGE, DUPCHECK],
      p_limit: COLLECT_LIMIT
    });
    if (error) out.errors.push(`collect claim: ${error.message}`);
    rows = Array.isArray(data) ? data : [];
  }

  out.claimed = rows.length;

  for (const row of rows) {
    const ctx = (row.payload?._ctx ?? null) as Record<string, unknown> | null;
    const fromCtx = typeof ctx?.report_id === 'string' ? ctx.report_id : null;

    // RECOVERY OF THE CLICK ERA. 14 finished bug jobs from July/August carry no
    // _ctx — the button never set one. Their briefings were paid for and then
    // lost: the click route long-polls, and when it 504'd before the job
    // finished the answer stayed in ai_jobs.result and no card ever showed it.
    // The report id is still recoverable from the dedupe key the button set
    // ('bug-triage:<uuid>'), so those answers land on their cards instead of
    // being discarded. Triage only: a duplicate check cannot be rebuilt without
    // the shortlist it was asked about (see ctxCandidates), and storing a
    // verdict whose canonical could not be verified would be worse than none.
    const reportId = fromCtx ?? (row.job_type === TRIAGE ? reportIdFromDedupe(row.payload) : null);
    if (!reportId) {
      out.no_context += 1;
      continue;
    }
    const recovered = !fromCtx;

    try {
      if (row.job_type === TRIAGE) {
        const briefing = parseBriefing(row.result);
        if (!briefing) {
          out.unparseable += 1;
          continue;
        }
        // A recovered answer is dated when the MODEL produced it, not now — a
        // July briefing must not read as written today, and the click path's own
        // orphan check compares this stamp against a job's completed_at.
        const generatedAt =
          recovered && row.completed_at ? row.completed_at : new Date().toISOString();

        // NEVER REPLACE A NEWER BRIEFING WITH AN OLDER ONE. The click path
        // guards this (`orphan.completed_at > storedGeneratedAt`) and recovery
        // needs the same guard: the undelivered jobs span July to August, and a
        // report that was re-briefed later already shows the better answer.
        // Today every one of those reports has exactly one finished job, so the
        // guard changes nothing — which is precisely why it has to be written
        // now rather than after a second job exists.
        if (recovered && !(await isNewerThanStored(admin, reportId, generatedAt))) {
          out.skipped_older += 1;
          continue;
        }

        if (!dry) {
          await persistTriage(admin, reportId, {
            ...briefing,
            generated_at: generatedAt,
            job_id: row.id,
            lane: 'max',
            source: recovered ? 'recovered' : 'auto'
          });
        }
        out.persisted_triage += 1;
        if (recovered) out.recovered += 1;
      } else if (row.job_type === DUPCHECK) {
        // sanitize() inside parseCheck resolves the canonical the model NAMES
        // back against the shortlist we actually SENT, so a hallucinated bug id
        // can never become a link. A later tick no longer has that shortlist in
        // hand, which is exactly why submit stashes it in _ctx.
        const candidates = ctxCandidates(ctx);
        const check = parseCheck(row.result, candidates);
        if (!check) {
          out.unparseable += 1;
          continue;
        }
        if (!dry) {
          await persistDuplicateCheck(admin as any, reportId, {
            ...check,
            candidates_considered: candidates.length,
            generated_at: new Date().toISOString(),
            job_id: row.id,
            lane: 'max',
            source: 'auto'
          });
        }
        out.persisted_dupcheck += 1;
      }
    } catch (e: any) {
      out.errors.push(`${row.job_type} ${reportId}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }

  return out;
}

/**
 * Would this stamp be an improvement on what the card already shows? True when
 * the card has no briefing at all, or its stored one is older. Fails CLOSED
 * (false) on an unreadable row: skipping a recovery costs one stale card,
 * overwriting a good briefing costs the better answer.
 */
async function isNewerThanStored(
  admin: Admin,
  reportId: string,
  generatedAt: string
): Promise<boolean> {
  const { data, error } = await (admin as any)
    .from('bug_reports')
    .select('metadata')
    .eq('id', reportId)
    .maybeSingle();
  if (error) return false;
  const stored = (data?.metadata as any)?.ai_triage?.generated_at;
  if (typeof stored !== 'string' || stored.length === 0) return true;
  return new Date(generatedAt).getTime() > new Date(stored).getTime();
}

/**
 * Pull the bug-report id out of the dedupe key the click path set. Strict on
 * purpose: prefix must match the job type's own convention and the remainder
 * must look like a uuid, so a differently-shaped key is ignored rather than
 * guessed at.
 */
function reportIdFromDedupe(payload: Record<string, unknown> | null): string | null {
  const key = typeof payload?._dedupe === 'string' ? payload._dedupe : '';
  const m = /^bug-triage:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    key
  );
  return m ? m[1] : null;
}

/** The shortlist submit stashed, rehydrated into the shape sanitize() reads.
 *  Only bug_id and display_id are load-bearing there, so only those are stored
 *  — the payload stays small. */
function ctxCandidates(ctx: Record<string, unknown> | null): CandidateRow[] {
  const raw = Array.isArray(ctx?.candidates) ? (ctx!.candidates as any[]) : [];
  return raw
    .filter((c) => c && typeof c.bug_id === 'string')
    .map((c) => ({
      bug_id: c.bug_id as string,
      display_id: typeof c.display_id === 'string' ? c.display_id : null,
      status: null,
      module_name: null,
      sub_module_name: null,
      description: null,
      similarity: null,
      in_cluster: null
    }));
}

/** Merge the briefing into metadata, re-reading first to shrink the window in
 *  which a concurrent metadata write could be clobbered. Mirrors the click
 *  path's own persist step exactly. */
async function persistTriage(
  admin: Admin,
  reportId: string,
  stored: Record<string, unknown>
) {
  const { data: fresh } = await (admin as any)
    .from('bug_reports')
    .select('metadata')
    .eq('id', reportId)
    .maybeSingle();

  const { error } = await (admin as any)
    .from('bug_reports')
    .update({ metadata: { ...(fresh?.metadata ?? {}), ai_triage: stored } })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

// ════════════════════════════════════════════════════════════════════════════
// SUBMIT — queue a small batch of reports that have no AI text yet
// ════════════════════════════════════════════════════════════════════════════
interface SubmitReport {
  enabled: boolean;
  batch_per_tick: number;
  backlog_since: string;
  /** Rows the filter returned — reports missing at least one answer. Compare
   *  against the batch: if it is persistently 0 while open reports exist, the
   *  drip has finished its reach, not stalled. */
  fetched: number;
  considered: number;
  triage_queued: number;
  dupcheck_queued: number;
  /** Written straight to the card with no AI call: nothing in the backlog was
   *  worded closely enough to be worth comparing. The click path does the same. */
  dupcheck_no_candidates: number;
  skipped_in_flight: number;
  skipped_recent_job: number;
  skipped_no_description: number;
  /** Other college apps whose reports this tick was allowed to triage. Empty =
   *  the sibling path did not run at all. */
  sibling_apps: string[];
  sibling_considered: number;
  sibling_triage_queued: number;
  errors: string[];
}

async function submit(
  admin: Admin,
  dry: boolean,
  batchOverride: number | null,
  siblingOverride: string[] | null
): Promise<SubmitReport> {
  const enabledRaw = await readPolicy(admin, POLICY.enabled);
  const batchRaw = await readPolicy(admin, POLICY.batchPerTick);
  const sinceRaw = await readPolicy(admin, POLICY.backlogSince);

  // Precedence: query override → policy row → code default. readCount returns
  // null for "absent or unusable" at every layer, so a missing policy row can
  // never masquerade as an explicit 0. An explicit ?batch=0 or a seeded 0 DOES
  // pause the drip — that is the point of distinguishing them.
  const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : DEFAULT_ENABLED;
  const batch = batchOverride ?? readCount(batchRaw) ?? DEFAULT_BATCH_PER_TICK;
  const since =
    typeof sinceRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sinceRaw)
      ? sinceRaw
      : DEFAULT_BACKLOG_SINCE;

  const out: SubmitReport = {
    enabled,
    batch_per_tick: batch,
    backlog_since: since,
    fetched: 0,
    considered: 0,
    triage_queued: 0,
    dupcheck_queued: 0,
    dupcheck_no_candidates: 0,
    skipped_in_flight: 0,
    skipped_recent_job: 0,
    skipped_no_description: 0,
    sibling_apps: [],
    sibling_considered: 0,
    sibling_triage_queued: 0,
    errors: []
  };

  if (!enabled || batch === 0) return out;

  // ASK THE DATABASE FOR WORK, NOT FOR ROWS.
  //
  // An earlier version fetched the newest batch*6 open reports and skipped the
  // ones that already had both answers. That stalls: after six good ticks the
  // whole fetched window is done, every row skips, and nothing is ever queued
  // again — while the oldest reports in the backlog are never reached. It also
  // hides, because the bug-lane-watch alarm only asks "were any bug jobs queued
  // in 24h", and brand-new reports sort to the top and keep getting queued, so
  // the alarm stays quiet while the band beneath them is starved.
  //
  // So the filter now says what we actually want: a report MISSING at least one
  // of the two answers. The set shrinks as the backlog drains instead of the
  // window going stale, which makes the drip structurally unable to stall.
  // Newest first, so today's report is helped on the next tick and the backlog
  // fills whatever room is left. A little headroom over `batch` absorbs the two
  // skips below (no description, or a job tried within the last 24 hours).
  const { data: rows, error } = await (admin as any)
    .from('bug_reports')
    .select(
      'id, display_id, description, page_url, module_name, sub_module_name, category, console_logs, metadata, created_at'
    )
    .in('status', OPEN_STATUSES)
    .is('application_id', null) // MyJKKN's own code only — see the header
    .gte('created_at', since)
    .or('metadata->ai_triage.is.null,metadata->ai_duplicate_check.is.null')
    .order('created_at', { ascending: false })
    .limit(Math.max(batch * 4, 20));

  if (error) {
    out.errors.push(`candidate read: ${error.message}`);
    return out;
  }

  const candidates = Array.isArray(rows) ? rows : [];
  out.fetched = candidates.length;

  for (const bug of candidates) {
    if (out.considered >= batch) break;

    const meta = (bug.metadata ?? {}) as Record<string, unknown>;
    const needsTriage = !meta.ai_triage;
    const needsDupcheck = !meta.ai_duplicate_check;
    if (!needsTriage && !needsDupcheck) continue; // belt-and-braces; filtered above

    if (!bug.description || String(bug.description).trim().length === 0) {
      out.skipped_no_description += 1;
      continue;
    }

    // DECIDE BEFORE SPENDING A SLOT. The 24-hour guard is checked first, and a
    // report with nothing actionable does NOT count against this tick's batch.
    // Counting it first was the second half of the same stall: an ERRORED report
    // has no metadata, so it is re-fetched every tick, and fifteen of them in
    // one bad lane hour would consume all fifteen slots every tick for a day
    // while nothing was queued at all.
    const triageDedupe = `bug-triage:${bug.id}`;
    const dupDedupe = `bug-dupcheck:${bug.id}`;
    const triageRecent = needsTriage ? await hasRecentJob(admin, TRIAGE, triageDedupe) : false;
    const dupRecent = needsDupcheck ? await hasRecentJob(admin, DUPCHECK, dupDedupe) : false;

    const doTriage = needsTriage && !triageRecent;
    const doDupcheck = needsDupcheck && !dupRecent;
    if (!doTriage && !doDupcheck) {
      out.skipped_recent_job += 1;
      continue; // no slot spent
    }

    out.considered += 1;

    if (doTriage) {
      if (dry) {
        out.triage_queued += 1;
      } else {
        const r = await enqueueTriage(admin, bug, triageDedupe);
        if (r === 'queued') out.triage_queued += 1;
        else if (r === 'in_flight') out.skipped_in_flight += 1;
        else out.errors.push(`triage ${bug.display_id ?? bug.id}: ${r}`);
      }
    }

    if (doDupcheck) {
      const r = await enqueueDupcheck(admin, bug, dupDedupe, dry);
      if (r === 'queued') out.dupcheck_queued += 1;
      else if (r === 'no_candidates') out.dupcheck_no_candidates += 1;
      else if (r === 'in_flight') out.skipped_in_flight += 1;
      else out.errors.push(`dupcheck ${bug.display_id ?? bug.id}: ${r}`);
    }
  }

  await submitSiblingApps(admin, dry, batch, out, siblingOverride);
  return out;
}

/**
 * TEXT-ONLY TRIAGE FOR THE OTHER COLLEGE APPS (Mentor, TMS, COE, Library, Event
 * Forms), which file into this same table carrying application_id.
 *
 * The Director's instruction was to route those rows to text-only triage rather
 * than drop them, and NEVER to the Mac runners. Both halves hold here:
 *
 *   • bug.triage and bug.duplicate_check are tool_set='none' in ai_job_types —
 *     text in, text out, no repository checkout anywhere. Verified in the
 *     registry, not assumed. So a Mentor bug read by bug.triage cannot touch
 *     MyJKKN source.
 *   • fixability and cluster_fix DO build a worktree of the MyJKKN checkout.
 *     Those run from bug-cluster-scan, which stays filtered to
 *     `application_id IS NULL`. Nothing here changes that.
 *
 * MODULE ROUTING IS IGNORED for these rows, as instructed: module_name is
 * MyJKKN's own taxonomy and means nothing for another product, so the prompt's
 * module slots carry the app's name instead of a MyJKKN module.
 *
 * NO DUPLICATE CHECK for these rows. fn_bug_duplicate_candidates is not
 * app-scoped, so it would shortlist MyJKKN bugs as candidates for a Mentor bug
 * and the model would be asked to compare across two different products.
 * Skipped until that function can be given an app filter — a wrong "possible
 * duplicate of X" pointing at another product's bug is worse than no verdict.
 *
 * INERT BY DEFAULT. The allowlist ships EMPTY, so this function returns before
 * reading anything and the tick behaves exactly as the MyJKKN-only version that
 * was verified. It also fails closed twice over: a row whose app slug cannot be
 * read is not selected, so a slug stored under a key this code does not know is
 * skipped rather than mis-triaged.
 *
 * ⚠ UNVERIFIED END TO END. Production holds ZERO rows with application_id set
 * (checked 2026-10-10 18:10), because the intake and backfill PRs are both still
 * drafts. This path has therefore never run against a real sibling row. It must
 * be exercised the day the intake lands, BEFORE the allowlist is switched on.
 */
async function submitSiblingApps(
  admin: Admin,
  dry: boolean,
  batch: number,
  out: SubmitReport,
  allowOverride: string[] | null
): Promise<void> {
  // ?sibling=slug,slug overrides the allowlist for ONE run, the same way
  // ?batch= and ?fixability= do. It exists so this path can be exercised the day
  // the intake lands — against a real sibling row, with `dry=1` first — without
  // first switching it on for everybody via the policy row.
  const allow = allowOverride ?? (await readAllowlist(admin));
  if (allow.length === 0) return; // shipped default — nothing to do
  out.sibling_apps = allow;

  const { data: rows, error } = await (admin as any)
    .from('bug_reports')
    .select('id, display_id, description, page_url, category, metadata, console_logs, created_at')
    .in('status', OPEN_STATUSES)
    .not('application_id', 'is', null)
    .is('metadata->ai_triage', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(batch * 4, 20));

  if (error) {
    out.errors.push(`sibling read: ${error.message}`);
    return;
  }

  for (const bug of Array.isArray(rows) ? rows : []) {
    if (out.sibling_considered >= batch) break;

    // Slug match in code, not in the query: the set is small, and this keeps the
    // one unverified assumption (which metadata key holds the slug) in plain
    // sight instead of inside a PostgREST filter string.
    const meta = (bug.metadata ?? {}) as Record<string, unknown>;
    const slug = typeof meta.source_app === 'string' ? meta.source_app : null;
    if (!slug || !allow.includes(slug)) continue; // fails closed

    if (!bug.description || String(bug.description).trim().length === 0) {
      out.skipped_no_description += 1;
      continue;
    }

    const dedupe = `bug-triage:${bug.id}`;
    if (await hasRecentJob(admin, TRIAGE, dedupe)) {
      out.skipped_recent_job += 1;
      continue;
    }

    out.sibling_considered += 1;
    if (dry) {
      out.sibling_triage_queued += 1;
      continue;
    }

    const appName = typeof meta.source_app_name === 'string' ? meta.source_app_name : slug;
    const r = await enqueueTriage(
      admin,
      { ...bug, module_name: appName, sub_module_name: '(sibling app)' },
      dedupe
    );
    if (r === 'queued') out.sibling_triage_queued += 1;
    else if (r === 'in_flight') out.skipped_in_flight += 1;
    else out.errors.push(`sibling triage ${bug.display_id ?? bug.id}: ${r}`);
  }
}

/** App slugs allowed text-only triage. Anything that is not an array of
 *  non-empty strings reads as EMPTY, so a malformed row disables the path
 *  rather than enabling it for an unknown app. */
async function readAllowlist(admin: Admin): Promise<string[]> {
  const raw = await readPolicy(admin, POLICY.siblingAllowlist);
  if (!Array.isArray(raw)) return DEFAULT_SIBLING_ALLOWLIST;
  const slugs = raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return slugs.map((v) => v.trim());
}

/**
 * Has a job for this report already reached a terminal state recently?
 *
 * fn_ai_enqueue_system's dedupe guard only rejects a job that is still pending,
 * claimed or running — once it is done or error, an identical enqueue succeeds.
 * Without this check a report whose job errored would be re-queued on EVERY
 * tick, burning the lane on the same failure forever. One retry a day instead.
 */
async function hasRecentJob(
  admin: Admin,
  jobType: string,
  dedupe: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - RECENT_JOB_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await (admin as any)
    .from('ai_jobs')
    .select('id')
    .eq('job_type', jobType)
    .filter('payload->>_dedupe', 'eq', dedupe)
    .gte('requested_at', cutoff)
    .limit(1);
  // Fail CLOSED: if we cannot tell, do not queue. A skipped tick costs an hour;
  // a runaway re-queue loop costs the lane.
  if (error) return true;
  return Array.isArray(data) && data.length > 0;
}

type EnqueueOutcome = 'queued' | 'in_flight' | 'no_candidates' | string;

/** Payload keys MUST match the bug.triage registry contract — the same object
 *  the click path builds, plus _ctx for the collect tick. */
async function enqueueTriage(
  admin: Admin,
  bug: any,
  dedupe: string
): Promise<EnqueueOutcome> {
  let consoleExcerpt = '';
  if (Array.isArray(bug.console_logs) && bug.console_logs.length > 0) {
    const errorish = bug.console_logs.filter(
      (l: any) => l && (l.type === 'error' || l.level === 'error')
    );
    const picked = (errorish.length > 0 ? errorish : bug.console_logs).slice(0, 3);
    consoleExcerpt = JSON.stringify(picked).slice(0, 1500);
  }

  const payload = {
    display_id: bug.display_id ?? bug.id,
    page_url: bug.page_url ?? '',
    module_name: bug.module_name ?? '',
    sub_module_name: bug.sub_module_name ?? '',
    category: bug.category ?? '',
    description: (bug.description ?? '').slice(0, 4000),
    console_excerpt: consoleExcerpt,
    _ctx: { report_id: bug.id, kind: 'triage' }
  };

  return enqueue(admin, TRIAGE, payload, dedupe);
}

/** The duplicate check needs a trigram shortlist first. No shortlist means
 *  nothing is worth comparing — the click path writes a "distinct" note with no
 *  AI call at all, and so do we, so the card is never blank for that reason. */
async function enqueueDupcheck(
  admin: Admin,
  bug: any,
  dedupe: string,
  dry: boolean
): Promise<EnqueueOutcome> {
  const { data: candidateRows, error } = await (admin as any).rpc(
    'fn_bug_duplicate_candidates',
    {
      p_bug_id: bug.id,
      p_limit: CANDIDATE_LIMIT,
      p_min_similarity: CANDIDATE_FLOOR
    }
  );
  if (error) return `candidates: ${error.message}`;

  const candidates: CandidateRow[] = Array.isArray(candidateRows) ? candidateRows : [];

  if (candidates.length === 0) {
    if (!dry) {
      await persistDuplicateCheck(admin as any, bug.id, {
        verdict: 'distinct',
        canonical_display_id: null,
        canonical_bug_id: null,
        confidence: 'medium',
        reasoning:
          'No other open report came close enough in wording to be worth comparing, so this looks like its own issue.',
        also_consider: [],
        candidates_considered: 0,
        generated_at: new Date().toISOString(),
        job_id: null,
        lane: 'none',
        source: 'auto'
      });
    }
    return 'no_candidates';
  }

  // Reporter text is untrusted: newlines are flattened so a crafted description
  // cannot fake extra candidate rows or an end-of-data marker in the prompt.
  const candidateBlock = candidates
    .map((c) => {
      const desc = (c.description ?? '').replace(/\s+/g, ' ').slice(0, CANDIDATE_DESC_CHARS);
      const mod = [c.module_name, c.sub_module_name].filter(Boolean).join('/');
      return `${c.display_id ?? c.bug_id} | ${mod || 'unknown'} | ${desc}`;
    })
    .join('\n');

  const payload = {
    display_id: bug.display_id ?? bug.id,
    module_name: [bug.module_name, bug.sub_module_name].filter(Boolean).join('/') || '',
    description: (bug.description ?? '').slice(0, 4000),
    candidates: candidateBlock,
    _ctx: {
      report_id: bug.id,
      kind: 'dupcheck',
      // Only what sanitize() needs to resolve a named canonical.
      candidates: candidates.map((c) => ({ bug_id: c.bug_id, display_id: c.display_id }))
    }
  };

  if (dry) return 'queued';
  return enqueue(admin, DUPCHECK, payload, dedupe);
}

async function enqueue(
  admin: Admin,
  jobType: string,
  payload: Record<string, unknown>,
  dedupe: string
): Promise<EnqueueOutcome> {
  const { data, error } = await (admin as any).rpc('fn_ai_enqueue_system', {
    p_job_type: jobType,
    p_payload: payload,
    p_dedupe_key: dedupe
  });
  if (error) return error.message;
  if (data?.ok === true) return 'queued';
  return data?.error === 'in_flight' ? 'in_flight' : (data?.error ?? 'enqueue failed');
}
