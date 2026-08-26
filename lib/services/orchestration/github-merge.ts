import 'server-only';

// lib/services/orchestration/github-merge.ts
//
// Merge-action service for the MyJKKN Orchestration Console (Phase 2 backend).
// Wraps the GitHub REST API's merge endpoint with a mandatory pre-merge safety
// check — this file NEVER merges a PR whose mergeability GitHub itself is
// unsure about. Fail closed: if GitHub reports anything other than a clean
// `mergeable === true`, this refuses.
//
// This is a plain callable library. It does not run on its own — it only
// executes when a caller (an authenticated, super-admin-gated API route)
// invokes `mergePullRequest`.
//
// Required env var (server-only — never NEXT_PUBLIC_*):
//   ORCH_GITHUB_TOKEN — a GitHub PAT (fine-grained or classic) with
//     `contents:write` + `pull_requests:write` on Jicate-Solutions/MyJKKN.
//     Used solely to fetch PR state and call the merge endpoint.

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

export type MergeMethod = 'squash' | 'merge' | 'rebase';

export interface MergePullRequestOptions {
  method?: MergeMethod;
}

export interface MergePullRequestResult {
  ok: boolean;
  merged: boolean;
  reason: string;
  sha?: string;
}

interface GitHubPullRequest {
  number: number;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  draft: boolean;
  title: string;
  head: { sha: string };
}

/**
 * One entry from GitHub's check-runs API. Only the three fields the CI guard
 * classifies on are modelled.
 */
interface GitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/**
 * Conclusions that do NOT block a merge:
 *   success   — the gate passed.
 *   skipped   — a path filter skipped the gate. Most gates skip on most PRs.
 *   neutral   — the gate ran and declined to return a verdict. Every PR in
 *               this repo currently carries 'Deep review status' = neutral
 *               (that workflow lacks `issues:write`), so treating neutral as a
 *               failure would refuse 100% of pull requests.
 *   cancelled — .github/workflows/jkkn-conventions.yml and its siblings set
 *               `concurrency.cancel-in-progress: true`, so a superseded run is
 *               routine, not a failure.
 *
 * Anything else that has COMPLETED blocks — 'failure', 'timed_out' and
 * 'action_required', plus conclusions not enumerated here such as
 * 'startup_failure' and 'stale'. Unknown conclusions block BY DESIGN: this
 * guard fails closed, so a conclusion it cannot classify is never treated as
 * green.
 */
const NON_BLOCKING_CONCLUSIONS: ReadonlySet<string> = new Set([
  'success',
  'skipped',
  'neutral',
  'cancelled',
]);

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function fetchPullRequest(
  token: string,
  prNumber: number
): Promise<{ status: number; pr: GitHubPullRequest | null }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
    {
      headers: ghHeaders(token),
      // Always live — a stale mergeable/mergeable_state read is exactly the
      // failure mode this guard exists to prevent.
      cache: 'no-store',
    }
  );
  const json = res.status === 200 ? await res.json().catch(() => null) : null;
  return { status: res.status, pr: json };
}

/**
 * Reads the check runs GitHub has recorded against a commit.
 *
 * Reads the CHECK-RUNS API only. Legacy commit-status contexts (the older
 * `/commits/{sha}/status` surface) are out of scope — every gate in this repo
 * is a GitHub Actions check run, which this endpoint reports.
 *
 * `per_page=100` because the endpoint defaults to 30 and this repo already
 * runs ~26 gates on a pull request; the caller additionally compares
 * `total_count` against what came back and refuses on a short read rather than
 * judging CI green on a partial page.
 *
 * Any failure to read — non-200, unparseable body, thrown request — returns
 * `runs: null`, which the caller treats as "cannot verify" and refuses. Same
 * posture as `latestProductionBuildState` in the sibling vercel-deploy.ts:
 * an API error is not evidence of green.
 */
