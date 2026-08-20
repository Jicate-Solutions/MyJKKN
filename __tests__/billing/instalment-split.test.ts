import { describe, it, expect } from 'vitest';
import {
  computeInstalmentAmounts,
  validatePlanLines,
  verifyInstalmentSplitRows,
  fetchInstalmentSplit,
  expandBillsWithInstalmentPlans,
  type InstalmentSplitRow,
  type SupabaseRpcClient,
} from '@/lib/services/billing/instalments/instalment-plan-service';

// NOTE ON WHAT THESE TESTS PROVE — AND WHAT THEY DO NOT.
// The runtime split arithmetic for BOTH bill-generation paths lives in the SQL
// engine billing_instalment_split_for_learner (migration 20260825013000, a
// Director-gated file this suite cannot execute). What runs here is production
// TypeScript: the reference mirror used for authoring previews, the authoring
// validation, and — most importantly — the CONSUMING behaviour of the TS
// generation path: exact-sum verification of RPC output, and single-bill
// passthrough on no-plan / error / malformed output. A green run here does NOT
// prove the SQL engine; the Director's review of the migration does that.

// ─── Split math (reference mirror) ───────────────────────────────────────────

describe('computeInstalmentAmounts', () => {
  it('splits equal percent shares exactly, last absorbs the rounding paisa', () => {
    // 100000 at 33.33 / 33.33 / 33.34: first two round to 33330, last absorbs.
    const amounts = computeInstalmentAmounts(100000, [
      { share_percent: 33.33 },
      { share_percent: 33.33 },
      { share_percent: 33.34 },
    ]);
    expect(amounts).toEqual([33330, 33330, 33340]);
    expect(amounts!.reduce((s, a) => s + a, 0)).toBe(100000);
  });

  it('last instalment absorbs rounding on an amount that does not divide evenly', () => {
    // 100 across 3 x 33.3333%: 33.33 + 33.33, last takes 33.34.
    const amounts = computeInstalmentAmounts(100, [
      { share_percent: 33.3333 },
      { share_percent: 33.3333 },
      { share_percent: 33.3334 },
    ]);
    expect(amounts).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(amounts!.reduce((s, a) => s + a, 0) * 100)).toBe(10000);
  });

  it('sums exactly to the total for fractional-paise-prone shares', () => {
    // 99999.99 at 60/40 — floating point would drift without paise arithmetic.
    const amounts = computeInstalmentAmounts(99999.99, [
      { share_percent: 60 },
      { share_percent: 40 },
    ]);
    expect(Math.round(amounts!.reduce((s, a) => s + a, 0) * 100)).toBe(
      Math.round(99999.99 * 100)
    );
    expect(amounts![0]).toBe(59999.99);
    expect(amounts![1]).toBe(40000);
  });

  it('supports fixed amounts with the remainder on the last line', () => {
    const amounts = computeInstalmentAmounts(75000, [
      { fixed_amount: 25000 },
      { fixed_amount: 25000 },
      { share_percent: 100 }, // last line: sizing ignored, absorbs remainder
    ]);
    expect(amounts).toEqual([25000, 25000, 25000]);
  });

  it('supports mixed fixed + percent lines', () => {
    const amounts = computeInstalmentAmounts(100000, [
      { fixed_amount: 40000 },
      { share_percent: 30 },
      { share_percent: 30 },
    ]);
    expect(amounts).toEqual([40000, 30000, 30000]);
  });

  it('refuses to split when the plan does not fit the amount (non-positive last)', () => {
    // Fixed lines exceed the total → last instalment would be negative.
    expect(
      computeInstalmentAmounts(50000, [
        { fixed_amount: 30000 },
        { fixed_amount: 30000 },
        { share_percent: 10 },
      ])
    ).toBeNull();
  });

  it('refuses a 1-line plan and non-positive totals', () => {
    expect(computeInstalmentAmounts(100000, [{ share_percent: 100 }])).toBeNull();
    expect(computeInstalmentAmounts(0, [{ share_percent: 50 }, { share_percent: 50 }])).toBeNull();
    expect(computeInstalmentAmounts(-5, [{ share_percent: 50 }, { share_percent: 50 }])).toBeNull();
  });
});

// ─── Authoring validation ────────────────────────────────────────────────────

