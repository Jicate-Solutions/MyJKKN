import { describe, it, expect } from 'vitest';
import {
  academicYearKey,
  earlierDuesFor,
  earlierDuesMessage,
  earlierDuesShortReason,
  earlierDuesSummary,
  findEarlierYearDuesBlock,
} from '@/lib/utils/billing/academic-year-payment-order';

// Online payment year order — OLDEST YEAR FIRST: a bill cannot be paid online
// while any bill of an older academic year still has a balance.

describe('academicYearKey', () => {
  it('uses the academic year start date first', () => {
    expect(academicYearKey('2025-06-01', '2027-01-15')).toBe(2025);
  });
  it('falls back to the June–May year of the due date', () => {
    expect(academicYearKey(null, '2026-06-30')).toBe(2026);
    expect(academicYearKey(undefined, '2026-03-31')).toBe(2025);
  });
  it('is null with neither', () => {
    expect(academicYearKey(null, null)).toBeNull();
  });
});

describe('earlierDuesFor', () => {
  const rows = [
    { year: '2024-2025', yearKey: 2024, balance: 0 },
    { year: '2025-2026', yearKey: 2025, balance: 50000, status: 'partially_paid' },
    { year: '2025-2026', yearKey: 2025, balance: 5000, status: 'superseded' },
    { year: '2026-2027', yearKey: 2026, balance: 150000 },
    { year: '2026-2027', yearKey: 2026, balance: 2000 },
    { year: '2027-2028', yearKey: 2027, balance: 90000 },
    { year: 'Other', yearKey: null, balance: 700 },
  ];

  it('locks the current year behind an unpaid past year (the reported case)', () => {
    const dues = earlierDuesFor(rows, 2026);
    expect(dues.years).toEqual([{ year: '2025-2026', balance: 50000, count: 1 }]);
    expect(dues.total).toBe(50000);
  });

  it('collects every older year, oldest first, for a later bill', () => {
    const dues = earlierDuesFor(rows, 2027);
    expect(dues.years.map((y) => y.year)).toEqual(['2025-2026', '2026-2027']);
    expect(dues.total).toBe(202000);
  });

  it('never locks the oldest pending year or same-year bills', () => {
    expect(earlierDuesFor(rows, 2025)).toEqual({ years: [], total: 0 });
  });

  it('never locks or counts an unordered (no-year, no-date) bill', () => {
    expect(earlierDuesFor(rows, null)).toEqual({ years: [], total: 0 });
    expect(earlierDuesFor(rows, 2030).years.map((y) => y.year)).not.toContain('Other');
  });
});

describe('messages', () => {
  const dues = earlierDuesFor(
    [
      { year: '2024-2025', yearKey: 2024, balance: 5000 },
      { year: '2025-2026', yearKey: 2025, balance: 45000 },
    ],
    2026
  );

  it('names the older and newer years', () => {
    const msg = earlierDuesMessage(dues, ['2026-2027', '2026-2027']);
    expect(msg).toContain('Academic Years 2024-2025 and 2025-2026');
    expect(msg).toContain('₹50,000');
    expect(msg).toContain('before paying Academic Year 2026-2027 fees online');
  });

  it('short reason and summary', () => {
    expect(earlierDuesShortReason(dues)).toBe(
      'Clear Academic Years 2024-2025 and 2025-2026 dues (₹50,000) first'
    );
    expect(earlierDuesSummary(dues)).toBe('Academic Years 2024-2025 and 2025-2026 (₹50,000)');
  });
});

/** Minimal PostgREST-shaped fake: bills by student, years by id. */
function fakeDb(
  bills: {
    id: string;
    balance_amount: number;
    status?: string;
    item_category_id?: string | null;
    academic_year_id: string | null;
    due_date?: string | null;
  }[],
  yearsError: unknown = null
) {
  const years = [
    { id: 'y25', academic_year_name: '2025-2026 ', start_date: '2025-06-01' },
    { id: 'y26', academic_year_name: '2026-2027', start_date: '2026-06-01' },
    { id: 'y27', academic_year_name: '2027-2028', start_date: '2027-06-01' },
  ];
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: table === 'billing_student_bills' ? bills : [], error: null }),
        in: async () => ({ data: yearsError ? null : years, error: yearsError }),
      }),
    }),
  };
}

describe('findEarlierYearDuesBlock', () => {
  const hidden = new Set(['hidden-cat']);
  const run = (db: ReturnType<typeof fakeDb>, billIds: string[]) =>
    findEarlierYearDuesBlock(db, { studentId: 's', billIds, hiddenCategoryIds: hidden });

  it('blocks the 2026-27 bill while 2025-26 has a balance', async () => {
    const db = fakeDb([
      { id: 'b25', balance_amount: 50000, academic_year_id: 'y25', status: 'partially_paid' },
      { id: 'b26', balance_amount: 150000, academic_year_id: 'y26' },
    ]);
    const res = await run(db, ['b26']);
    expect(res.blocked).toBe(true);
    if (res.blocked) {
      expect(res.dues.total).toBe(50000);
      expect(res.message).toContain('Academic Year 2025-2026 (₹50,000)');
      expect(res.message).toContain('before paying Academic Year 2026-2027');
    }
  });

  it('allows the oldest pending year', async () => {
    const db = fakeDb([
      { id: 'b25', balance_amount: 50000, academic_year_id: 'y25' },
      { id: 'b26', balance_amount: 150000, academic_year_id: 'y26' },
    ]);
    expect(await run(db, ['b25'])).toEqual({ blocked: false });
  });

  it('refuses a combined older + newer checkout', async () => {
    const db = fakeDb([
      { id: 'b25', balance_amount: 50000, academic_year_id: 'y25' },
      { id: 'b26', balance_amount: 150000, academic_year_id: 'y26' },
    ]);
    expect((await run(db, ['b25', 'b26'])).blocked).toBe(true);
  });

  it('allows the newer year once older dues are cleared (paid / superseded / hidden ignored)', async () => {
    const db = fakeDb([
      { id: 'p25', balance_amount: 0, academic_year_id: 'y25', status: 'paid' },
      { id: 's25', balance_amount: 4000, academic_year_id: 'y25', status: 'superseded' },
      { id: 'h25', balance_amount: 1000, academic_year_id: 'y25', item_category_id: 'hidden-cat' },
      { id: 'b26', balance_amount: 150000, academic_year_id: 'y26' },
    ]);
    expect(await run(db, ['b26'])).toEqual({ blocked: false });
  });

  it('orders a no-year bill by its due date', async () => {
    const db = fakeDb([
      { id: 'n', balance_amount: 700, academic_year_id: null, due_date: '2025-08-01' },
      { id: 'b26', balance_amount: 150000, academic_year_id: 'y26' },
    ]);
    expect((await run(db, ['b26'])).blocked).toBe(true);
  });

  it('fails closed when the year lookup errors', async () => {
    const db = fakeDb(
      [{ id: 'b26', balance_amount: 150000, academic_year_id: 'y26' }],
      { message: 'boom' }
    );
    await expect(run(db, ['b26'])).rejects.toEqual({ message: 'boom' });
  });
});