async function fetchCheckRuns(
  token: string,
  sha: string
): Promise<{ status: number; totalCount: number | null; runs: GitHubCheckRun[] | null }> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}/check-runs?per_page=100`,
      {
        headers: ghHeaders(token),
        // Live by design, exactly as fetchPullRequest above — a cached
        // "all green" reading is the failure mode this guard exists to prevent.
        cache: 'no-store',
      }
    );
    if (res.status !== 200) {
      return { status: res.status, totalCount: null, runs: null };
    }
    const json = await res.json().catch(() => null);
    const runs = Array.isArray(json?.check_runs) ? (json.check_runs as GitHubCheckRun[]) : null;
    const totalCount = typeof json?.total_count === 'number' ? json.total_count : null;
    return { status: res.status, totalCount, runs };
  } catch {
    return { status: 0, totalCount: null, runs: null };
  }
}

/** Renders check names for a refusal reason, capped so the console can show it. */
function describeRuns(parts: string[]): string {
  const shown = parts.slice(0, 5).join('; ');
  return parts.length > 5 ? `${shown}; +${parts.length - 5} more` : shown;
}

/**
 * Classifies a commit's check runs into merge / do-not-merge.
 *
 * Refuses if ANY run is blocking (see NON_BLOCKING_CONCLUSIONS) or still
 * running, and names the offending checks so the console surfaces something
 * actionable rather than a bare "refused".
 *
 * Zero check runs is PENDING, not green: this repo runs ~26 gates on a pull
 * request, so an empty list means CI has not started yet.
 */
function checkRunsVerdict(
  runs: GitHubCheckRun[],
  totalCount: number | null
): { ok: boolean; reason: string } {
  if (runs.length === 0) {
    return { ok: false, reason: 'no check runs reported for the head commit yet — CI has not started' };
  }
  if (totalCount !== null && totalCount > runs.length) {
    return {
      ok: false,
      reason: `only ${runs.length} of ${totalCount} check runs could be read — cannot verify CI`,
    };
  }

  const blocking = runs
    .filter((r) => r.status === 'completed' && !NON_BLOCKING_CONCLUSIONS.has(String(r.conclusion)))
    .map((r) => `'${r.name}' concluded ${r.conclusion}`);
  if (blocking.length > 0) {
    return { ok: false, reason: describeRuns(blocking) };
  }

  const pending = runs
    .filter((r) => r.status !== 'completed')
    .map((r) => `'${r.name}' is ${r.status}`);
  if (pending.length > 0) {
    return { ok: false, reason: describeRuns(pending) };
  }

  return { ok: true, reason: 'all check runs green' };
}

/**
 * Merges a GitHub pull request via the REST API, after refusing unless the
 * PR is unambiguously safe to merge.
 *
 * Fail-closed guard (BEFORE calling the merge endpoint):
 *   - PR must fetch successfully (200).
 *   - PR must not already be merged or closed.
 *   - PR must not be a draft.
 *   - `mergeable` must be exactly `true` (not `false`, not `null` — GitHub
 *     returns `null` while it is still computing mergeability, which this
 *     treats as "unknown" and refuses rather than guesses).
 *   - `mergeable_state` must not be `'dirty'` or `'blocked'`.
 *   - The head commit's check runs must be readable, non-empty, all completed,
 *     and none of them blocking. Without this the guard would land a PR whose
 *     blocking gate is red: with no branch protection on `main`, failing CI
 *     surfaces as `mergeable_state: 'unstable'`, never `'blocked'`.
 *
 * Never auto-invoked — a caller (a super-admin-gated API route) must call
 * this explicitly, once, per merge.
 */
export async function mergePullRequest(
  prNumber: number,
  opts: MergePullRequestOptions = {}
): Promise<MergePullRequestResult> {
  const token = process.env.ORCH_GITHUB_TOKEN;
  if (!token) {
    return { ok: false, merged: false, reason: 'ORCH_GITHUB_TOKEN is not configured' };
  }

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { ok: false, merged: false, reason: 'Invalid PR number' };
  }

  const method: MergeMethod = opts.method ?? 'squash';

  const { status, pr } = await fetchPullRequest(token, prNumber);
  if (status !== 200 || !pr) {
    return { ok: false, merged: false, reason: `Could not fetch PR #${prNumber} (status ${status})` };
  }

  if (pr.merged) {
    return { ok: false, merged: false, reason: 'PR is already merged' };
  }
  if (pr.state !== 'open') {
    return { ok: false, merged: false, reason: `PR is not open (state: ${pr.state})` };
  }
  if (pr.draft) {
    return { ok: false, merged: false, reason: 'PR is a draft' };
  }
  if (pr.mergeable !== true) {
    return {
      ok: false,
      merged: false,
      reason: `PR mergeable is not true (mergeable: ${String(pr.mergeable)}) — refusing (fail closed)`,
    };
  }
  if (pr.mergeable_state === 'dirty' || pr.mergeable_state === 'blocked') {
    return {
      ok: false,
      merged: false,
      reason: `PR mergeable_state is '${pr.mergeable_state}' — refusing (fail closed)`,
    };
  }

  // CI gate. The mergeable_state checks above are NOT a CI check: `main` in
  // this repo has no branch protection, so with no required status checks
  // GitHub never reports mergeable_state 'blocked' for failing CI — it reports
  // 'unstable', and a PR whose blocking gate is red reads as mergeable/clean.
  // So read the head commit's check runs live and classify them explicitly.
  //
  // Deliberately NOT "refuse when mergeable_state === 'unstable'": 'unstable'
  // only says some non-required check is not success, which is true of every
  // PR here (a permanent neutral, routine skips and cancellations). The
  // conclusion read below is the correct discriminator.
  const headSha = pr.head?.sha;
  if (!headSha) {
    return { ok: false, merged: false, reason: 'PR has no head SHA — cannot verify CI (fail closed)' };
  }

  const { status: checksStatus, totalCount, runs } = await fetchCheckRuns(token, headSha);
  if (!runs) {
    return {
      ok: false,
      merged: false,
      reason: `Could not read check runs for ${headSha} (status ${checksStatus}) — refusing (fail closed)`,
    };
  }

  const checks = checkRunsVerdict(runs, totalCount);
  if (!checks.ok) {
    return {
      ok: false,
      merged: false,
      reason: `Refusing to merge: ${checks.reason} (fail closed)`,
    };
  }

  const mergeRes = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/merge`,
    {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({ merge_method: method }),
    }
  );

  const mergeJson = await mergeRes.json().catch(() => null);

  if (!mergeRes.ok) {
    const message =
      (mergeJson && typeof mergeJson === 'object' && 'message' in mergeJson
        ? String((mergeJson as { message?: unknown }).message)
        : null) ?? `GitHub merge request failed (status ${mergeRes.status})`;
    return { ok: false, merged: false, reason: message };
  }

  const merged = Boolean(mergeJson?.merged);
  return {
    ok: merged,
    merged,
    reason: merged ? 'Merged' : (mergeJson?.message ?? 'GitHub did not confirm the merge'),
    sha: mergeJson?.sha,
  };
}
