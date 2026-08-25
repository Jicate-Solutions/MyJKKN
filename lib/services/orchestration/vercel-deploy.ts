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

const VERCEL_API = 'https://api.vercel.com';

export type BuildState = 'READY' | 'ERROR' | 'BUILDING' | 'QUEUED' | 'CANCELED' | 'UNKNOWN';

export interface LatestProductionBuildStateResult {
  state: BuildState;
  /** Whether ORCH_VERCEL_TOKEN + ORCH_VERCEL_PROJECT_ID are set at all. */
  configured: boolean;
  deploymentId?: string;
  url?: string;
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

    return { state, configured: true, deploymentId: deployment.uid, url: deployment.url };
  } catch (err) {
    return {
      state: 'UNKNOWN',
      configured: true,
      reason: `Vercel API request failed: ${err instanceof Error ? err.message : String(err)} — failing closed`,
    };
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
