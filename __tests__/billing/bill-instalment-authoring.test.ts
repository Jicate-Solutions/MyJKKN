import { describe, expect, it } from 'vitest';
import {
  parseInstalmentColumns,
  type ParsedInstalmentLine,
} from '@/lib/utils/mappings/student-bill-excel-mappings';
import { buildInstalmentRows } from '@/lib/services/billing/instalments/bill-instalment-writer';
import { groupPreviewRows } from '@/lib/services/billing/instalments/fee-structure-preview';
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-arithmetic';
import { validatePlanLines } from '@/lib/services/billing/instalments/instalment-plan-service';

/** The sheet importer's own date normaliser is passed in; ISO passes through. */
const toISO = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Mirrors the form's sharesFromAmounts: every share but the LAST is its own
 * rounded quotient, and the last is the remainder. Duplicated here on purpose —
 * the test asserts the RULE, so it must not import the implementation it checks.
 */
function sharesFromAmounts(amounts: number[], total: number): number[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const out: number[] = [];
  let used = 0;
  amounts.forEach((amount, i) => {
    if (i < amounts.length - 1) {
      const pct = round2((amount / total) * 100);
      out.push(pct);
      used += pct;
    } else {
      out.push(round2(100 - used));
    }
  });
  return out;
}

const asPlanLines = (lines: ParsedInstalmentLine[]) =>
  lines.map((l, i) => ({
    sequence_no: i + 1,
    share_percent: l.share_percent,
    fixed_amount: null,
    due_date: l.due_date,
    due_offset_days: null,
  }));

describe('parseInstalmentColumns', () => {
  it('treats both-blank as "no schedule" — the pre-existing behaviour of every sheet', () => {
    expect(parseInstalmentColumns('', '', toISO)).toEqual({ lines: [], errors: [] });
    expect(parseInstalmentColumns('  ', '   ', toISO)).toEqual({ lines: [], errors: [] });
  });

  it('refuses one column without the other', () => {
    expect(parseInstalmentColumns('30/70', '', toISO).errors).toHaveLength(1);
    expect(parseInstalmentColumns('', '2026-06-01|2026-10-01', toISO).errors).toHaveLength(1);
  });

  it('refuses a share/date count mismatch rather than silently truncating', () => {
    const out = parseInstalmentColumns('30/35/35', '2026-06-01|2026-10-01', toISO);
    expect(out.lines).toEqual([]);
    expect(out.errors[0]).toMatch(/do not line up/i);
  });

  it('refuses a single instalment — one tranche is not a schedule', () => {
    expect(parseInstalmentColumns('100', '2026-06-01', toISO).errors[0]).toMatch(/at least 2/i);
  });

  it('refuses shares that do not total 100', () => {
    const out = parseInstalmentColumns('30/30/30', '2026-06-01|2026-10-01|2027-02-01', toISO);
    expect(out.lines).toEqual([]);
    expect(out.errors[0]).toMatch(/must total 100/i);
  });

  it('refuses an unparseable date', () => {
    const out = parseInstalmentColumns('50/50', '2026-06-01|not-a-date', toISO);
    expect(out.errors[0]).toMatch(/not a valid date/i);
  });

  it('accepts 30/35/35 and produces lines the save-time validator agrees with', () => {
    const out = parseInstalmentColumns(
      '30/35/35',
      '2026-06-01|2026-10-30|2027-02-28',
      toISO
    );
    expect(out.errors).toEqual([]);
    expect(out.lines).toEqual([
      { share_percent: 30, due_date: '2026-06-01' },
      { share_percent: 35, due_date: '2026-10-30' },
      { share_percent: 35, due_date: '2027-02-28' },
    ]);
    // The sheet path and the form path must not disagree about what is valid.
    expect(validatePlanLines(asPlanLines(out.lines))).toEqual([]);
  });

  it('accepts commas and spaces as separators', () => {
    const out = parseInstalmentColumns('50, 50', '2026-06-01, 2026-12-01', toISO);
    expect(out.errors).toEqual([]);
    expect(out.lines).toHaveLength(2);
  });
});

describe('shares derived from engine amounts', () => {
  // The bug this guards: rounding each share independently makes thirds sum to
  // 99.99, and validatePlanLines demands exactly 100 — so a form prefilled from
  // the learner's own fee structure would refuse to save it.
  it.each([
    ['halves', 30000, [15000, 15000]],
    ['30/35/35', 34000, [10200, 11900, 11900]],
    ['thirds', 30000, [10000, 10000, 10000]],
    ['awkward', 33333, [11111, 11111, 11111]],
  ])('%s: derived shares total exactly 100 and pass validation', (_label, total, amounts) => {
    const shares = sharesFromAmounts(amounts as number[], total as number);
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.005);

    const lines = shares.map((share_percent, i) => ({
      share_percent,
      due_date: `2026-0${i + 1}-01`,
    }));
    expect(validatePlanLines(asPlanLines(lines))).toEqual([]);
  });

  it('round-trips an exact split back to the engine rupees', () => {
    const total = 34000;
    const engine = [10200, 11900, 11900];
    const shares = sharesFromAmounts(engine, total);
    expect(computeInstalmentAmounts(total, shares.map((s) => ({ share_percent: s })))).toEqual(
      engine
    );
  });
});

