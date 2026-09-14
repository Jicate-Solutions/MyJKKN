import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * InstaSolver purchase lane (spec I5) — the approval chain must never come back
 * empty, and the seeded tiers must leave no amount uncovered.
 *
 * THE BUG THESE PIN. `procurement_approval_thresholds.min_amount/max_amount` are
 * `numeric(12,2)` and the chain builder matches with
 * `budget >= min_amount AND budget <= max_amount`. The tiers were first seeded on
 * integer boundaries — 0–10000, 10001–50000, 50001–NULL — which reads correctly
 * to a human and leaves a hole a hundred paise wide at each step. ₹10,000.50 and
 * ₹50,000.01 matched NO band. `buildApprovalChain` returned `[]`,
 * `getCurrentApprover([])` returned null because nothing was pending, and
 * `isChainComplete([])` therefore returned TRUE — a purchase that no one had
 * approved read as fully approved. At ₹50,000.01 that is the super_admin tier
 * being cleared by nobody.
 *
 * Two independent locks, one test file:
 *   1. the seeded bands are contiguous to the paise, so the boundary amounts
 *      resolve to exactly one tier each;
 *   2. even if a band ever goes missing, an empty chain is an ERROR from the
 *      builder and NOT-complete from isChainComplete.
 *
 * The Director's numbers are untouched: HOD to ₹10,000, principal to ₹50,000,
 * super_admin above. Only the paise boundary between them moved.
 */

/** The three platform-wide tiers exactly as 20261213100000 seeds them. */
const SEEDED_TIERS = [
  { approval_authority: 'hod', min_amount: 0, max_amount: 10000, escalate_after_days: 7, fallback_role: 'principal', is_active: true },
  { approval_authority: 'principal', min_amount: 10000.01, max_amount: 50000, escalate_after_days: 10, fallback_role: 'super_admin', is_active: true },
  { approval_authority: 'super_admin', min_amount: 50000.01, max_amount: null, escalate_after_days: 14, fallback_role: 'super_admin', is_active: true },
];

/** The boundaries as they were seeded BEFORE the fix — kept to prove the gap was real. */
const INTEGER_BOUNDARY_TIERS = [
  { approval_authority: 'hod', min_amount: 0, max_amount: 10000, escalate_after_days: 7, fallback_role: 'principal', is_active: true },
  { approval_authority: 'principal', min_amount: 10001, max_amount: 50000, escalate_after_days: 10, fallback_role: 'super_admin', is_active: true },
  { approval_authority: 'super_admin', min_amount: 50001, max_amount: null, escalate_after_days: 14, fallback_role: 'super_admin', is_active: true },
];

/**
 * Chainable stub. The service asks for per-institution rows first and falls back
 * to platform-wide when that comes back empty, so the stub answers the first
 * query with [] and the second with `platformRows`.
 */
function makeClient(platformRows: unknown[]) {
  let call = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) {
    builder[m] = vi.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
    call += 1;
    // 1st terminal await = the per-institution query, 2nd = platform-wide.
    return Promise.resolve({ data: call === 1 ? [] : platformRows, error: null }).then(resolve);
  };
  return { from: vi.fn(() => builder) };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => (globalThis as Record<string, unknown>).__acsClient),
}));

type Service = typeof import('@/lib/services/issues/approval-chain-service').ApprovalChainService;

async function loadService(rows: unknown[]): Promise<Service> {
  (globalThis as Record<string, unknown>).__acsClient = makeClient(rows);
  vi.resetModules();
  const mod = await import('@/lib/services/issues/approval-chain-service');
  return mod.ApprovalChainService;
}

const INSTITUTION = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.resetModules();
});

describe('the paise gap between the seeded approval tiers', () => {
  it('covers ₹10,000.50 — the amount that used to match no tier at all', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 10000.5,
      institution_id: INSTITUTION,
    });

    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('principal');
    expect(chain[0].status).toBe('pending');
    // The whole point: this is NOT a decided chain.
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);
  });

  it('covers ₹50,000.01 — the amount that used to clear super_admin with nobody', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 50000.01,
      institution_id: INSTITUTION,
    });

    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('super_admin');
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);
  });

  it('still puts the round boundary amounts in the lower tier', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    const atTenK = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 10000,
      institution_id: INSTITUTION,
    });
    expect(atTenK.map((s) => s.approver_role)).toEqual(['hod']);

    const atFiftyK = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 50000,
      institution_id: INSTITUTION,
    });
    expect(atFiftyK.map((s) => s.approver_role)).toEqual(['principal']);
  });

  it('assigns exactly one tier to every amount across the boundaries', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    const amounts = [0, 0.01, 9999.99, 10000, 10000.01, 10000.5, 10000.99, 10001,
      49999.99, 50000, 50000.01, 50000.99, 50001, 1_000_000];

    for (const amount of amounts) {
      const chain = await ApprovalChainService.buildApprovalChain({
        estimated_budget: amount,
        institution_id: INSTITUTION,
      });
      expect(chain, `₹${amount} must resolve to exactly one tier`).toHaveLength(1);
    }
  });

  it('the old integer boundaries really did leave those two amounts uncovered', async () => {
    // Guards the guard: if the matching logic ever changes so that integer
    // boundaries stop producing a gap, the paise seed above is no longer load-
    // bearing and this file should be revisited rather than silently kept.
    const ApprovalChainService = await loadService(INTEGER_BOUNDARY_TIERS);

    await expect(
      ApprovalChainService.buildApprovalChain({ estimated_budget: 10000.5, institution_id: INSTITUTION })
    ).rejects.toThrow(/No approval tier covers/);
  });
});

describe('an empty chain is never an approved chain', () => {
  it('buildApprovalChain throws rather than returning [] when no band matches', async () => {
    const ApprovalChainService = await loadService([]);

    await expect(
      ApprovalChainService.buildApprovalChain({ estimated_budget: 25000, institution_id: INSTITUTION })
    ).rejects.toThrow(/Refusing to build an empty approval chain/);
  });

  it('isChainComplete([]) is false — nothing decided is not everything decided', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    expect(ApprovalChainService.isChainComplete([])).toBe(false);
    // The null/undefined shapes a stored JSONB column can hand back.
    expect(ApprovalChainService.isChainComplete(null as never)).toBe(false);
    expect(ApprovalChainService.isChainComplete(undefined as never)).toBe(false);
  });

  it('isChainComplete is still true for a chain whose every step is decided', async () => {
    const ApprovalChainService = await loadService(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 5000,
      institution_id: INSTITUTION,
    });
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);

    const decided = ApprovalChainService.advanceChain(chain, 'approver-1', 'approve');
    expect(ApprovalChainService.isChainComplete(decided)).toBe(true);
  });
});
