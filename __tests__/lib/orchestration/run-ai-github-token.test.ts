/**
 * Tests for `resolveGithubToken`
 * (app/api/cron/orchestration-run-ai/_lib/run-module-check.ts).
 *
 * WHY THIS EXISTS
 *   The orchestration console's "Run AI" button failed on its FIRST EVER real
 *   click in production (orchestration_actions held exactly one row: kind
 *   run_ai, status failed, HTTP 502) with:
 *
 *     "No GitHub token configured (CRON_GITHUB_TOKEN / GITHUB_TOKEN /
 *      GH_TOKEN) — cannot read PR/CI state."
 *
 *   Nothing upstream was broken — super-admin check, audit row, routine
 *   resolution and the authenticated call into the cron route all worked. The
 *   fault was config shape: one feature, the orchestration console, looked for
 *   its GitHub token under DIFFERENT names depending on which of its own
 *   buttons you pressed. Merge reads ORCH_GITHUB_TOKEN; this routine read only
 *   CRON_GITHUB_TOKEN / GITHUB_TOKEN / GH_TOKEN. So a console configured
 *   correctly for Merge still had a dead Run AI, and the error message named
 *   three variables, none of them the one the other half of the feature uses.
 *
 * WHAT THE ORDER HAS TO GET RIGHT
 *   Accepting ORCH_GITHUB_TOKEN must not DEMOTE least privilege. That token
 *   carries contents:write + pull_requests:write; this routine only reads. So
 *   a purpose-made read-only CRON_GITHUB_TOKEN must still win when present,
 *   and ORCH_GITHUB_TOKEN is a floor that prevents "dead on arrival", not the
 *   preferred credential. Both halves of that are asserted here.
 */
import { describe, it, expect } from 'vitest';
import { resolveGithubToken } from '@/app/api/cron/orchestration-run-ai/_lib/run-module-check';

describe('resolveGithubToken', () => {
  it('accepts ORCH_GITHUB_TOKEN — the regression that killed the first real Run AI click', () => {
    // Before the fix this returned undefined and the routine failed honestly,
    // even though the console already had a usable token in hand.
    expect(resolveGithubToken({ ORCH_GITHUB_TOKEN: 'orch' } as NodeJS.ProcessEnv)).toBe('orch');
  });

  it('still PREFERS a least-privilege read-only token over the console write token', () => {
    expect(
      resolveGithubToken({
        CRON_GITHUB_TOKEN: 'readonly',
        ORCH_GITHUB_TOKEN: 'orch',
      } as NodeJS.ProcessEnv)
    ).toBe('readonly');
  });

  it('honours the full precedence order', () => {
    const all = {
      CRON_GITHUB_TOKEN: 'a',
      GITHUB_TOKEN: 'b',
      GH_TOKEN: 'c',
      ORCH_GITHUB_TOKEN: 'd',
    } as NodeJS.ProcessEnv;
    expect(resolveGithubToken(all)).toBe('a');
    expect(resolveGithubToken({ GITHUB_TOKEN: 'b', GH_TOKEN: 'c', ORCH_GITHUB_TOKEN: 'd' } as NodeJS.ProcessEnv)).toBe('b');
    expect(resolveGithubToken({ GH_TOKEN: 'c', ORCH_GITHUB_TOKEN: 'd' } as NodeJS.ProcessEnv)).toBe('c');
  });

  it('returns undefined when no name is set, so the caller can fail honestly', () => {
    // The routine must report a failure, never fabricate a successful check.
    expect(resolveGithubToken({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('ignores an empty-string token rather than treating it as configured', () => {
    expect(resolveGithubToken({ CRON_GITHUB_TOKEN: '', ORCH_GITHUB_TOKEN: 'orch' } as NodeJS.ProcessEnv)).toBe('orch');
  });
});
