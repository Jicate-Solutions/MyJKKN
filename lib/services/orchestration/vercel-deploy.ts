import 'server-only';

// lib/services/orchestration/vercel-deploy.ts
//
// Deploy-action service for the MyJKKN Orchestration Console (Phase 2 backend).
// `fireProductionDeploy` never fires the Vercel deploy hook blind — it first
// calls `latestProductionBuildState()` and refuses unless the most recent
// production build is confirmed Ready. This replicates the intent of the
// "is main green" guard used by the /myjkkn-chain skill before it deploys.
//
// This is a plain callable library. It does not run on its own — it only
// executes when a caller (an authenticated, super-admin-gated API route)
// invokes `fireProductionDeploy`.
//
// Required env var (server-only — never NEXT_PUBLIC_*):
//   ORCH_VERCEL_DEPLOY_HOOK — the Vercel Deploy Hook URL for the production
//     environment (Project Settings → Git → Deploy Hooks). A bare POST to
//     this URL triggers a rebuild from the latest `main` on GitHub.
//
// Optional env vars (only needed for the build-state guard to read real
// data from the Vercel API — see TODO below):
//   ORCH_VERCEL_TOKEN       — a Vercel API token with read access to the project.
//   ORCH_VERCEL_PROJECT_ID  — the Vercel project ID for MyJKKN.
//   ORCH_VERCEL_TEAM_ID     — the Vercel team ID, if the project sits under a team.
//   ORCH_GITHUB_TOKEN       — read access to Jicate-Solutions/MyJKKN, used only
//     by `productionDeployPreview()` to answer "what would this deploy ship?".

const VERCEL_API = 'https://api.vercel.com';
const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

/** Most commit titles the preview will list; the true total is in `aheadBy`. */
const PREVIEW_COMMIT_LIMIT = 10;

export type BuildState = 'READY' | 'ERROR' | 'BUILDING' | 'QUEUED' | 'CANCELED' | 'UNKNOWN';

export interface LatestProductionBuildStateResult {
  state: BuildState;
  /** Whether ORCH_VERCEL_TOKEN + ORCH_VERCEL_PROJECT_ID are set at all. */
  configured: boolean;
  deploymentId?: string;
  url?: string;
  /**
   * The git sha this production deployment was built from, when Vercel
   * reports one. Optional — absent is normal (a deploy made outside the git
   * integration carries no commit meta) and never treated as an error.
   */
  deployedSha?: string;
  reason?: string;
}

/** One commit that would ship on the next production deploy. */
export interface DeployPreviewCommit {
  sha: string;
  title: string;
}

export interface ProductionDeployPreviewResult {
  /** False whenever the answer could not be determined — see `reason`. */
  known: boolean;
  /** True number of commits ahead of the deployed sha, even if the list is capped. */
  aheadBy: number;
  commits: DeployPreviewCommit[];
  reason?: string;
}

export interface FireProductionDeployResult {
  ok: boolean;
  fired: boolean;
  reason: string;
}

const KNOWN_STATES: readonly BuildState[] = ['READY', 'ERROR', 'BUILDING', 'QUEUED', 'CANCELED'];

/**
 * Reads the readyState of the most recent production deployment from the
 * Vercel API.
 *
 * TODO(orchestration): ORCH_VERCEL_TOKEN / ORCH_VERCEL_PROJECT_ID are not
 * provisioned anywhere in this repo yet — no existing service reads Vercel
 * build state via API. Once an ops owner provisions a read-scoped Vercel
 * token and sets these two (plus ORCH_VERCEL_TEAM_ID if the project is under
 * a team), this function starts returning real state from
 * `GET /v6/deployments?projectId=...&target=production&limit=1`. Until then
 * it deliberately cannot verify anything and returns `state: 'UNKNOWN'` —
 * which `fireProductionDeploy` below treats as "not Ready" and refuses.
 * Fail closed, not fail open: "can't verify" must never be treated the same
 * as "verified green".
 */
