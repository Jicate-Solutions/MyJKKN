/**
 * Tests for the ship-policy layer of POST /api/admin/orchestration/actions/merge
 * (app/api/admin/orchestration/actions/merge/route.ts).
 *
 * WHY THIS EXISTS
 *   The route sits BEFORE the merge guard and decides, per risk tier, what a
 *   request must carry: HELD needs `tierAck: 'HELD'`, `unattended: true` is
 *   accepted for LOW only. Getting either wrong in the permissive direction
 *   would let a fee/marks/migration PR land with no human acknowledging it —
 *   so the 422 paths are asserted as hard as the pass-through, and the guard
 *   (`mergePullRequest`) is asserted NOT to have been called on a refusal.
 *
 *   Supabase, the GitHub reads and the audit writer are mocked; the guard
 *   itself is mocked because its own behaviour is covered by
 *   github-merge-ci-guard.test.ts and this file must not re-test it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  profile: { role: 'super_admin', is_super_admin: true } as { role: string; is_super_admin: boolean } | null,
  storedPr: null as { risk_tier: string; risk_reasons: string[] } | null,
  mergePullRequest: vi.fn(),
  classifyPullRequestRisk: vi.fn(),
  recordAction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: table === 'profiles' ? mocks.profile : null }),
        maybeSingle: async () => ({ data: table === 'orchestration_prs' ? mocks.storedPr : null }),
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/services/orchestration/github-merge', () => ({
  mergePullRequest: mocks.mergePullRequest,
}));

vi.mock('@/lib/services/orchestration/pr-risk', () => ({
  classifyPullRequestRisk: mocks.classifyPullRequestRisk,
}));

vi.mock('@/lib/services/orchestration/audit', () => ({
  recordAction: mocks.recordAction,
}));

import { POST } from '@/app/api/admin/orchestration/actions/merge/route';

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/admin/orchestration/actions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

function liveTier(tier: 'HELD' | 'LOW' | 'NORMAL', reasons: string[] = [`${tier} because`]) {
  mocks.classifyPullRequestRisk.mockResolvedValue({ tier, reasons, changedFilesCount: 1, filesTruncated: false });
}

beforeEach(() => {
  process.env.ORCH_GITHUB_TOKEN = 'test-token';
  mocks.profile = { role: 'super_admin', is_super_admin: true };
  mocks.storedPr = null;
  mocks.mergePullRequest.mockReset();
  mocks.mergePullRequest.mockResolvedValue({ ok: true, merged: true, reason: 'Merged', sha: 'abc' });
  mocks.classifyPullRequestRisk.mockReset();
  mocks.recordAction.mockClear();
});

afterEach(() => {
  delete process.env.ORCH_GITHUB_TOKEN;
});

describe('merge route — unattended', () => {
  it('rejects unattended on a NORMAL PR with 422 and never reaches the guard', async () => {
    liveTier('NORMAL');
    const res = await post({ prNumber: 42, unattended: true });
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.reason).toContain('unattended merge is only permitted for LOW-tier PRs');
    expect(json.tier).toBe('NORMAL');
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
    // Refusals are audited too, with the mode.
    expect(mocks.recordAction).toHaveBeenCalledWith(
      'merge',
      'PR #42',
      'user-1',
      'refused',
      expect.objectContaining({ mode: 'unattended', tier: 'NORMAL' })
    );
  });

  it('rejects unattended on a HELD PR even with tierAck HELD', async () => {
    liveTier('HELD', ["'fees' in lib/fees.ts"]);
    const res = await post({ prNumber: 42, unattended: true, tierAck: 'HELD', confirm: true });
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toContain('only permitted for LOW-tier');
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('rejects unattended when the tier cannot be read — fail closed', async () => {
    mocks.classifyPullRequestRisk.mockResolvedValue(null);
    mocks.storedPr = null;
    const res = await post({ prNumber: 42, unattended: true });
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toContain('could not be read');
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('accepts unattended on a LOW PR without confirm, and calls the guard as-is', async () => {
    liveTier('LOW');
    const res = await post({ prNumber: 42, unattended: true });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.merged).toBe(true);
    expect(json.mode).toBe('unattended');
    expect(mocks.mergePullRequest).toHaveBeenCalledWith(42, { method: undefined });
  });
});

describe('merge route — HELD acknowledgement', () => {
  it('rejects a HELD PR with confirm only, naming the reasons', async () => {
    liveTier('HELD', ['migration: supabase/migrations/20261105000000_x.sql']);
    const res = await post({ prNumber: 42, confirm: true });
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.reason).toContain("needs tierAck: 'HELD'");
    expect(json.riskReasons).toEqual(['migration: supabase/migrations/20261105000000_x.sql']);
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('rejects a HELD PR whose tierAck says NORMAL (stale badge on the client)', async () => {
    liveTier('HELD');
    const res = await post({ prNumber: 42, confirm: true, tierAck: 'NORMAL' });
    expect(res.status).toBe(422);
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('passes a HELD PR through to the guard with confirm + tierAck HELD', async () => {
    liveTier('HELD');
    const res = await post({ prNumber: 42, confirm: true, tierAck: 'HELD' });
    expect(res.status).toBe(200);
    expect(mocks.mergePullRequest).toHaveBeenCalledTimes(1);
    expect(mocks.recordAction).toHaveBeenCalledWith(
      'merge',
      'PR #42',
      'user-1',
      'merged',
      expect.objectContaining({ tier: 'HELD', mode: 'confirmed', tierSource: 'live' })
    );
  });
});

describe('merge route — NORMAL and fallbacks', () => {
  it('NORMAL with confirm is the unchanged behaviour', async () => {
    liveTier('NORMAL');
    const res = await post({ prNumber: 42, confirm: true });
    expect(res.status).toBe(200);
    expect(mocks.mergePullRequest).toHaveBeenCalledWith(42, { method: undefined });
  });

  it('still requires confirm when unattended is absent', async () => {
    liveTier('LOW');
    const res = await post({ prNumber: 42 });
    expect(res.status).toBe(400);
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('falls back to the stored tier when the live read fails, and a stored HELD still needs the ack', async () => {
    mocks.classifyPullRequestRisk.mockResolvedValue(null);
    mocks.storedPr = { risk_tier: 'HELD', risk_reasons: ["'marks' in lib/marks.ts"] };
    const res = await post({ prNumber: 42, confirm: true });
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.tierSource).toBe('stored');
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('the guard verdict is still final — a guard refusal is a 422 with the tier attached', async () => {
    liveTier('NORMAL');
    mocks.mergePullRequest.mockResolvedValue({ ok: false, merged: false, reason: "Refusing to merge: 'JKKN terminology' concluded failure (fail closed)" });
    const res = await post({ prNumber: 42, confirm: true });
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.reason).toContain('JKKN terminology');
    expect(json.tier).toBe('NORMAL');
  });

  it('rejects an invalid tierAck value with 400', async () => {
    liveTier('NORMAL');
    const res = await post({ prNumber: 42, confirm: true, tierAck: 'YOLO' });
    expect(res.status).toBe(400);
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
  });

  it('non-super-admins are still forbidden before any tier work', async () => {
    mocks.profile = { role: 'admin', is_super_admin: false };
    const res = await post({ prNumber: 42, confirm: true });
    expect(res.status).toBe(403);
    expect(mocks.classifyPullRequestRisk).not.toHaveBeenCalled();
  });
});
