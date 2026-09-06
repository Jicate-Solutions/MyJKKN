/**
 * Tests for the CI gate in `mergePullRequest`
 * (lib/services/orchestration/github-merge.ts).
 *
 * WHY THIS EXISTS
 *   The merge guard already refused on a non-200 fetch, an already-merged or
 *   closed PR, a draft, `mergeable !== true`, and `mergeable_state` of 'dirty'
 *   or 'blocked'. None of that reads whether CI passed.
 *
 *   That is a real hole rather than a theoretical one, because `main` in this
 *   repo has NO branch protection. With no required status checks GitHub never
 *   reports `mergeable_state: 'blocked'` for failing CI — it reports
 *   'unstable', and the PR still reads `mergeable: true`. A pull request whose
 *   BLOCKING gate concluded failure therefore walked straight past every check
 *   above and got merged, with the console reporting success.
 *
 * WHAT THE CLASSIFICATION HAS TO GET RIGHT
 *   Refusing too much deadlocks the Merge button permanently, so the allowed
 *   set is asserted here as hard as the refused set:
 *     - 'neutral' is allowed. Every PR in this repo carries 'Deep review
 *       status' = neutral (that workflow lacks issues:write). Blocking on
 *       neutral would refuse 100% of pull requests.
 *     - 'skipped' is allowed. Path filters skip most gates on most PRs.
 *     - 'cancelled' is allowed ONLY when genuinely superseded — i.e. another
 *       run of the same check name on the same head sha concluded success.
 *       jkkn-conventions.yml sets concurrency.cancel-in-progress keyed on PR
 *       NUMBER, so supersession is routine and must not deadlock the button;
 *       but a cancelled run standing alone (a manual cancel, a cancelled re-run
 *       on the head sha, or the 45-minute TypeCheck timeout its own workflow
 *       header documents) verified NOTHING, and is refused.
 *
 * ABSENCE IS REPORTED, NOT REFUSED
 *   A gate that never ran contributes nothing while the PR still reads green.
 *   The names in EXPECTED_CHECK_NAMES are surfaced in `reason` when they report
 *   nothing, on refusal and on success alike — deliberately without blocking,
 *   because a hardcoded required list that drifts from the workflow files would
 *   deadlock the Merge button permanently with no escape hatch.
 *
 * `server-only` is mocked because Next.js aliases that specifier at build time
 * and it is not an installed package — without the mock the module under test
 * cannot be imported at all under vitest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { mergePullRequest } from '@/lib/services/orchestration/github-merge';

const HEAD_SHA = '420d4863195f8f87fe71c836577da305905446c8';

type CheckRun = { name: string; status: string; conclusion: string | null };

/** A PR that clears every pre-existing guard, so only the CI gate can refuse. */
function mergeablePr() {
  return {
    number: 3203,
    state: 'open',
    merged: false,
    mergeable: true,
    // What GitHub actually reports for red CI on an unprotected branch. The
    // guard must refuse on the check CONCLUSIONS, never on this string.
    mergeable_state: 'unstable',
    draft: false,
    title: 'a pull request',
    head: { sha: HEAD_SHA },
  };
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

/**
 * Stubs fetch for the three calls the service can make, in order:
 * the PR read, the check-runs read, then the merge PUT.
 */
function stubFetch(opts: {
  pr?: Record<string, unknown>;
  checksStatus?: number;
  checkRuns?: CheckRun[] | null;
  totalCount?: number;
  mergeStatus?: number;
}) {
  const merges: string[] = [];
  const mergeBodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'PUT') {
      merges.push(String(url));
      try {
        mergeBodies.push(JSON.parse(init.body ?? '{}'));
      } catch {
        mergeBodies.push({});
      }
      const mergeStatus = opts.mergeStatus ?? 200;
      if (mergeStatus !== 200) {
        return jsonResponse(mergeStatus, { message: 'Head branch was modified. Review and try the merge again.' });
      }
      return jsonResponse(200, { merged: true, sha: 'mergedsha', message: 'Pull Request successfully merged' });
    }
    if (String(url).includes('/check-runs')) {
      const status = opts.checksStatus ?? 200;
      if (status !== 200) return jsonResponse(status, { message: 'boom' });
      const runs = opts.checkRuns ?? [];
      return jsonResponse(200, {
        total_count: opts.totalCount ?? runs.length,
        check_runs: runs,
      });
    }
    return jsonResponse(200, opts.pr ?? mergeablePr());
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, merges, mergeBodies };
}

