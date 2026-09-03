import 'server-only';

// lib/services/loops/pending-prs.ts
//
// "Builds waiting for the Director's merge" — the GitHub source for the
// Waiting-on-the-Director panel on /admin/loops (Director decision Q8,
// 2026-09-02: a finished build waiting for his merge is a decision like any
// other and must age on that panel under the same 7-day rule).
//
// What counts as "waiting for merge" (Director decisions D1–D3, 2026-09-02):
//   D1 — every OPEN, NON-DRAFT pull request on Jicate-Solutions/MyJKKN whose
//        head commit's check runs are all complete and none is blocking,
//        EXCEPT PRs carrying the GitHub label `parked` (exact name) — the
//        Director applies that label himself to builds he has deliberately
//        set aside.
//   P1 — a PR GitHub reports as merge-CONFLICTED (`mergeable === false` /
//        `mergeable_state === 'dirty'`) cannot be merged by him, so it is not
//        waiting on him: it is counted (`conflicted`) and never aged.
//   D3 — the clock starts when the PR became READY for review (the
//        `ready_for_review` event on the issue timeline, latest one wins);
//        a PR that was never a draft ages from `created_at`.
//
// "Blocking" uses the SAME vocabulary as the merge guard — the exported
// NON_BLOCKING_CONCLUSIONS set in lib/services/orchestration/github-merge.ts
// (success / skipped / neutral / cancelled are non-blocking; anything else
// that completed is red). A PR listed here with `checks: 'green'` is one the
// console's Merge button would accept; a `checks: 'none'` row is NOT — the
// guard's checkRunsVerdict refuses a head with zero runs — so that row is a
// "merge on GitHub" hint, not a console-merge candidate (post-verdict note a).
// A PR with CI still running, or with a red gate, is NOT waiting on the
// Director yet; it is waiting on the build.
//
// A PR with ZERO check runs is NOT "waiting on the build" — nothing will ever
// run. Workflows in this repo fire only on PRs into `main`, so a PR whose base
// is a feature branch never gets a check run, and PRs opened while Actions
// was dark (2026-08-22→25) never got one either. Measured 2026-09-02: 4 of
// 30 open non-draft PRs, three of them security fixes 9 days old. Such a PR
// is still his decision, so it is an aging row marked "no checks ran"
// (`checks: 'none'`) — never dropped (reviewer B, reconcile round, obj. 1).
//
// Every open, non-draft PR lands in exactly ONE bucket, so the counts
// reconcile against GitHub's open-PR list (obj. 5):
//   prs (checks green|none, mergeable) · unverified · conflicted · red
//   (a completed blocking gate — waiting on the build) · parked · unchecked.
// Merge state is read for every PR that is not red, so a conflicted PR with
// no checks (or unreadable checks) is counted as conflicted, not lost.
//
// Token / client shape: deliberately the same as the two existing GitHub
// readers (github-merge.ts and app/api/cron/orchestration-sync/route.ts) —
// plain fetch against api.github.com with a Bearer PAT from ORCH_GITHUB_TOKEN
// (GITHUB_TOKEN as the fallback the sync cron also accepts). This file adds
// no second way to talk to GitHub.
//
// Failure discipline (rule #27 — explicit, never silent):
//   • a failure to read the PR LIST comes back as `{ ok: false, reason }` so
//     the panel can SAY "could not read GitHub" rather than render an empty
//     list that reads as "nothing waiting";
//   • a failure to read ONE PR's checks or merge state never drops that PR —
//     it comes back in `unverified` with the reason, and the panel renders it
//     as a visible "could not be verified" row;
//   • a failure to read ONE PR's timeline falls back to `created_at` and says
//     so (`readySinceSource: 'unverified'`).
// Nothing here throws to the page.
//
// Rate budget: the PAT is shared with the orchestration-sync cron, so the
// fan-out is capped at GH_CONCURRENCY (6) parallel requests and every call
// after the list is gated on the previous verdict (red PRs cost one call,
// conflicted ones two, ready ones three). /admin/loops is force-dynamic, so a
// module-level memo (per warm server instance, PENDING_PRS_TTL_MS) reuses one
// read for 5 minutes — no table, no cron, no new mechanism. A stale-by-up-to-
// 5-minutes answer is fine for a panel measured in days.
//
// Budget guard (obj. 4): every response's `x-ratelimit-remaining` is read;
// below RATE_LIMIT_FLOOR the read stops issuing calls and comes back as
// `{ ok: false }` naming the remaining budget, so a burst of cold panel loads
// can never exhaust the PAT the sync cron and the merge guard depend on. A
// 403 / 429 is reported as the same class of failure, explicitly.
//
// Deadline (obj. 2/3): one AbortController per read, TOTAL_DEADLINE_MS under
// the page's `maxDuration` (120 s), raced to `{ ok: false, reason: 'GitHub
// read timed out …' }` — so a slow GitHub renders an explicit line instead
// of a Suspense fallback that never resolves.

