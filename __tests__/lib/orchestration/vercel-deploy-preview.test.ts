// __tests__/lib/orchestration/vercel-deploy-preview.test.ts
//
// The deploy preview answers "what would this deploy actually ship?" and is
// INFORMATIONAL, not a guard. Its contract is therefore the opposite of the
// rest of vercel-deploy.ts: every failure path must return
// { known: false, reason } WITHOUT throwing, so a preview outage can never
// become a deploy outage.
//
// The last block is a regression guard in the other direction: the real
// fail-CLOSED gate (fireProductionDeploy refusing when the latest production
// build is not READY) must still refuse. Adding the preview must not have
// loosened it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` is resolved by the Next bundler, not by node — it is not an
// installed package, so importing the service under test needs it stubbed.
// Mocked here rather than aliased in vitest.config.js to keep this test
// self-contained.
vi.mock('server-only', () => ({}));

import {
  productionDeployPreview,
  fireProductionDeploy,
} from '@/lib/services/orchestration/vercel-deploy';

const DEPLOYED_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** One production deployment, shaped as GET /v6/deployments returns it. */
function vercelDeployment(meta?: Record<string, unknown>) {
  return {
    deployments: [{ uid: 'dpl_1', url: 'myjkkn.vercel.app', readyState: 'READY', meta }],
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('ORCH_VERCEL_TOKEN', 'vercel-token');
  vi.stubEnv('ORCH_VERCEL_PROJECT_ID', 'prj_test');
  vi.stubEnv('ORCH_GITHUB_TOKEN', 'gh-token');
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('productionDeployPreview', () => {
  it('reports the commit count and titles that would ship', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('api.vercel.com')) {
        return jsonResponse(vercelDeployment({ githubCommitSha: DEPLOYED_SHA }));
      }
      return jsonResponse({
        ahead_by: 2,
        commits: [
          {
            sha: 'bbbbbbb1111111111111111111111111111111111',
            commit: { message: 'fix(billing): step a learner status back\n\nlonger body text' },
          },
          {
            sha: 'ccccccc2222222222222222222222222222222222',
            commit: { message: 'feat(loops): MetaLoop surfacing' },
          },
        ],
      });
    });

    const result = await productionDeployPreview();

    expect(result.known).toBe(true);
    expect(result.aheadBy).toBe(2);
    expect(result.commits).toHaveLength(2);
    // Only the subject line, never the whole commit body.
    expect(result.commits[0].title).toBe('fix(billing): step a learner status back');
    expect(result.commits[1].title).toBe('feat(loops): MetaLoop surfacing');

    // The compare must run against the sha production was actually built from.
    const compareCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes('api.github.com'));
    expect(String(compareCall?.[0])).toContain(`compare/${DEPLOYED_SHA}...main`);
  });

  it('caps the commit list while still reporting the true total in aheadBy', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      sha: `sha${String(i).padStart(37, '0')}`,
      commit: { message: `commit ${i}` },
    }));

    fetchSpy.mockImplementation(async (url: string) =>
      String(url).includes('api.vercel.com')
        ? jsonResponse(vercelDeployment({ githubCommitSha: DEPLOYED_SHA }))
        : jsonResponse({ ahead_by: 25, commits: many })
    );

    const result = await productionDeployPreview();

    expect(result.known).toBe(true);
    expect(result.aheadBy).toBe(25);
    expect(result.commits.length).toBeLessThanOrEqual(10);
  });

  it('returns known:false with a reason when Vercel reports no commit sha', async () => {
    // meta present but carrying no githubCommitSha — e.g. a deploy made
    // outside the git integration.
    fetchSpy.mockResolvedValue(jsonResponse(vercelDeployment({})));

    const result = await productionDeployPreview();

    expect(result.known).toBe(false);
    expect(result.aheadBy).toBe(0);
    expect(result.commits).toEqual([]);
    expect(result.reason).toBeTruthy();
    // No compare attempted when there is no sha to compare from.
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('api.github.com'))).toBe(false);
  });

  it('returns known:false — and does NOT throw — when the compare call errors', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('api.vercel.com')) {
        return jsonResponse(vercelDeployment({ githubCommitSha: DEPLOYED_SHA }));
      }
      throw new Error('network unreachable');
    });

    // The assertion that matters: a preview failure is survivable. If this
    // ever throws, a GitHub outage takes the Deploy dialog down with it.
    await expect(productionDeployPreview()).resolves.toMatchObject({
      known: false,
      aheadBy: 0,
      commits: [],
    });

    const result = await productionDeployPreview();
    expect(result.reason).toContain('network unreachable');
  });

  it('returns known:false on a non-OK compare response', async () => {
    fetchSpy.mockImplementation(async (url: string) =>
      String(url).includes('api.vercel.com')
        ? jsonResponse(vercelDeployment({ githubCommitSha: DEPLOYED_SHA }))
        : jsonResponse({ message: 'Not Found' }, 404)
    );

    const result = await productionDeployPreview();

    expect(result.known).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('returns known:false without calling anything when ORCH_GITHUB_TOKEN is absent', async () => {
    vi.stubEnv('ORCH_GITHUB_TOKEN', '');

    const result = await productionDeployPreview();

    expect(result.known).toBe(false);
    expect(result.reason).toContain('ORCH_GITHUB_TOKEN');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fireProductionDeploy still fails closed (regression guard)', () => {
  it('refuses to fire when the latest production build is not READY', async () => {
    vi.stubEnv('ORCH_VERCEL_DEPLOY_HOOK', 'https://api.vercel.com/v1/integrations/deploy/test');

    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('/v6/deployments')) {
        return jsonResponse({
          deployments: [
            {
              uid: 'dpl_bad',
              url: 'x',
              readyState: 'ERROR',
              meta: { githubCommitSha: DEPLOYED_SHA },
            },
          ],
        });
      }
      throw new Error('the deploy hook must not be called');
    });

    const result = await fireProductionDeploy();

    expect(result.ok).toBe(false);
    expect(result.fired).toBe(false);
    // The hook URL must never have been POSTed.
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('integrations/deploy'))).toBe(
      false
    );
  });

  it('refuses to fire when build state cannot be verified at all', async () => {
    vi.stubEnv('ORCH_VERCEL_DEPLOY_HOOK', 'https://api.vercel.com/v1/integrations/deploy/test');
    vi.stubEnv('ORCH_VERCEL_TOKEN', '');
    vi.stubEnv('ORCH_VERCEL_PROJECT_ID', '');

    const result = await fireProductionDeploy();

    expect(result.ok).toBe(false);
    expect(result.fired).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
