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
 * Chainable stub standing in for a Supabase client. The service now issues BOTH
 * queries every time and merges them per authority, so the stub routes by which
 * filter was applied: `.eq('institution_id', …)` gets the institution rows and
 * `.is('institution_id', null)` gets the platform rows.
 */
function makeClient(platformRows: unknown[], institutionRows: unknown[] = []) {
  const from = vi.fn(() => {
    let wantsPlatform = false;
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn((col: string) => {
      if (col === 'institution_id') wantsPlatform = true;
      return builder;
    });
    (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: wantsPlatform ? platformRows : institutionRows,
        error: null,
      }).then(resolve);
    return builder;
  });
  return { from };
}

// The service must NOT build a client at import time any more, so there is no
// module mock here at all — an import-time browser client is exactly the bug
// this shape prevents. Passing the client in is the supported path.
import { ApprovalChainService } from '@/lib/services/issues/approval-chain-service';

const INSTITUTION = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the paise gap between the seeded approval tiers', () => {
  it('covers ₹10,000.50 — the amount that used to match no tier at all', async () => {
    const db = makeClient(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 10000.5,
      institution_id: INSTITUTION,
    }, db);

    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('principal');
    expect(chain[0].status).toBe('pending');
    // The whole point: this is NOT a decided chain.
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);
  });

  it('covers ₹50,000.01 — the amount that used to clear super_admin with nobody', async () => {
    const db = makeClient(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 50000.01,
      institution_id: INSTITUTION,
    }, db);

    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('super_admin');
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);
  });

  it('still puts the round boundary amounts in the lower tier', async () => {
    const db = makeClient(SEEDED_TIERS);

    const atTenK = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 10000,
      institution_id: INSTITUTION,
    }, db);
    expect(atTenK.map((s) => s.approver_role)).toEqual(['hod']);

    const atFiftyK = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 50000,
      institution_id: INSTITUTION,
    }, db);
    expect(atFiftyK.map((s) => s.approver_role)).toEqual(['principal']);
  });

  it('assigns exactly one tier to every amount across the boundaries', async () => {
    const db = makeClient(SEEDED_TIERS);

    const amounts = [0, 0.01, 9999.99, 10000, 10000.01, 10000.5, 10000.99, 10001,
      49999.99, 50000, 50000.01, 50000.99, 50001, 1_000_000];

    for (const amount of amounts) {
      const chain = await ApprovalChainService.buildApprovalChain({
        estimated_budget: amount,
        institution_id: INSTITUTION,
      }, db);
      expect(chain, `₹${amount} must resolve to exactly one tier`).toHaveLength(1);
    }
  });

  it('the old integer boundaries really did leave those two amounts uncovered', async () => {
    // Guards the guard: if the matching logic ever changes so that integer
    // boundaries stop producing a gap, the paise seed above is no longer load-
    // bearing and this file should be revisited rather than silently kept.
    const db = makeClient(INTEGER_BOUNDARY_TIERS);

    await expect(
      ApprovalChainService.buildApprovalChain({ estimated_budget: 10000.5, institution_id: INSTITUTION }, db)
    ).rejects.toThrow(/No approval tier covers/);
  });
});

describe('an empty chain is never an approved chain', () => {
  it('buildApprovalChain throws rather than returning [] when no band matches', async () => {
    const db = makeClient([]);

    await expect(
      ApprovalChainService.buildApprovalChain({ estimated_budget: 25000, institution_id: INSTITUTION }, db)
    ).rejects.toThrow(/Refusing to build an empty approval chain/);
  });

  it('isChainComplete([]) is false — nothing decided is not everything decided', async () => {
    const db = makeClient(SEEDED_TIERS);

    expect(ApprovalChainService.isChainComplete([])).toBe(false);
    // The null/undefined shapes a stored JSONB column can hand back.
    expect(ApprovalChainService.isChainComplete(null as never)).toBe(false);
    expect(ApprovalChainService.isChainComplete(undefined as never)).toBe(false);
  });

  it('isChainComplete is still true for a chain whose every step is decided', async () => {
    const db = makeClient(SEEDED_TIERS);

    const chain = await ApprovalChainService.buildApprovalChain({
      estimated_budget: 5000,
      institution_id: INSTITUTION,
    }, db);
    expect(ApprovalChainService.isChainComplete(chain)).toBe(false);

    const decided = ApprovalChainService.advanceChain(chain, 'approver-1', 'approve');
    expect(ApprovalChainService.isChainComplete(decided)).toBe(true);
  });
});