import { NON_BLOCKING_CONCLUSIONS } from '@/lib/services/orchestration/github-merge';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

/** Director decision D1: this exact label means "deliberately set aside". */
export const PARKED_LABEL = 'parked';

/** How long one GitHub read is reused before the next page load refetches. */
const PENDING_PRS_TTL_MS = 5 * 60_000;
/**
 * Cap on PRs whose check runs are read per refresh (bounds the fan-out).
 * Measured 2026-09-02: 107 open / 90 non-draft PRs, so 120 covers the whole
 * estate with headroom; anything past the cap is reported as `unchecked`
 * so the panel can say "N more builds were not checked" — never dropped
 * silently. Oldest-first, so the cap can only ever hide the NEWEST PRs.
 */
const MAX_PRS_CHECKED = 120;
/** Reviewer finding P3: the token is shared with the sync cron — stay small. */
const GH_CONCURRENCY = 6;
/**
 * Timeline pages read per ready PR when looking for its `ready_for_review`
 * event (100 events per page). A PR with more events than this keeps the
 * latest flip seen so far — an OLDER date, i.e. the wait can only be
 * over-stated, never hidden.
 */
const MAX_TIMELINE_PAGES = 5;
/**
 * Overall deadline for one GitHub read. Same idiom as TOTAL_DEADLINE_MS in
 * app/api/cdc/career-guidance/route.ts — kept under the page's
 * `maxDuration = 120` (app/(routes)/admin/loops/page.tsx); this bounds only
 * the GitHub tail, the page limit covers the whole render. Measured cold
 * read 2026-09-02: 26 s.
 */
const TOTAL_DEADLINE_MS = 40_000;
/**
 * Stop issuing calls when the shared PAT's hourly budget drops below this.
 * The orchestration-sync cron (22,52 * * * *) needs ~380 calls/hour and the
 * merge guard a handful per merge; 1,000 keeps both alive through the hour.
 */
const RATE_LIMIT_FLOOR = 1_000;

export interface PendingPr {
  number: number;
  title: string;
  /** Deep link to the PR on GitHub. */
  url: string;
  /** When the PR was opened (GitHub `created_at`). */
  createdAt: string;
  /**
   * When the wait on the Director started (D3): the latest
   * `ready_for_review` timeline event, else `created_at` for a PR that was
   * never a draft. This is what the panel ages from.
   */
  readySince: string;
  /**
   * 'ready_for_review' — a draft→ready flip was found on the timeline;
   * 'created_at' — the timeline was read and holds no flip (never a draft);
   * 'unverified' — the timeline could NOT be read, so `created_at` is used
   * and the panel says so.
   */
  readySinceSource: 'ready_for_review' | 'created_at' | 'unverified';
  /**
   * 'green' — every head-commit check run completed and none blocks;
   * 'none'  — the head commit has NO check runs at all (no workflow will
   *           ever fire on it, e.g. base is a feature branch). Still his
   *           decision; the row says "no checks ran".
   */
  checks: 'green' | 'none';
}

/** A PR whose checks or merge state could not be read — shown, never aged. */
export interface UnverifiedPr {
  number: number;
  title: string;
  url: string;
  /** Plain-English reason, e.g. "checks could not be verified". */
  reason: string;
}

