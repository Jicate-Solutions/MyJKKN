import { describe, it, expect } from 'vitest';
import {
  resolveScheduleSheet,
  SCHEDULE_HEADERS,
  FEE_SCHEDULE_SHEET_NAME,
  type BulkResolveLookups,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

// What these tests cover: the "Fee Schedules" sheet parser, which is the only
// place a bulk schedule import can go wrong silently. The database enforces the
// same rules (chk_afsis_amount_exactly_one, chk_afsis_due_exactly_one,
// afsis_validate_schedule_shape, afsis_validate_status_target) — but the DB
// rejects at COMMIT, halfway through a batch, with no row number. Catching it
// here is what turns "import failed" into "Schedules row 7: ...".

const STRUCT = '11111111-1111-4111-8111-111111111111';
const TUITION = '22222222-2222-4222-8222-222222222222';
const UNIFORM = '33333333-3333-4333-8333-333333333333';

const lookups = {
  categoriesByName: new Map([
    ['1 year tuition fee', TUITION],
    ['uniform fee', UNIFORM],
  ]),
  // 'active' is deliberately ABSENT: it grants a portal login, and the loader
  // filters gates_login rows out so a spreadsheet cannot name one.
  learnerStatuses: new Map([
    ['reserved', 'reserved'],
    ['admitted', 'admitted'],
  ]),
} as unknown as BulkResolveLookups;

/** Builds a sheet row with every header present, as sheet_to_json produces. */
const row = (over: Partial<Record<(typeof SCHEDULE_HEADERS)[number], unknown>>) => {
  const base: Record<string, unknown> = {};
  for (const h of SCHEDULE_HEADERS) base[h] = '';
  return { ...base, ...over };
};

const split = (n: number, pct: number, days: number, promotes = '') =>
  row({
    'Fee Structure ID': STRUCT,
    'Fee Category': '1 Year Tuition Fee',
    'Instalment #': n,
    'Share %': pct,
    'Due After (Days)': days,
    'Promotes To': promotes,
  });

describe('resolveScheduleSheet — the sheet name is stable', () => {
  it('is the tab both export and template write', () => {
    expect(FEE_SCHEDULE_SHEET_NAME).toBe('Fee Schedules');
  });
});

describe('resolveScheduleSheet — valid schedules', () => {
  it('reads a 30/40/30 split with status rules', () => {
    const { byStructure, errors } = resolveScheduleSheet(
      [split(1, 30, 15, 'Reserved'), split(2, 40, 90, 'Admitted'), split(3, 30, 180)],
      lookups,
    );

    expect(errors).toEqual([]);
    const cfgs = byStructure.get(STRUCT)!;
    expect(cfgs).toHaveLength(1);
    expect(cfgs[0].schedule_mode).toBe('split');
    expect(cfgs[0].billing_category_id).toBe(TUITION);
    expect(cfgs[0].lines.map((l) => l.share_percent)).toEqual([30, 40, 30]);
    expect(cfgs[0].lines.map((l) => l.due_offset_days)).toEqual([15, 90, 180]);
    expect(cfgs[0].lines.map((l) => l.promotes_to_status_code)).toEqual([
      'reserved',
      'admitted',
      null,
    ]);
  });

  it('accepts a status by its LABEL as well as its code', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [split(1, 50, 15, 'Reserved'), split(2, 50, 90, 'admitted')],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.get(STRUCT)![0].lines.map((l) => l.promotes_to_status_code)).toEqual([
      'reserved',
      'admitted',
    ]);
  });

  it('sorts instalments by number regardless of row order', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [split(3, 30, 180), split(1, 30, 15), split(2, 40, 90)],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.get(STRUCT)![0].lines.map((l) => l.sequence_no)).toEqual([1, 2, 3]);
  });

  it('allows MIXING an offset and a fixed date across instalments', () => {
    // "+15 days from admission, then two hard calendar dates" is a real
    // schedule shape, and the per-row XOR is what makes it expressible.
    const { errors, byStructure } = resolveScheduleSheet(
      [
        split(1, 30, 15),
        row({
          'Fee Structure ID': STRUCT,
          'Fee Category': '1 Year Tuition Fee',
          'Instalment #': 2,
          'Share %': 70,
          'Due Date': '2026-12-10',
        }),
      ],
      lookups,
    );
    expect(errors).toEqual([]);
    const lines = byStructure.get(STRUCT)![0].lines;
    expect(lines[0].due_offset_days).toBe(15);
    expect(lines[0].due_date).toBeNull();
    expect(lines[1].due_date).toBe('2026-12-10');
    expect(lines[1].due_offset_days).toBeNull();
  });

  it('a BLANK instalment number means the whole fee, not a split', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [
        row({
          'Fee Structure ID': STRUCT,
          'Fee Category': 'Uniform Fee',
          'Due After (Days)': 45,
          'Promotes To': 'Reserved',
        }),
      ],
      lookups,
    );
    expect(errors).toEqual([]);
    const cfg = byStructure.get(STRUCT)![0];
    expect(cfg.schedule_mode).toBe('single');
    expect(cfg.due_offset_days).toBe(45);
    expect(cfg.promotes_to_status_code).toBe('reserved');
    expect(cfg.lines).toEqual([]);
  });

  it('a bare whole-fee row with no dates is how a split is REMOVED', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee' })],
      lookups,
    );
    expect(errors).toEqual([]);
    const cfg = byStructure.get(STRUCT)![0];
    expect(cfg.schedule_mode).toBe('single');
    expect(cfg.lines).toEqual([]);
    expect(cfg.due_offset_days).toBeNull();
    expect(cfg.due_date).toBeNull();
  });

  it('keeps two categories of one structure separate', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [
        split(1, 50, 15),
        split(2, 50, 90),
        row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', 'Due After (Days)': 10 }),
      ],
      lookups,
    );
    expect(errors).toEqual([]);
    const cfgs = byStructure.get(STRUCT)!;
    expect(cfgs).toHaveLength(2);
    expect(new Set(cfgs.map((c) => c.billing_category_id))).toEqual(new Set([TUITION, UNIFORM]));
  });

  it('ignores entirely blank rows', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [row({}), split(1, 50, 15), row({}), split(2, 50, 90)],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.get(STRUCT)![0].lines).toHaveLength(2);
  });
});

