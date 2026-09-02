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
// that completed is red) — so a PR listed here is exactly one the console's
// Merge button would accept. A PR with CI still running, or with a red gate,
// is NOT waiting on the Director yet; it is waiting on the build.
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
      /** Green, non-conflicted, non-parked, non-draft — waiting on the Director. */
      prs: PendingPr[];
      /** Green PRs whose checks/merge state could not be read (rule #27). */
      unverified: UnverifiedPr[];
      /** Green PRs GitHub reports as merge-conflicted — not waiting on him (P1). */
      conflicted: number;
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

async function fetchOpenPrList(token: string): Promise<GitHubPrListItem[]> {
  const headers = ghHeaders(token);
  const out: GitHubPrListItem[] = [];
  let page = 1;
  // Same 10-page safety cap as the sync cron.
  while (page <= 10) {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=100&page=${page}&sort=created&direction=asc`,
      { headers, cache: 'no-store' },
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

/**
 * Reads the head commit's check runs and says whether they are all green.
 * Any failure to read → `null` ("cannot verify"). The caller never treats
 * null as green AND never drops the PR for it — it becomes a visible
 * "checks could not be verified" row (rule #27).
 */
async function checksAreGreen(headers: HeadersInit, sha: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}/check-runs?per_page=100`,
      { headers, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      total_count?: number;
      check_runs?: GitHubCheckRun[];
    };
    const runs = Array.isArray(json.check_runs) ? json.check_runs : null;
    if (!runs) return null;
    // Zero runs = CI has not started (this repo runs ~26 gates on every PR).
    if (runs.length === 0) return false;
    // Short page = cannot verify.
    if (typeof json.total_count === 'number' && json.total_count > runs.length) return null;
    return runs.every(
      (r) => r.status === 'completed' && NON_BLOCKING_CONCLUSIONS.has(String(r.conclusion)),
    );
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
  headers: HeadersInit,
  number: number,
): Promise<'conflicted' | 'clear' | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${number}`, {
      headers,
      cache: 'no-store',
    });
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
async function readyForReviewAt(headers: HeadersInit, number: number): Promise<string | 'none' | null> {
  try {
    let latest: string | null = null;
    let page = 1;
    while (page <= MAX_TIMELINE_PAGES) {
      const res = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}/timeline?per_page=100&page=${page}`,
        { headers, cache: 'no-store' },
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
  | { kind: 'not-ready' };

/** One PR's full verdict — calls are gated so a red PR costs one request. */
async function judgePr(headers: HeadersInit, pr: GitHubPrListItem): Promise<PrVerdict> {
  const base = { number: pr.number, title: pr.title ?? '', url: pr.html_url };

  const green = pr.head?.sha ? await checksAreGreen(headers, pr.head.sha) : null;
  if (green === null) {
    return { kind: 'unverified', pr: { ...base, reason: 'checks could not be verified' } };
  }
  if (green === false) return { kind: 'not-ready' };

  const merge = await mergeState(headers, pr.number);
  if (merge === null) {
    return { kind: 'unverified', pr: { ...base, reason: 'merge state could not be verified' } };
  }
  if (merge === 'conflicted') return { kind: 'conflicted' };

  const ready = await readyForReviewAt(headers, pr.number);
  const readySince = ready === null || ready === 'none' ? pr.created_at : ready;
  const readySinceSource: PendingPr['readySinceSource'] =
    ready === null ? 'unverified' : ready === 'none' ? 'created_at' : 'ready_for_review';
  return {
    kind: 'ready',
    pr: { ...base, createdAt: pr.created_at, readySince, readySinceSource },
  };
}

async function readPendingPrs(token: string): Promise<Extract<PendingPrsResult, { ok: true }>> {
  const listed = await fetchOpenPrList(token);
  // D1: non-draft and not carrying the `parked` label.
  const candidates = listed.filter((pr) => !pr.draft && !isParked(pr));
  const checked = candidates.slice(0, MAX_PRS_CHECKED);
  const headers = ghHeaders(token);

  const verdicts = await mapWithConcurrency(checked, GH_CONCURRENCY, (pr) => judgePr(headers, pr));

  const prs: PendingPr[] = [];
  const unverified: UnverifiedPr[] = [];
  let conflicted = 0;
  for (const v of verdicts) {
    if (v.kind === 'ready') prs.push(v.pr);
    else if (v.kind === 'unverified') unverified.push(v.pr);
    else if (v.kind === 'conflicted') conflicted += 1;
  }
  // Longest wait first, by the D3 clock (the list came created-ascending).
  prs.sort((a, b) => new Date(a.readySince).getTime() - new Date(b.readySince).getTime());

  return { ok: true, prs, unverified, conflicted, unchecked: candidates.length - checked.length };
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
  inflight = readPendingPrs(token)
    .then(
      (result): PendingPrsResult => result,
      (err): PendingPrsResult => ({
        ok: false,
        reason: err instanceof Error ? err.message : 'GitHub read failed',
      }),
    )
    .then((result) => {
      // Failures are memoised too: a GitHub outage shows as a notice for up
      // to one TTL rather than hammering a failing API on every load.
      memo = { at: now, result };
      inflight = null;
      return result;
    });
  return inflight;
}