export type PendingPrsResult =
  | {
      ok: true;
      /**
       * Mergeable, non-parked, non-draft, checks green OR none — waiting on
       * the Director. Oldest wait first.
       */
      prs: PendingPr[];
      /** PRs whose checks/merge state could not be read (rule #27). */
      unverified: UnverifiedPr[];
      /** PRs GitHub reports as merge-conflicted — not waiting on him (P1). */
      conflicted: number;
      /** PRs with a completed blocking gate — waiting on the build, not him. */
      red: number;
      /** Open non-draft PRs carrying the `parked` label (D1) — set aside. */
      parked: number;
      /** Candidate PRs past MAX_PRS_CHECKED whose checks were NOT read. */
      unchecked: number;
    }
  | { ok: false; reason: string };

interface GitHubPrListItem {
  number: number;
  title: string;
  draft: boolean;
  html_url: string;
  created_at: string;
  head: { sha: string };
  labels?: { name?: string }[];
}

interface GitHubCheckRun {
  status: string;
  conclusion: string | null;
}

interface GitHubPrDetail {
  mergeable: boolean | null;
  mergeable_state?: string;
}

interface GitHubTimelineEvent {
  event?: string;
  created_at?: string;
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * One read's shared state: the PAT headers, the deadline signal, and the
 * rate budget seen so far. `stopReason` is set the moment a response shows
 * the budget below RATE_LIMIT_FLOOR or a 403/429; every later ghFetch throws
 * without issuing a call, and readPendingPrs turns it into `{ ok: false }`.
 */
interface GhContext {
  headers: HeadersInit;
  signal: AbortSignal;
  /** Last `x-ratelimit-remaining` seen; null until the first response. */
  remaining: number | null;
  stopReason: string | null;
}

/** Thrown by ghFetch once the read must stop — never surfaces as a row. */
class GhStopError extends Error {}

/**
 * The only way this file talks to GitHub: carries the abort signal, reads
 * the rate budget off every response, and refuses to issue a call once the
 * read has been told to stop (budget low, 403/429, or deadline).
 */
async function ghFetch(ctx: GhContext, url: string): Promise<Response> {
  if (ctx.stopReason) throw new GhStopError(ctx.stopReason);
  const res = await fetch(url, { headers: ctx.headers, cache: 'no-store', signal: ctx.signal });
  const remainingHeader = res.headers.get('x-ratelimit-remaining');
  const remaining = remainingHeader === null ? NaN : Number(remainingHeader);
  if (Number.isFinite(remaining)) ctx.remaining = remaining;
  if (res.status === 403 || res.status === 429) {
    const seen = ctx.remaining === null ? '' : `, ${ctx.remaining} remaining`;
    ctx.stopReason = `GitHub refused the read (HTTP ${res.status}${seen}) — rate limit or token scope; protecting the sync cron`;
    throw new GhStopError(ctx.stopReason);
  }
  if (ctx.remaining !== null && ctx.remaining < RATE_LIMIT_FLOOR) {
    ctx.stopReason = `GitHub rate budget low (${ctx.remaining} remaining) — protecting the sync cron`;
    throw new GhStopError(ctx.stopReason);
  }
  return res;
}

async function fetchOpenPrList(ctx: GhContext): Promise<GitHubPrListItem[]> {
  const out: GitHubPrListItem[] = [];
  let page = 1;
  // Same 10-page safety cap as the sync cron.
  while (page <= 10) {
    const res = await ghFetch(
      ctx,
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=100&page=${page}&sort=created&direction=asc`,
    );
    if (!res.ok) {
      throw new Error(`GitHub pulls list failed: HTTP ${res.status}`);
    }
    const batch = (await res.json()) as GitHubPrListItem[];
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return out;
}

function isParked(pr: GitHubPrListItem): boolean {
  return (pr.labels ?? []).some((l) => l?.name === PARKED_LABEL);
}

type ChecksState = 'green' | 'red' | 'none';

/**
 * Reads the head commit's check runs: 'green' (all completed, none blocking),
 * 'red' (still running or a blocking conclusion — waiting on the build),
 * 'none' (no check run exists — no workflow fires on this PR, so it will
 * never become green or red; still his decision). Any failure to read →
 * `null` ("cannot verify"), which the caller never treats as green AND never
 * drops — it becomes a visible "checks could not be verified" row (rule #27).
 */
async function checksState(ctx: GhContext, sha: string): Promise<ChecksState | null> {
  try {
    const res = await ghFetch(
      ctx,
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}/check-runs?per_page=100`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      total_count?: number;
      check_runs?: GitHubCheckRun[];
    };
    const runs = Array.isArray(json.check_runs) ? json.check_runs : null;
    if (!runs) return null;
    if (runs.length === 0) return 'none';
    // Short page = cannot verify.
    if (typeof json.total_count === 'number' && json.total_count > runs.length) return null;
    return runs.every(
      (r) => r.status === 'completed' && NON_BLOCKING_CONCLUSIONS.has(String(r.conclusion)),
    )
      ? 'green'
      : 'red';
  } catch {
    return null;
  }
}

/**
 * Merge state from the single-PR endpoint (the list endpoint omits it).
 * 'conflicted' = GitHub says it cannot be merged as-is; 'clear' = anything
 * else GitHub has computed; null = could not read, or GitHub is still
 * computing (`mergeable: null`) — treated as "cannot verify", never as clear.
 */
async function mergeState(
  ctx: GhContext,
  number: number,
): Promise<'conflicted' | 'clear' | null> {
  try {
    const res = await ghFetch(ctx, `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${number}`);
    if (!res.ok) return null;
    const json = (await res.json()) as GitHubPrDetail;
    if (json.mergeable === false || json.mergeable_state === 'dirty') return 'conflicted';
    if (json.mergeable === true) return 'clear';
    return null;
  } catch {
    return null;
  }
}

/**
 * D3: the latest `ready_for_review` event on the issue timeline. Returns the
 * ISO timestamp, `'none'` when the timeline was read and holds no flip (the
 * PR was never a draft), or null when the timeline could not be read.
 */
async function readyForReviewAt(ctx: GhContext, number: number): Promise<string | 'none' | null> {
  try {
    let latest: string | null = null;
    let page = 1;
    while (page <= MAX_TIMELINE_PAGES) {
      const res = await ghFetch(
        ctx,
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}/timeline?per_page=100&page=${page}`,
      );
      if (!res.ok) return null;
      const events = (await res.json()) as GitHubTimelineEvent[];
      if (!Array.isArray(events)) return null;
      for (const ev of events) {
        if (ev?.event === 'ready_for_review' && typeof ev.created_at === 'string') {
          latest = ev.created_at; // ascending order → the last one seen is the latest flip
        }
      }
      if (events.length < 100) break;
      page += 1;
    }
    return latest ?? 'none';
  } catch {
    return null;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight; order preserved. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type PrVerdict =
  | { kind: 'ready'; pr: PendingPr }
  | { kind: 'unverified'; pr: UnverifiedPr }
  | { kind: 'conflicted' }
  | { kind: 'red' };

/**
 * One PR's full verdict. Exactly one bucket per PR (obj. 5): a red PR costs
 * one request and stops there (it is waiting on the build); everything else
 * — green, no checks, OR unreadable checks — goes on to merge state, so a
 * conflicted PR is counted as conflicted whatever its checks say.
 */
async function judgePr(ctx: GhContext, pr: GitHubPrListItem): Promise<PrVerdict> {
  const base = { number: pr.number, title: pr.title ?? '', url: pr.html_url };

  const checks = pr.head?.sha ? await checksState(ctx, pr.head.sha) : null;
  if (checks === 'red') return { kind: 'red' };

  const merge = await mergeState(ctx, pr.number);
  if (merge === 'conflicted') return { kind: 'conflicted' };
  if (merge === null) {
    const reason =
      checks === null
        ? 'checks and merge state could not be verified'
        : 'merge state could not be verified';
    return { kind: 'unverified', pr: { ...base, reason } };
  }
  if (checks === null) {
    return { kind: 'unverified', pr: { ...base, reason: 'checks could not be verified' } };
  }

  const ready = await readyForReviewAt(ctx, pr.number);
  const readySince = ready === null || ready === 'none' ? pr.created_at : ready;
  const readySinceSource: PendingPr['readySinceSource'] =
    ready === null ? 'unverified' : ready === 'none' ? 'created_at' : 'ready_for_review';
  return {
    kind: 'ready',
    pr: { ...base, createdAt: pr.created_at, readySince, readySinceSource, checks },
  };
}

async function readPendingPrs(ctx: GhContext): Promise<PendingPrsResult> {
  const listed = await fetchOpenPrList(ctx);
  const nonDraft = listed.filter((pr) => !pr.draft);
  // D1: not carrying the `parked` label.
  const candidates = nonDraft.filter((pr) => !isParked(pr));
  const checked = candidates.slice(0, MAX_PRS_CHECKED);

  const verdicts = await mapWithConcurrency(checked, GH_CONCURRENCY, (pr) => judgePr(ctx, pr));
  // A budget stop mid-fan-out leaves every later PR "unverified" for a
  // reason that is not about that PR — report the stop itself instead.
  if (ctx.stopReason) return { ok: false, reason: ctx.stopReason };

  const prs: PendingPr[] = [];
  const unverified: UnverifiedPr[] = [];
  let conflicted = 0;
  let red = 0;
  for (const v of verdicts) {
    if (v.kind === 'ready') prs.push(v.pr);
    else if (v.kind === 'unverified') unverified.push(v.pr);
    else if (v.kind === 'conflicted') conflicted += 1;
    else red += 1;
  }
  // Longest wait first, by the D3 clock (the list came created-ascending).
  prs.sort((a, b) => new Date(a.readySince).getTime() - new Date(b.readySince).getTime());

  return {
    ok: true,
    prs,
    unverified,
    conflicted,
    red,
    parked: nonDraft.length - candidates.length,
    unchecked: candidates.length - checked.length,
  };
}

// ── In-process memo ──────────────────────────────────────────────────────────
let memo: { at: number; result: PendingPrsResult } | null = null;
// One read in flight at a time per instance: page loads that overlap the
// cold read share it instead of each spending their own GitHub calls.
let inflight: Promise<PendingPrsResult> | null = null;

/**
 * Open, non-draft, non-parked PRs whose checks are green and that GitHub can
 * merge — the builds waiting on the Director's merge — plus the PRs that
 * could not be verified and the count of conflicted ones. Never throws; a
 * missing token or a GitHub failure is an `{ ok: false, reason }` the panel
 * renders as an explicit notice.
 */
export async function loadPendingPrs(now: number = Date.now()): Promise<PendingPrsResult> {
  if (memo && now - memo.at < PENDING_PRS_TTL_MS) return memo.result;

  const token = process.env.ORCH_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    // Not memoised: a token arriving via a redeploy should be picked up at
    // once, and this branch costs no GitHub call.
    return { ok: false, reason: 'GitHub is not connected (no ORCH_GITHUB_TOKEN)' };
  }

  if (inflight) return inflight;
  inflight = readWithDeadline(token).then((result) => {
    // Failures are memoised too: a GitHub outage, a timeout or a low budget
    // shows as a notice for up to one TTL rather than hammering a failing
    // (or nearly exhausted) API on every load.
    memo = { at: now, result };
    inflight = null;
    return result;
  });
  return inflight;
}

/**
 * The read raced against TOTAL_DEADLINE_MS. On the deadline every in-flight
 * fetch is aborted (one controller per read) and the answer is an explicit
 * `{ ok: false, reason: 'GitHub read timed out …' }` — the panel renders a
 * line, not a Suspense fallback that never resolves (obj. 2/3). Never
 * rejects: every failure is an `{ ok: false, reason }`.
 */
function readWithDeadline(token: string): Promise<PendingPrsResult> {
  const controller = new AbortController();
  const ctx: GhContext = {
    headers: ghHeaders(token),
    signal: controller.signal,
    remaining: null,
    stopReason: null,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<PendingPrsResult>((resolve) => {
    timer = setTimeout(() => {
      const reason = `GitHub read timed out after ${TOTAL_DEADLINE_MS / 1000}s`;
      ctx.stopReason = reason;
      controller.abort();
      resolve({ ok: false, reason });
    }, TOTAL_DEADLINE_MS);
  });
  const read = readPendingPrs(ctx).then(
    (result) => result,
    (err): PendingPrsResult => ({
      ok: false,
      // A stop raised inside the list read carries its own reason (budget
      // low / 403 / 429); anything else is the plain failure message.
      reason: err instanceof Error ? err.message : 'GitHub read failed',
    }),
  );
  return Promise.race([read, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