export async function latestProductionBuildState(): Promise<LatestProductionBuildStateResult> {
  const token = process.env.ORCH_VERCEL_TOKEN;
  const projectId = process.env.ORCH_VERCEL_PROJECT_ID;
  const teamId = process.env.ORCH_VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return {
      state: 'UNKNOWN',
      configured: false,
      reason:
        'ORCH_VERCEL_TOKEN / ORCH_VERCEL_PROJECT_ID not configured — cannot verify build state, failing closed',
    };
  }

  try {
    const params = new URLSearchParams({ projectId, target: 'production', limit: '1' });
    if (teamId) params.set('teamId', teamId);

    const res = await fetch(`${VERCEL_API}/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Live data by design — a cached "Ready" reading is exactly the failure
      // mode this guard exists to prevent.
      cache: 'no-store',
    });

    if (!res.ok) {
      return { state: 'UNKNOWN', configured: true, reason: `Vercel API returned ${res.status} — failing closed` };
    }

    const json = await res.json().catch(() => null);
    const deployment = json?.deployments?.[0];
    if (!deployment) {
      return { state: 'UNKNOWN', configured: true, reason: 'No production deployments found — failing closed' };
    }

    const raw = String(deployment.readyState ?? '').toUpperCase();
    const state: BuildState = (KNOWN_STATES as string[]).includes(raw) ? (raw as BuildState) : 'UNKNOWN';

    const deployedShaRaw = deployment.meta?.githubCommitSha;
    const deployedSha =
      typeof deployedShaRaw === 'string' && deployedShaRaw.trim() ? deployedShaRaw.trim() : undefined;

    return { state, configured: true, deploymentId: deployment.uid, url: deployment.url, deployedSha };
  } catch (err) {
    return {
      state: 'UNKNOWN',
      configured: true,
      reason: `Vercel API request failed: ${err instanceof Error ? err.message : String(err)} — failing closed`,
    };
  }
}

/**
 * Answers the question the Deploy button never answered: "what would this
 * actually ship?" The deploy hook rebuilds from whatever `main` is at the
 * moment it fires, so the operator is otherwise firing blind — a commit
 * deliberately being held back from production looks identical to an empty
 * deploy.
 *
 * Compares the sha the current production build was made from against `main`
 * and reports how far ahead main is, plus the commit titles.
 *
 * ⚠️ THIS FUNCTION FAILS SOFT — DELIBERATELY, AND UNLIKE EVERYTHING ELSE IN
 * THIS FILE. `latestProductionBuildState` and `fireProductionDeploy` fail
 * CLOSED because they are guards: "cannot verify" must never read as
 * "verified green". This one is NOT a guard. It is informational only — it
 * tells the operator what is about to ship, and nothing calls it to decide
 * whether shipping is allowed. So a missing sha, an absent token, or a
 * GitHub outage returns `{ known: false, reason }` and the deploy proceeds
 * as it always did. Do NOT "fix" this into a fail-closed path for
 * consistency with its neighbours: that would convert a read-only nicety
 * into a brand-new way for deploy to become unavailable, which is strictly
 * worse than the blind-fire status quo this was written to improve.
 */
export async function productionDeployPreview(): Promise<ProductionDeployPreviewResult> {
  const empty = (reason: string): ProductionDeployPreviewResult => ({
    known: false,
    aheadBy: 0,
    commits: [],
    reason,
  });

  const token = process.env.ORCH_GITHUB_TOKEN;
  if (!token) {
    return empty('ORCH_GITHUB_TOKEN is not configured — cannot list what would ship');
  }

  try {
    const build = await latestProductionBuildState();
    if (!build.deployedSha) {
      return empty(
        build.reason ?? 'Vercel did not report a commit for the current production build'
      );
    }

    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/compare/${encodeURIComponent(build.deployedSha)}...main`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        // Same reasoning as the build-state read: a cached comparison would
        // describe a deploy other than the one about to fire.
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return empty(`GitHub compare returned ${res.status}`);
    }

    const json = await res.json().catch(() => null);
    const aheadByRaw = json?.ahead_by;
    if (typeof aheadByRaw !== 'number') {
      return empty('GitHub compare response did not include ahead_by');
    }

    // GitHub returns compare commits oldest-first; keep that order and cap the
    // list, reporting the true total separately in `aheadBy` so a capped list
    // never reads as the whole deploy.
    const rawCommits: unknown[] = Array.isArray(json?.commits) ? json.commits : [];
    const commits: DeployPreviewCommit[] = rawCommits
      .slice(0, PREVIEW_COMMIT_LIMIT)
      .map((entry) => {
        const c = entry as { sha?: unknown; commit?: { message?: unknown } };
        const sha = typeof c.sha === 'string' ? c.sha : '';
        const message = typeof c.commit?.message === 'string' ? c.commit.message : '';
        return { sha, title: message.split('\n')[0].trim() };
      })
      .filter((c) => c.sha !== '');

    return { known: true, aheadBy: aheadByRaw, commits };
  } catch (err) {
    // Swallowed on purpose — see the fail-soft note above.
    return empty(
      `Could not determine what would ship: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Fires the production Deploy Hook — but only after confirming the latest
 * production build is Ready. Refuses (fail closed) if the build is not
 * Ready, or if that cannot be determined at all.
 *
 * Never auto-invoked — a caller (a super-admin-gated API route) must call
 * this explicitly, once, per deploy.
 */
export async function fireProductionDeploy(): Promise<FireProductionDeployResult> {
  const hookUrl = process.env.ORCH_VERCEL_DEPLOY_HOOK;
  if (!hookUrl) {
    return { ok: false, fired: false, reason: 'ORCH_VERCEL_DEPLOY_HOOK is not configured' };
  }

  const build = await latestProductionBuildState();
  if (build.state !== 'READY') {
    return {
      ok: false,
      fired: false,
      reason: build.configured ? 'main build is in error' : (build.reason ?? 'main build is in error'),
    };
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST' });
    if (!res.ok) {
      return { ok: false, fired: false, reason: `Deploy hook returned status ${res.status}` };
    }
    return { ok: true, fired: true, reason: 'Deploy hook fired' };
  } catch (err) {
    return {
      ok: false,
      fired: false,
      reason: `Deploy hook request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