describe('resolveScheduleSheet — every rejection names its row', () => {
  const firstError = (rows: Record<string, unknown>[]) =>
    resolveScheduleSheet(rows, lookups).errors[0] ?? '';

  it('rejects percentages that do not total 100', () => {
    const msg = firstError([split(1, 30, 15), split(2, 30, 90)]);
    expect(msg).toMatch(/total 60\.00%, not 100%/);
    expect(msg).toMatch(/^Schedules row \d+:/);
  });

  it('rejects a gap in the instalment numbers', () => {
    const msg = firstError([split(1, 50, 15), split(3, 50, 90)]);
    expect(msg).toMatch(/must run 1\.\.2 with no gaps/);
  });

  it('rejects a one-row split and points at the blank-# alternative', () => {
    const msg = firstError([split(1, 100, 15)]);
    expect(msg).toMatch(/at least 2/);
    expect(msg).toMatch(/leave Instalment # blank/);
  });

  it('rejects both Share % and Fixed Amount on one row', () => {
    const msg = firstError([
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
        'Instalment #': 1, 'Share %': 50, 'Fixed Amount': 5000, 'Due After (Days)': 15,
      }),
      split(2, 50, 90),
    ]);
    expect(msg).toMatch(/EITHER Share % OR Fixed Amount/);
  });

  it('rejects both a due offset and a due date on one row', () => {
    const msg = firstError([
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
        'Instalment #': 1, 'Share %': 50, 'Due After (Days)': 15, 'Due Date': '2026-12-10',
      }),
    ]);
    expect(msg).toMatch(/not both/);
  });

  it('rejects a login-granting status — the sheet is not a way around that rule', () => {
    const msg = firstError([split(1, 50, 15, 'Active'), split(2, 50, 90)]);
    expect(msg).toMatch(/not a status a payment may promote into/);
  });

  it('rejects an unknown fee category', () => {
    const msg = firstError([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Made Up Fee', 'Due After (Days)': 10 }),
    ]);
    expect(msg).toMatch(/not an active billing category/);
  });

  it('rejects a schedule with no Fee Structure ID', () => {
    const msg = firstError([
      row({ 'Fee Category': '1 Year Tuition Fee', 'Instalment #': 1, 'Share %': 100 }),
    ]);
    expect(msg).toMatch(/Fee Structure ID is required/);
  });

  it('rejects mixing a whole-fee row with numbered instalments', () => {
    const msg = firstError([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', 'Due After (Days)': 10 }),
      split(1, 50, 15),
      split(2, 50, 90),
    ]);
    expect(msg).toMatch(/both a blank Instalment # .* and numbered instalments/);
  });

  it('rejects a negative or fractional due offset', () => {
    expect(firstError([split(1, 50, -5), split(2, 50, 90)])).toMatch(/whole number of days/);
  });

  it('drops only the offending group, keeping the valid one', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [
        split(1, 30, 15), // tuition: 30 + 30 != 100 -> rejected
        split(2, 30, 90),
        row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', 'Due After (Days)': 10 }),
      ],
      lookups,
    );
    expect(errors).toHaveLength(1);
    const cfgs = byStructure.get(STRUCT) ?? [];
    expect(cfgs).toHaveLength(1);
    expect(cfgs[0].billing_category_id).toBe(UNIFORM);
  });
});