describe('validatePlanLines', () => {
  const goodLine = (n: number, pct: number) => ({
    sequence_no: n,
    share_percent: pct,
    due_offset_days: 30 * n,
  });

  it('accepts a well-formed percent plan summing to 100', () => {
    expect(validatePlanLines([goodLine(1, 40), goodLine(2, 30), goodLine(3, 30)])).toEqual([]);
  });

  it('rejects percent-only plans that do not sum to 100 (no silent 30/30/40)', () => {
    const errors = validatePlanLines([goodLine(1, 30), goodLine(2, 30), goodLine(3, 30)]);
    expect(errors.some((e) => e.includes('sum to exactly 100'))).toBe(true);
  });

  it('rejects non-contiguous sequence numbers', () => {
    const errors = validatePlanLines([goodLine(1, 50), goodLine(3, 50)]);
    expect(errors.some((e) => e.includes('contiguous'))).toBe(true);
  });

  it('rejects a line with both (or neither) sizing fields', () => {
    const both = validatePlanLines([
      { sequence_no: 1, share_percent: 50, fixed_amount: 100, due_offset_days: 0 },
      goodLine(2, 50),
    ]);
    expect(both.some((e) => e.includes('exactly one of share percent or fixed amount'))).toBe(true);

    const neither = validatePlanLines([
      { sequence_no: 1, due_offset_days: 0 },
      goodLine(2, 50),
    ]);
    expect(neither.some((e) => e.includes('exactly one of share percent or fixed amount'))).toBe(true);
  });

  it('rejects a line with both (or neither) due fields', () => {
    const errors = validatePlanLines([
      { sequence_no: 1, share_percent: 50, due_date: '2027-01-10', due_offset_days: 5 },
      { sequence_no: 2, share_percent: 50 },
    ]);
    expect(errors.filter((e) => e.includes('due date or offset days')).length).toBe(2);
  });

  it('rejects a plan with fewer than 2 instalments', () => {
    expect(validatePlanLines([goodLine(1, 100)])).toEqual([
      'An instalment plan needs at least 2 instalments.',
    ]);
  });
});

// ─── RPC output verification (what guards the generation path) ───────────────

const splitRows = (amounts: number[], dues?: string[]): InstalmentSplitRow[] =>
  amounts.map((amount, i) => ({
    instalment_no: i + 1,
    instalment_count: amounts.length,
    instalment_amount: amount,
    instalment_due_date: dues?.[i] ?? `2026-0${i + 1}-15`,
  }));

describe('verifyInstalmentSplitRows', () => {
  it('accepts rows that sum exactly to the total', () => {
    expect(verifyInstalmentSplitRows(100000, splitRows([33330, 33330, 33340]))).toBe(true);
  });

  it('rejects rows whose sum drifts from the total by even one paisa', () => {
    expect(verifyInstalmentSplitRows(100000, splitRows([33330, 33330, 33339.99]))).toBe(false);
  });

  it('rejects fewer than 2 rows, gaps in sequence, and wrong counts', () => {
    expect(verifyInstalmentSplitRows(100, splitRows([100]))).toBe(false);
    const gap = splitRows([50, 50]);
    gap[1].instalment_no = 3;
    expect(verifyInstalmentSplitRows(100, gap)).toBe(false);
    const badCount = splitRows([50, 50]);
    badCount[0].instalment_count = 5;
    expect(verifyInstalmentSplitRows(100, badCount)).toBe(false);
  });

  it('rejects non-positive amounts and missing due dates', () => {
    expect(verifyInstalmentSplitRows(100, splitRows([100, 0]))).toBe(false);
    const noDue = splitRows([50, 50]);
    noDue[1].instalment_due_date = '';
    expect(verifyInstalmentSplitRows(100, noDue)).toBe(false);
  });
});

// ─── Passthrough + expansion behaviour of the generation path ────────────────

const rpcClient = (result: { data: unknown; error: unknown }): SupabaseRpcClient => ({
  rpc: async () => result,
});

const throwingClient: SupabaseRpcClient = {
  rpc: async () => {
    throw new Error('function billing_get_instalment_split does not exist');
  },
};

const yearlyBill = {
  student_id: 'learner-1',
  institution_id: 'inst-1',
  item_category_id: 'cat-tuition-y1',
  bill_description: '1 Year Tuition Fee',
  due_date: '2026-09-12',
  quantity: 1,
  unit_amount: 100000,
  total_amount: 100000,
  tax_amount: 0,
  final_amount: 100000,
  balance_amount: 100000,
  status: 'unpaid',
  remarks: 'Onboarding bill — auto-generated from learner fee_items',
  created_by: 'user-1',
};

