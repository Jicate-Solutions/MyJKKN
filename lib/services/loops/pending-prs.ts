import 'server-only';

// lib/services/loops/pending-prs.ts
//
// "Builds waiting for the Director's merge" — the GitHub source for the
// Waiting-on-the-Director panel on /admin/loops (Director decision Q8,
// 2026-09-02: a finished build waiting for his merge is a decision like any
// other and must age on that panel under the same 7-day rule).
//
// What counts as "waiting for merge": an OPEN, NON-DRAFT pull request on
// Jicate-Solutions/MyJKKN whose head commit's check runs are all complete and
// none is blocking. "Blocking" uses the SAME vocabulary as the merge guard in
// lib/services/orchestration/github-merge.ts (success / skipped / neutral /
// cancelled are non-blocking; anything else that completed is red) — so a PR
// listed here is exactly one the console's Merge button would accept. A PR
// with CI still running, or with a red gate, is NOT waiting on the Director
// yet; it is waiting on the build.
//
// Token / client shape: deliberately the same as the two existing GitHub
// readers (github-merge.ts and app/api/cron/orchestration-sync/route.ts) —
// plain fetch against api.github.com with a Bearer PAT from ORCH_GITHUB_TOKEN
// (GITHUB_TOKEN as the fallback the sync cron also accepts). This file adds
// no second way to talk to GitHub.
//
// Failure discipline (rule #27 — explicit, never silent): every failure to
// read comes back as `{ ok: false, reason }` so the panel can SAY "could not
// read GitHub" rather than render an empty list that reads as "nothing
// waiting". Nothing here throws to the page.
//
// Rate limits: /admin/loops is force-dynamic, so without a cache every page
// load would spend 1 + N GitHub calls. A module-level memo (per warm server
// instance, PENDING_PRS_TTL_MS) is the simplest in-process cache — no table,
// no cron, no new mechanism. A stale-by-up-to-5-minutes answer is fine for a
// panel measured in days.

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

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
const GH_CONCURRENCY = 24;

export interface PendingPr {
  number: number;
  title: string;
  /** Deep link to the PR on GitHub. */
  url: string;
  /**
   * When the PR was opened (GitHub `created_at`). This is what the panel ages
   * from — see the ready-since note in waiting-on-director.tsx.
   */
  createdAt: string;
}

export type PendingPrsResult =
  | {
      ok: true;
      prs: PendingPr[];
      /** Non-draft open PRs past MAX_PRS_CHECKED whose checks were NOT read. */
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
}

interface GitHubCheckRun {
  status: string;
  conclusion: string | null;
}

// Same set as github-merge.ts NON_BLOCKING_CONCLUSIONS — kept in step by
// hand because that file does not export it and this reader must never gain
// write-capable imports from the merge service.
const NON_BLOCKING_CONCLUSIONS: ReadonlySet<string> = new Set([
  'success',
  'skipped',
  'neutral',
  'cancelled',
]);

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

/**
 * Reads the head commit's check runs and says whether they are all green.
 * Any failure to read → `null` ("cannot verify"), which the caller treats as
 * NOT green: an unreadable CI state is never evidence of a mergeable build.
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

async function readPendingPrs(token: string): Promise<{ prs: PendingPr[]; unchecked: number }> {
  const listed = await fetchOpenPrList(token);
  const nonDraft = listed.filter((pr) => !pr.draft);
  const ready = nonDraft.slice(0, MAX_PRS_CHECKED);
  const headers = ghHeaders(token);

  const out: PendingPr[] = [];
  for (let i = 0; i < ready.length; i += GH_CONCURRENCY) {
    const chunk = ready.slice(i, i + GH_CONCURRENCY);
    const verdicts = await Promise.all(
      chunk.map((pr) => (pr.head?.sha ? checksAreGreen(headers, pr.head.sha) : Promise.resolve(null))),
    );
    chunk.forEach((pr, idx) => {
      if (verdicts[idx] === true) {
        out.push({
          number: pr.number,
          title: pr.title ?? '',
          url: pr.html_url,
          createdAt: pr.created_at,
        });
      }
    });
  }
  return { prs: out, unchecked: nonDraft.length - ready.length };
}

// ── In-process memo ──────────────────────────────────────────────────────────
let memo: { at: number; result: PendingPrsResult } | null = null;
// One read in flight at a time per instance: page loads that overlap the
// ~9 s cold read (measured 2026-09-02, 90 PRs) share it instead of each
// spending their own 1 + N GitHub calls.
let inflight: Promise<PendingPrsResult> | null = null;

/**
 * Open, non-draft PRs whose checks are green — the builds waiting on the
 * Director's merge. Never throws; a missing token or a GitHub failure is an
 * `{ ok: false, reason }` the panel renders as a notice.
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
      ({ prs, unchecked }): PendingPrsResult => ({ ok: true, prs, unchecked }),
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
