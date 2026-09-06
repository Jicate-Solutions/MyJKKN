import { describe, it, expect } from 'vitest';
import {
  computeInstalmentAmounts,
  validatePlanLines,
  verifyInstalmentSplitRows,
  fetchInstalmentSplit,
  attachInstalmentSchedules,
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

  it('ACCEPTS a single row — that is a resolved due date, not a malformed split', () => {
    // Contract change 2026-08-21. The engine now returns exactly one row to say
    // "this fee item is not split, but the fee structure configures THIS due
    // date". Rejecting it would silently discard the configured date and fall
    // back to +30 days — the very defect per-item due dates exist to remove.
    expect(verifyInstalmentSplitRows(100, splitRows([100]))).toBe(true);
  });

  it('rejects zero rows, gaps in sequence, and wrong counts', () => {
    expect(verifyInstalmentSplitRows(100, [])).toBe(false);
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

describe('attachInstalmentSchedules', () => {
  it('NO-SCHEDULE PASSTHROUGH: returns the input rows untouched (deep-equal, same order)', async () => {
    const input = [
      { ...yearlyBill },
      { ...yearlyBill, item_category_id: null, bill_description: 'Unmapped Fee' },
    ];
    const out = await attachInstalmentSchedules(
      rpcClient({ data: [], error: null }),
      'learner-1',
      input
    );
    expect(out).toEqual(input);
  });

  it('ERROR PASSTHROUGH: an RPC failure never blocks generation, the bill still emits', async () => {
    const input = [{ ...yearlyBill }];
    const out = await attachInstalmentSchedules(throwingClient, 'learner-1', input);
    expect(out).toEqual(input);
  });

  it('ONE BILL, NOT N: a 3-way split stays a single row for the FULL amount', async () => {
    // This is the whole point of the redesign. The previous implementation
    // returned three rows here, which is why three fee items produced five
    // bills. Tuition is one debt of 100,000 collectable in three tranches.
    const out = await attachInstalmentSchedules(
      rpcClient({
        data: splitRows([30000, 40000, 30000], ['2026-10-06', '2026-09-20', '2026-09-20']).map(
          (r) => ({ ...r, matched_source: 'item_schedule' as const, matched_ref_id: 'item-1' })
        ),
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill, fee_structure_item_id: 'item-1' }]
    );

    expect(out).toHaveLength(1);
    expect(out[0].final_amount).toBe(100000);
    expect(out[0].balance_amount).toBe(100000);
    // No " — Instalment 1/3" suffix: there is only one bill.
    expect(out[0].bill_description).toBe('1 Year Tuition Fee');
    expect(out[0].__instalments).toHaveLength(3);
  });

  it('dates the bill at the EARLIEST tranche, even when the schedule is out of order', async () => {
    // Tranche 1 is dated last here. due_date means "when the next money is
    // owed", so it must be the earliest date, not the first sequence number.
    const out = await attachInstalmentSchedules(
      rpcClient({
        data: splitRows([30000, 40000, 30000], ['2026-10-06', '2026-09-20', '2026-09-20']).map(
          (r) => ({ ...r, matched_source: 'item_schedule' as const, matched_ref_id: 'item-1' })
        ),
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill, fee_structure_item_id: 'item-1' }]
    );
    expect(out[0].due_date).toBe('2026-09-20');
  });

  it('the attached tranches sum EXACTLY to the bill amount', async () => {
    const out = await attachInstalmentSchedules(
      rpcClient({
        data: splitRows([33330, 33330, 33340]).map((r) => ({
          ...r,
          matched_source: 'item_schedule' as const,
          matched_ref_id: 'item-1',
        })),
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill, fee_structure_item_id: 'item-1' }]
    );
    const sum = out[0].__instalments!.reduce((s, t) => s + t.amount, 0);
    expect(Math.round(sum * 100)).toBe(100000 * 100);
    expect(out[0].__instalments!.map((t) => t.sequence_no)).toEqual([1, 2, 3]);
  });

  it('SINGLE ROW: applies the configured due date and attaches NO tranches', async () => {
    // An unsplit fee is not a schedule — writing a one-row schedule would add
    // a table row that says nothing the bill does not already say.
    const out = await attachInstalmentSchedules(
      rpcClient({
        data: [
          {
            instalment_no: 1,
            instalment_count: 1,
            instalment_amount: 100000,
            instalment_due_date: '2026-10-31',
            promotes_to_status_code: 'reserved',
            matched_source: 'item_single',
            matched_ref_id: 'item-1',
          },
        ],
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill, fee_structure_item_id: 'item-1' }]
    );

    expect(out).toHaveLength(1);
    expect(out[0].due_date).toBe('2026-10-31');
    expect(out[0].final_amount).toBe(100000);
    expect(out[0].__instalments).toBeUndefined();
    expect(out[0].fee_structure_item_id).toBe('item-1');
  });

  it('ISOLATION: a schedule for one fee never leaks onto another', async () => {
    const client: SupabaseRpcClient = {
      rpc: async (_fn, args) => {
        if ((args as { p_category_id: string }).p_category_id === 'cat-tuition-y1') {
          return {
            data: splitRows([60000, 40000]).map((r) => ({
              ...r,
              matched_source: 'item_schedule' as const,
              matched_ref_id: 'item-a',
            })),
            error: null,
          };
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

    const out = await attachInstalmentSchedules(client, 'learner-1', [
      { ...yearlyBill },
      { ...otherBill },
    ]);

    expect(out).toHaveLength(2); // one bill each — never 3
    expect(out[0].__instalments).toHaveLength(2);
    expect(out[1]).toEqual(otherBill);
  });

  it('LEGACY PLAN SOURCE: never writes the plan id into fee_structure_item_id', async () => {
    const out = await attachInstalmentSchedules(
      rpcClient({
        data: splitRows([60000, 40000]).map((r) => ({
          ...r,
          matched_source: 'plan' as const,
          matched_ref_id: 'plan-99',
        })),
        error: null,
      }),
      'learner-1',
      [{ ...yearlyBill }]
    );

    expect(out).toHaveLength(1);
    expect(out[0].fee_structure_item_id == null).toBe(true);
  });

  it('skips rows without a category or with a non-positive amount', async () => {
    const zero = { ...yearlyBill, final_amount: 0 };
    const noCat = { ...yearlyBill, item_category_id: null };
    const client: SupabaseRpcClient = {
      rpc: async () => {
        throw new Error('must not be called for unschedulable rows');
      },
    };
    const out = await attachInstalmentSchedules(client, 'learner-1', [zero, noCat]);
    expect(out).toEqual([zero, noCat]);
  });

  it('passes the fee structure item id through to the RPC when known', async () => {
    let seen: unknown = 'never called';
    const client: SupabaseRpcClient = {
      rpc: async (_fn, args) => {
        seen = (args as { p_fee_structure_item_id: unknown }).p_fee_structure_item_id;
        return { data: [], error: null };
      },
    };
    await attachInstalmentSchedules(client, 'learner-1', [
      { ...yearlyBill, fee_structure_item_id: 'item-42' },
    ]);
    expect(seen).toBe('item-42');
  });
});