describe('buildInstalmentRows', () => {
  const lines = (...pcts: number[]) =>
    pcts.map((share_percent, i) => ({ share_percent, due_date: `2026-0${i + 1}-01` }));

  it('numbers sequences contiguously from 1', () => {
    const rows = buildInstalmentRows('bill-1', 30000, lines(30, 35, 35))!;
    expect(rows.map((r) => r.sequence_no)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.bill_id === 'bill-1')).toBe(true);
  });

  it.each([
    [30000, [30, 35, 35]],
    [34000, [30, 35, 35]],
    [30000, [33.33, 33.33, 33.34]],
    [1, [50, 50]],
    [99999.99, [10, 20, 70]],
  ])(
    'tranches of %d sum EXACTLY to the bill — the deferred trg_bbi_validate_sum rejects anything else',
    (total, pcts) => {
      const rows = buildInstalmentRows('b', total as number, lines(...(pcts as number[])))!;
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.round(sum * 100)).toBe(Math.round((total as number) * 100));
    }
  );

  it('returns null when the split is not writable, so callers fall back to a plain bill', () => {
    expect(buildInstalmentRows('b', 30000, lines(100))).toBeNull();
    expect(buildInstalmentRows('b', 0, lines(50, 50))).toBeNull();
  });
});

describe('groupPreviewRows', () => {
  const row = (o: Partial<Record<string, unknown>>) => ({
    sort_order: 1,
    category_id: 'cat-1',
    category_name: 'Tuition',
    item_amount: 65000,
    is_billable: true,
    owner_module: 'admission',
    instalment_no: 1,
    instalment_count: 1,
    instalment_amount: 65000,
    share_percent: 100,
    due_date: '2026-10-30',
    matched_source: 'item_single',
    ...o,
  }) as never;

  it('folds a split fee back into one item carrying its lines', () => {
    const items = groupPreviewRows([
      row({ instalment_no: 1, instalment_count: 2, instalment_amount: 32500, share_percent: 50, due_date: '2026-10-30', matched_source: 'item_schedule' }),
      row({ instalment_no: 2, instalment_count: 2, instalment_amount: 32500, share_percent: 50, due_date: '2027-02-28', matched_source: 'item_schedule' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(65000);
    expect(items[0].instalments).toEqual([
      { share_percent: 50, due_date: '2026-10-30' },
      { share_percent: 50, due_date: '2027-02-28' },
    ]);
  });

  it('treats an unsplit fee as a due date, not a one-line schedule', () => {
    const items = groupPreviewRows([row({})]);
    expect(items[0].instalments).toEqual([]);
    expect(items[0].due_date).toBe('2026-10-30');
  });

  it('forces derived shares to total exactly 100', () => {
    // Three rounded thirds arrive as 33.33 each; the last must become 33.34.
    const items = groupPreviewRows([
      row({ sort_order: 2, item_amount: 30000, instalment_no: 1, instalment_count: 3, instalment_amount: 10000, share_percent: 33.33, due_date: '2026-06-01' }),
      row({ sort_order: 2, item_amount: 30000, instalment_no: 2, instalment_count: 3, instalment_amount: 10000, share_percent: 33.33, due_date: '2026-10-01' }),
      row({ sort_order: 2, item_amount: 30000, instalment_no: 3, instalment_count: 3, instalment_amount: 10000, share_percent: 33.33, due_date: '2027-02-01' }),
    ]);
    const sum = items[0].instalments.reduce((a, l) => a + l.share_percent, 0);
    expect(sum).toBe(100);
    expect(validatePlanLines(asPlanLines(items[0].instalments))).toEqual([]);
  });

  it('keeps hostel/mess/transport visible but marked not billable', () => {
    const items = groupPreviewRows([
      row({ sort_order: 3, category_id: 'cat-h', category_name: 'Hostel Fee', is_billable: false, owner_module: 'campus_living', instalment_no: null, instalment_count: null, due_date: null, share_percent: null }),
    ]);
    expect(items[0].is_billable).toBe(false);
    expect(items[0].owner_module).toBe('campus_living');
    expect(items[0].instalments).toEqual([]);
  });

  it('separates fee items by sort_order, not by category name', () => {
    const items = groupPreviewRows([
      row({ sort_order: 1, category_id: 'a', category_name: 'Tuition' }),
      row({ sort_order: 2, category_id: 'b', category_name: 'Placement', item_amount: 5000, instalment_amount: 5000 }),
    ]);
    expect(items).toHaveLength(2);
  });
});