describe('decided is not approved', () => {
  it('isChainApproved is true for an approved chain and false for a rejected one', async () => {
    const db = makeClient(SEEDED_TIERS);
    const chain = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 5000, institution_id: INSTITUTION },
      db
    );

    const approved = ApprovalChainService.advanceChain(chain, 'approver-1', 'approve');
    expect(ApprovalChainService.isChainComplete(approved)).toBe(true);
    expect(ApprovalChainService.isChainApproved(approved)).toBe(true);

    const rejected = ApprovalChainService.advanceChain(chain, 'approver-1', 'reject');
    // Decided — but emphatically not a green light. This is the trap.
    expect(ApprovalChainService.isChainComplete(rejected)).toBe(true);
    expect(ApprovalChainService.isChainApproved(rejected)).toBe(false);
  });

  it('isChainApproved is false for empty, pending, and all-skipped chains', () => {
    expect(ApprovalChainService.isChainApproved([])).toBe(false);
    expect(ApprovalChainService.isChainApproved(null as never)).toBe(false);

    const pending = [
      { step_order: 1, approver_role: 'hod', approver_user_id: null, status: 'pending' },
    ] as never;
    expect(ApprovalChainService.isChainApproved(pending)).toBe(false);

    const allSkipped = [
      { step_order: 1, approver_role: 'hod', approver_user_id: null, status: 'skipped' },
    ] as never;
    expect(ApprovalChainService.isChainApproved(allSkipped)).toBe(false);
  });

  it('a multi-step chain is approved only once every step is', async () => {
    const db = makeClient([
      { approval_authority: 'hod', min_amount: 0, max_amount: null, escalate_after_days: 7, fallback_role: 'principal', is_active: true },
      { approval_authority: 'principal', min_amount: 0, max_amount: null, escalate_after_days: 10, fallback_role: 'super_admin', is_active: true },
    ]);
    const chain = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 1000, institution_id: INSTITUTION },
      db
    );
    expect(chain).toHaveLength(2);

    const one = ApprovalChainService.advanceChain(chain, 'a1', 'approve');
    expect(ApprovalChainService.isChainApproved(one)).toBe(false);

    const two = ApprovalChainService.advanceChain(one, 'a2', 'approve');
    expect(ApprovalChainService.isChainApproved(two)).toBe(true);
  });
});

describe('the budget is validated before it is matched', () => {
  it('rejects null, undefined, negative and non-finite amounts by name', async () => {
    const db = makeClient(SEEDED_TIERS);
    const bad: Array<[unknown, RegExp]> = [
      [null, /required and was null/],
      [undefined, /required and was undefined/],
      [-1, /must not be negative, got -1/],
      [Number.NaN, /must be a finite number/],
      [Number.POSITIVE_INFINITY, /must be a finite number/],
      ['not a number', /must be a finite number/],
    ];
    for (const [value, pattern] of bad) {
      await expect(
        ApprovalChainService.buildApprovalChain(
          { estimated_budget: value as number, institution_id: INSTITUTION },
          db
        ),
        `${String(value)} must be rejected`
      ).rejects.toThrow(pattern);
    }
  });

  it('rounds to numeric(12,2) before matching, so sub-paise amounts still land in a band', async () => {
    const db = makeClient(SEEDED_TIERS);

    // 50000.005 rounds to 50000.01 -> super_admin. Unrounded it would sit
    // between the principal ceiling (50000) and the super_admin floor
    // (50000.01) and match nothing.
    const rounded = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 50000.005, institution_id: INSTITUTION },
      db
    );
    expect(rounded.map((s) => s.approver_role)).toEqual(['super_admin']);

    // Three items at ₹16,666.67 — a real quote total, and 50000.01 exactly.
    const three = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 16666.67 * 3, institution_id: INSTITUTION },
      db
    );
    expect(three.map((s) => s.approver_role)).toEqual(['super_admin']);
  });

  it('₹0 is a real amount and routes to the HOD', async () => {
    const db = makeClient(SEEDED_TIERS);
    const chain = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 0, institution_id: INSTITUTION },
      db
    );
    expect(chain.map((s) => s.approver_role)).toEqual(['hod']);
  });
});

describe('a per-institution override replaces one band, not all three', () => {
  it('keeps the platform bands the institution did not override', async () => {
    // The college raised its HOD ceiling to ₹25,000 and said nothing about the
    // other two tiers.
    const db = makeClient(SEEDED_TIERS, [
      { approval_authority: 'hod', min_amount: 0, max_amount: 25000, escalate_after_days: 7, fallback_role: 'principal', is_active: true },
    ]);

    // The override applies. Note the chain STACKS here rather than replacing:
    // the college widened its HOD band to ₹25,000 without moving the platform
    // principal band, so at ₹20,000 both cover the amount and both are steps,
    // HOD first. That is the documented "every band covering the budget becomes
    // a step" rule, and it is the safe direction — widening one band cannot
    // remove an approver, it can only add one. A college that wants a single
    // HOD step up to ₹25,000 must also override the principal band's floor.
    const overridden = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 20000, institution_id: INSTITUTION },
      db
    );
    expect(overridden.map((s) => s.approver_role)).toEqual(['hod', 'principal']);

    // ...and the platform super_admin band SURVIVES. Before the per-authority
    // merge, this returned a one-tier hod chain: a ₹5,00,000 purchase approved
    // by an HOD alone.
    const big = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 500000, institution_id: INSTITUTION },
      db
    );
    expect(big.map((s) => s.approver_role)).toEqual(['super_admin']);

    // And the untouched principal band still covers its range.
    const mid = await ApprovalChainService.buildApprovalChain(
      { estimated_budget: 40000, institution_id: INSTITUTION },
      db
    );
    expect(mid.map((s) => s.approver_role)).toEqual(['principal']);
  });
});

describe('the server must supply its own client', () => {
  it('throws a named error rather than silently reading zero rows', async () => {
    // vitest runs with no `window`, which is the server case.
    expect(typeof window).toBe('undefined');
    await expect(
      ApprovalChainService.buildApprovalChain({ estimated_budget: 5000, institution_id: INSTITUTION })
    ).rejects.toThrow(/no Supabase client supplied/);
  });
});