describe('mergePullRequest — CI gate', () => {
  beforeEach(() => {
    process.env.ORCH_GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ORCH_GITHUB_TOKEN;
  });

  it('refuses when a check concluded failure, and names that check', async () => {
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'lib unit tests pass', status: 'completed', conclusion: 'success' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'failure' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.ok).toBe(false);
    // Actionable, not a bare "refused" — the console shows which gate is red.
    expect(result.reason).toContain('JKKN terminology');
    expect(result.reason).toContain('failure');
    // And it refused BEFORE the merge endpoint was called.
    expect(merges).toHaveLength(0);
  });

  it('refuses on timed_out and action_required too', async () => {
    for (const conclusion of ['timed_out', 'action_required']) {
      stubFetch({
        checkRuns: [{ name: `gate-${conclusion}`, status: 'completed', conclusion }],
      });
      const result = await mergePullRequest(3203);
      expect(result.merged).toBe(false);
      expect(result.reason).toContain(`gate-${conclusion}`);
      vi.unstubAllGlobals();
    }
  });

  it('MERGES when the only non-success checks are neutral, skipped and a superseded cancelled', async () => {
    // This is the shape of a real green PR in this repo, read live from
    // GitHub: 'Deep review status' is permanently neutral, path filters skip
    // gates, and cancel-in-progress cancels superseded runs — leaving the
    // cancelled run BESIDE the successful re-run that replaced it.
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'Advisory review status', status: 'completed', conclusion: 'success' },
        { name: 'Deep review status', status: 'completed', conclusion: 'neutral' },
        { name: 'SDK multi-agent review', status: 'completed', conclusion: 'skipped' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'cancelled' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(true);
    expect(result.ok).toBe(true);
    expect(merges).toHaveLength(1);
  });

  it('refuses while a check is still in_progress', async () => {
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'lib unit tests pass', status: 'completed', conclusion: 'success' },
        { name: 'TypeCheck (PR-scoped)', status: 'in_progress', conclusion: null },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('TypeCheck (PR-scoped)');
    expect(result.reason).toContain('in_progress');
    expect(merges).toHaveLength(0);
  });

  it('refuses when the check-runs endpoint errors — cannot verify is not verified green', async () => {
    const { merges } = stubFetch({ checksStatus: 500 });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('check runs');
    expect(result.reason).toContain('500');
    expect(merges).toHaveLength(0);
  });

  it('refuses on zero check runs — this repo runs ~26 gates, so zero means CI has not started', async () => {
    const { merges } = stubFetch({ checkRuns: [] });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('CI has not started');
    expect(merges).toHaveLength(0);
  });

  it('refuses on a short read rather than judging a partial page green', async () => {
    const { merges } = stubFetch({
      checkRuns: [{ name: 'gate', status: 'completed', conclusion: 'success' }],
      totalCount: 26,
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('1 of 26');
    expect(merges).toHaveLength(0);
  });

  it('merges an all-green PR', async () => {
    const { merges, fetchMock } = stubFetch({
      checkRuns: [
        { name: 'lib unit tests pass', status: 'completed', conclusion: 'success' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.sha).toBe('mergedsha');
    expect(merges).toHaveLength(1);
    // The check-runs read is live, same posture as the PR read it sits beside.
    const checksCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/check-runs'));
    expect(checksCall?.[0]).toContain(HEAD_SHA);
    expect((checksCall?.[1] as { cache?: string })?.cache).toBe('no-store');
  });

  it('pins the merge to the exact sha whose checks it verified', async () => {
    // Without the pin the guard has a race it cannot see: checks are read for
    // headSha, then the PUT merges whatever head is one round-trip later. In a
    // repo running concurrent worktrees that window is real, and a commit
    // landing inside it merges UNVERIFIED — the bug class this guard closes.
    const { mergeBodies } = stubFetch({
      checkRuns: [{ name: 'JKKN terminology', status: 'completed', conclusion: 'success' }],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(true);
    expect(mergeBodies).toHaveLength(1);
    expect(mergeBodies[0]).toMatchObject({ sha: HEAD_SHA });
  });

  it('refuses when the branch moved after its checks were verified (409)', async () => {
    const { mergeBodies } = stubFetch({
      checkRuns: [{ name: 'JKKN terminology', status: 'completed', conclusion: 'success' }],
      mergeStatus: 409,
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.ok).toBe(false);
    // The refusal must explain the race, not leak an opaque GitHub string.
    expect(result.reason).toMatch(/moved after its checks were verified/i);
    expect(result.reason).toContain(HEAD_SHA);
    // It still ATTEMPTED the merge with the pin — that is what produced the 409.
    expect(mergeBodies[0]).toMatchObject({ sha: HEAD_SHA });
  });

  it('still refuses on the pre-existing guards before ever reading checks', async () => {
    const { fetchMock } = stubFetch({
      pr: { ...mergeablePr(), draft: true },
      checkRuns: [{ name: 'gate', status: 'completed', conclusion: 'success' }],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toBe('PR is a draft');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/check-runs'))).toBe(false);
  });

  // ─── a cancelled run carries NO verdict ───────────────────────────────────

  it('refuses a cancelled check that has no successful sibling, and names it', async () => {
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
        // Exactly the case typecheck-pr-scoped.yml's own header documents: the
        // 45-minute limit "reports `cancelled`, which is neither pass nor fail
        // and reads as neither". Nothing about this commit's types was checked,
        // yet it used to clear the guard.
        { name: 'TypeCheck (PR-scoped)', status: 'completed', conclusion: 'cancelled' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('TypeCheck (PR-scoped)');
    expect(result.reason).toContain('cancelled');
    expect(merges).toHaveLength(0);
  });

  it('clears a cancelled check whose successful sibling appears BEFORE it', async () => {
    // The verdict must not depend on the order the API returns runs in. The
    // superseded-cancelled test above has the success LAST; this has it first.
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'TypeCheck (PR-scoped)', status: 'completed', conclusion: 'success' },
        { name: 'TypeCheck (PR-scoped)', status: 'completed', conclusion: 'cancelled' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(true);
    expect(result.ok).toBe(true);
    expect(merges).toHaveLength(1);
  });

  it('does not let a NON-success sibling clear a cancelled check', async () => {
    // Two runs share a name and neither is a pass, so the cancelled one is
    // still unverified. Only a success sibling means genuinely superseded.
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
        { name: 'SDK multi-agent review', status: 'completed', conclusion: 'cancelled' },
        { name: 'SDK multi-agent review', status: 'completed', conclusion: 'neutral' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('SDK multi-agent review');
    expect(merges).toHaveLength(0);
  });

  // ─── a gate that never ran is reported, never blocking ────────────────────

  it('reports an expected gate that reported nothing — and still merges', async () => {
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
        { name: 'lib unit tests pass', status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await mergePullRequest(3203);

    // Absence must NOT block. A hardcoded required list drifts from the
    // workflow files the moment a job is renamed, and the console is the only
    // merge path — refusing on absence risks a permanent, unexplainable
    // deadlock of the Merge button.
    expect(result.merged).toBe(true);
    expect(result.ok).toBe(true);
    expect(merges).toHaveLength(1);
    // It still has to be VISIBLE. The merge route records `result` verbatim
    // into the action log, so this is the audit trail for a vanished gate.
    expect(result.reason).toContain('TypeCheck (PR-scoped)');
    expect(result.reason).toContain('reported nothing');
  });

  it('adds no note when every expected gate reported', async () => {
    const { merges } = stubFetch({
      checkRuns: [
        { name: 'TypeCheck (PR-scoped)', status: 'completed', conclusion: 'success' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(true);
    expect(result.reason).toBe('Merged');
    expect(merges).toHaveLength(1);
  });

  it('names the absent gates on a refusal too', async () => {
    const { merges } = stubFetch({
      checkRuns: [{ name: 'lib unit tests pass', status: 'completed', conclusion: 'failure' }],
    });

    const result = await mergePullRequest(3203);

    expect(result.merged).toBe(false);
    // The red gate stays the headline of the refusal...
    expect(result.reason).toContain('lib unit tests pass');
    // ...with the gates that never reported appended behind it.
    expect(result.reason).toContain('TypeCheck (PR-scoped)');
    expect(result.reason).toContain('JKKN terminology');
    expect(merges).toHaveLength(0);
  });

  it('states filter=latest explicitly rather than inheriting the API default', async () => {
    const { fetchMock } = stubFetch({
      checkRuns: [
        { name: 'TypeCheck (PR-scoped)', status: 'completed', conclusion: 'success' },
        { name: 'JKKN terminology', status: 'completed', conclusion: 'success' },
      ],
    });

    await mergePullRequest(3203);

    const checksCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/check-runs'));
    expect(String(checksCall?.[0])).toContain('filter=latest');
  });
});