// ---------------------------------------------------------------------------
// The seam the unit tests above cannot see: the export/template routes WRITE
// the sheet with ExcelJS, the import route READS it with `xlsx`. Those are two
// different libraries agreeing on one header row by convention alone — if a
// header string drifts, every schedule silently resolves to "not listed" and
// the import reports success having changed nothing.
describe('Fee Schedules round-trip: ExcelJS writes it, xlsx reads it', () => {
  it('survives a real workbook write/read with the shared header constants', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const XLSX = await import('xlsx');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEE_SCHEDULE_SHEET_NAME);
    ws.columns = SCHEDULE_HEADERS.map((h) => ({ header: h, key: h }));
    ws.addRow({
      'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
      'Instalment #': 1, 'Share %': 30, 'Due After (Days)': 15, 'Promotes To': 'Reserved',
    });
    ws.addRow({
      'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
      'Instalment #': 2, 'Share %': 70, 'Due Date': '2027-01-31',
    });

    const buf = await wb.xlsx.writeBuffer();
    const read = XLSX.read(buf, { type: 'buffer', cellDates: true });

    // The tab must be findable BY NAME — the import route never takes sheet 0.
    expect(read.SheetNames).toContain(FEE_SCHEDULE_SHEET_NAME);

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      read.Sheets[FEE_SCHEDULE_SHEET_NAME], { defval: '' },
    );
    // Every key xlsx produces must be one of ours -- a mismatched header row
    // shows up as "__EMPTY"/"__EMPTY_1" keys, which resolve to nothing.
    for (const key of Object.keys(rows[0])) {
      expect(SCHEDULE_HEADERS).toContain(key);
    }
    // And every column carrying data must have survived under its own name.
    for (const key of ['Fee Structure ID', 'Fee Category', 'Instalment #', 'Share %']) {
      expect(Object.keys(rows[0])).toContain(key);
    }

    const { errors, byStructure } = resolveScheduleSheet(rows, lookups);
    expect(errors).toEqual([]);
    const lines = byStructure.get(STRUCT)![0].lines;
    expect(lines.map((l) => l.share_percent)).toEqual([30, 70]);
    expect(lines[0].due_offset_days).toBe(15);
    expect(lines[0].promotes_to_status_code).toBe('reserved');
    expect(lines[1].due_date).toBe('2027-01-31');
    // ExcelJS's first import alone runs well past the 5s default.
  }, 60_000);
});