describe('fetchInstalmentSplit', () => {
  it('returns null when the RPC errors (migration not applied = dormant)', async () => {
    const result = await fetchInstalmentSplit(
      rpcClient({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
      'learner-1',
      'cat-1',
      100000
    );
    expect(result).toBeNull();
  });

  it('returns null when the RPC call throws entirely', async () => {
    expect(await fetchInstalmentSplit(throwingClient, 'learner-1', 'cat-1', 100000)).toBeNull();
  });

  it('returns null on empty data (no plan configured)', async () => {
    expect(
      await fetchInstalmentSplit(rpcClient({ data: [], error: null }), 'learner-1', 'cat-1', 100000)
    ).toBeNull();
  });

  it('returns null when rows fail exact-sum verification', async () => {
    const bad = splitRows([60000, 40000.01]);
    expect(
      await fetchInstalmentSplit(rpcClient({ data: bad, error: null }), 'learner-1', 'cat-1', 100000)
    ).toBeNull();
  });

  it('returns verified rows when the split is well-formed', async () => {
    const good = splitRows([60000, 40000]);
    expect(
      await fetchInstalmentSplit(rpcClient({ data: good, error: null }), 'learner-1', 'cat-1', 100000)
    ).toEqual(good);
  });
});

describe('expandBillsWithInstalmentPlans', () => {
  it('NO-PLAN PASSTHROUGH: returns the input rows untouched (deep-equal, same order)', async () => {
    const input = [
      { ...yearlyBill },
      { ...yearlyBill, item_category_id: null, bill_description: 'Unmapped Fee' },
    ];
    const out = await expandBillsWithInstalmentPlans(
      rpcClient({ data: [], error: null }),
      'learner-1',
      input
    );
    expect(out).toEqual(input);
  });

  it('ERROR PASSTHROUGH: an RPC failure never blocks generation, single bills emit', async () => {
    const input = [{ ...yearlyBill }];
    const out = await expandBillsWithInstalmentPlans(throwingClient, 'learner-1', input);
    expect(out).toEqual(input);
  });

  it('expands one yearly bill into N instalment rows summing exactly to the total', async () => {
    const out = await expandBillsWithInstalmentPlans(
      rpcClient({
        data: splitRows([33330, 33330, 33340], ['2026-09-15', '2026-12-15', '2027-03-15']),
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill }]
    );

    expect(out).toHaveLength(3);
    expect(out.map((b) => b.final_amount)).toEqual([33330, 33330, 33340]);
    expect(
      Math.round(out.reduce((s, b) => s + Number(b.final_amount), 0) * 100)
    ).toBe(100000 * 100);
    expect(out.map((b) => b.due_date)).toEqual(['2026-09-15', '2026-12-15', '2027-03-15']);
    expect(out[0].bill_description).toBe('1 Year Tuition Fee — Instalment 1/3');
    expect(out[2].bill_description).toBe('1 Year Tuition Fee — Instalment 3/3');
    // Everything else on the row stays identical to the yearly bill.
    for (const bill of out) {
      expect(bill.student_id).toBe(yearlyBill.student_id);
      expect(bill.institution_id).toBe(yearlyBill.institution_id);
      expect(bill.item_category_id).toBe(yearlyBill.item_category_id);
      expect(bill.status).toBe('unpaid');
      expect(bill.tax_amount).toBe(0);
      expect(bill.balance_amount).toBe(bill.final_amount);
      expect(bill.unit_amount).toBe(bill.final_amount);
    }
  });

  it('PLAN MATCHING SPECIFICITY: only the row whose category the RPC matches splits; siblings pass through', async () => {
    // The category-specific matching itself lives in the SQL engine (exact
    // grain: institution x programme x category x academic year). What the TS
    // layer owes is per-row isolation: a split answer for one category must
    // not leak onto another row.
    const client: SupabaseRpcClient = {
      rpc: async (_fn, args) => {
        if ((args as { p_category_id: string }).p_category_id === 'cat-tuition-y1') {
          return { data: splitRows([60000, 40000]), error: null };
        }
        return { data: [], error: null };
      },
    };

    const otherBill = {
      ...yearlyBill,
      item_category_id: 'cat-exam-fee',
      bill_description: 'Exam Fee',
      final_amount: 5000,
      unit_amount: 5000,
      total_amount: 5000,
      balance_amount: 5000,
    };

    const out = await expandBillsWithInstalmentPlans(client, 'learner-1', [
      { ...yearlyBill },
      { ...otherBill },
    ]);

    expect(out).toHaveLength(3); // 2 instalments + 1 untouched sibling
    expect(out[0].bill_description).toBe('1 Year Tuition Fee — Instalment 1/2');
    expect(out[1].bill_description).toBe('1 Year Tuition Fee — Instalment 2/2');
    expect(out[2]).toEqual(otherBill);
  });

  it('skips rows without a category or with a non-positive amount', async () => {
    const zero = { ...yearlyBill, final_amount: 0 };
    const noCat = { ...yearlyBill, item_category_id: null };
    const client: SupabaseRpcClient = {
      rpc: async () => {
        throw new Error('must not be called for unsplittable rows');
      },
    };
    const out = await expandBillsWithInstalmentPlans(client, 'learner-1', [zero, noCat]);
    expect(out).toEqual([zero, noCat]);
  });
});
