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
}

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
