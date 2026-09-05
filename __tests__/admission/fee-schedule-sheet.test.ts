import { describe, it, expect } from 'vitest';
import {
  resolveScheduleSheet,
  normalizeDueAnchor,
  columnLetter,
  headerColumn,
  SCHEDULE_HEADERS,
  SCHEDULE_REF_HEADERS,
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

// ---------------------------------------------------------------------------
// The export now writes a row for EVERY fee item, not only the configured few,
// because a sheet you cannot see a row in is a sheet you cannot edit. That
// makes two properties load-bearing: the "(ref)" columns must not change how a
// row resolves, and an untouched export must re-import as a no-op.
describe('Fee Schedules: the "(ref)" context columns', () => {
  it('are part of the sheet, so export and template both write them', () => {
    expect(SCHEDULE_HEADERS).toContain('Institution (ref)');
    expect(SCHEDULE_HEADERS).toContain('Structure Name (ref)');
  });

  it('do not change how a row resolves', () => {
    const withRef = resolveScheduleSheet(
      [
        row({
          'Fee Structure ID': STRUCT, 'Institution (ref)': 'Test College',
          'Structure Name (ref)': 'BE CSE — General — 2026',
          'Fee Category': '1 Year Tuition Fee', 'Due After (Days)': 45,
        }),
      ],
      lookups,
    );
    const withoutRef = resolveScheduleSheet(
      [row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', 'Due After (Days)': 45 })],
      lookups,
    );
    expect(withRef.errors).toEqual([]);
    expect(withRef.byStructure.get(STRUCT)).toEqual(withoutRef.byStructure.get(STRUCT));
  });

  it('a row carrying ONLY ref columns counts as blank, not as a broken row', () => {
    // Otherwise a stray filtered-and-pasted context row would fail the whole
    // batch with "Fee Structure ID is required".
    const { errors, byStructure } = resolveScheduleSheet(
      [row({ 'Institution (ref)': 'Test College', 'Structure Name (ref)': 'Leftover' })],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.size).toBe(0);
  });
});

describe('Fee Schedules: an untouched export re-imports as a no-op', () => {
  it('an unconfigured fee exports as a bare row that means "no schedule"', () => {
    // This is the shape the export writes for each of the 946 unconfigured
    // items. It must resolve to single/no-lines/no-dates -- i.e. exactly what
    // that item already is -- or a straight round-trip would rewrite the world.
    const { errors, byStructure } = resolveScheduleSheet(
      [
        row({
          'Fee Structure ID': STRUCT, 'Institution (ref)': 'Test College',
          'Structure Name (ref)': 'BE CSE — General — 2026',
          'Fee Category': '1 Year Tuition Fee',
        }),
      ],
      lookups,
    );
    expect(errors).toEqual([]);
    const cfg = byStructure.get(STRUCT)![0];
    expect(cfg.schedule_mode).toBe('single');
    expect(cfg.lines).toEqual([]);
    expect(cfg.due_offset_days).toBeNull();
    expect(cfg.due_date).toBeNull();
    expect(cfg.promotes_to_status_code).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "Due Anchor" — the column that decides whether a due date is ever READ.
//
// The generation engine resolves an UNSPLIT item's date as
//   CASE WHEN anchor = 'fixed_date' AND item.due_date IS NOT NULL THEN due_date
//        ELSE anchor_base + offset END
// so before this column existed, a Due Date typed into this tab was stored and
// then silently ignored at billing time. Every test here guards that seam.
describe('Fee Schedules: Due Anchor', () => {
  const whole = (over: Record<string, unknown>) =>
    row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', ...over });

  const only = (rows: Record<string, unknown>[]) => {
    const { errors, byStructure } = resolveScheduleSheet(rows, lookups);
    return { errors, cfg: byStructure.get(STRUCT)?.[0] };
  };

  it('is a real column on the sheet', () => {
    expect(SCHEDULE_HEADERS).toContain('Due Anchor');
  });

  it('reads the label and the stored code, case- and spacing-insensitively', () => {
    expect(normalizeDueAnchor('Academic Year Start')).toBe('academic_year_start');
    expect(normalizeDueAnchor('academic_year_start')).toBe('academic_year_start');
    expect(normalizeDueAnchor('  GENERATION date ')).toBe('generation_date');
    expect(normalizeDueAnchor('')).toBeNull();
    expect(normalizeDueAnchor('whenever')).toBe('INVALID');
  });

  it('DERIVES fixed_date from a Due Date, so the date actually reaches the bill', () => {
    const { errors, cfg } = only([whole({ 'Due Date': '2027-01-31' })]);
    expect(errors).toEqual([]);
    expect(cfg!.due_anchor).toBe('fixed_date');
    expect(cfg!.due_date).toBe('2027-01-31');
  });

  it('still derives it when the exported default "Generation Date" sits beside the date', () => {
    // The export stamps this on all ~949 rows; it is the column default, not a
    // choice. Erroring here would break the commonest edit the tab exists for.
    const { errors, cfg } = only([
      whole({ 'Due Anchor': 'Generation Date', 'Due Date': '2027-01-31' }),
    ]);
    expect(errors).toEqual([]);
    expect(cfg!.due_anchor).toBe('fixed_date');
  });

  it('REJECTS a Due Date beside Academic Year Start — that one was chosen', () => {
    const { errors } = only([
      whole({ 'Due Anchor': 'Academic Year Start', 'Due Date': '2027-01-31' }),
    ]);
    expect(errors[0]).toMatch(/would never be used/);
  });

  it('rejects Fixed Date with nothing to point at', () => {
    const { errors } = only([whole({ 'Due Anchor': 'Fixed Date' })]);
    expect(errors[0]).toMatch(/no Due Date/);
  });

  it('carries academic_year_start through on a whole fee', () => {
    const { errors, cfg } = only([
      whole({ 'Due Anchor': 'Academic Year Start', 'Due After (Days)': 30 }),
    ]);
    expect(errors).toEqual([]);
    expect(cfg!.due_anchor).toBe('academic_year_start');
    expect(cfg!.due_offset_days).toBe(30);
  });

  it('OMITS the key when the column is blank, so the RPC keeps what is stored', () => {
    const { errors, cfg } = only([whole({ 'Due After (Days)': 45 })]);
    expect(errors).toEqual([]);
    expect(cfg).not.toHaveProperty('due_anchor');
  });

  it('carries the anchor onto a split, where it bases every instalment offset', () => {
    const anchored = (n: number, pct: number, days: number) =>
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
        'Instalment #': n, 'Share %': pct, 'Due After (Days)': days,
        'Due Anchor': 'Academic Year Start',
      });
    const { errors, byStructure } = resolveScheduleSheet(
      [anchored(1, 40, 0), anchored(2, 60, 120)],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.get(STRUCT)![0].due_anchor).toBe('academic_year_start');
  });

  it('rejects Fixed Date on a split — the instalments carry their own dates', () => {
    const bad = (n: number, pct: number, days: number) =>
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
        'Instalment #': n, 'Share %': pct, 'Due After (Days)': days,
        'Due Anchor': 'Fixed Date',
      });
    const { errors } = resolveScheduleSheet([bad(1, 50, 15), bad(2, 50, 90)], lookups);
    expect(errors[0]).toMatch(/means nothing/);
  });

  it('rejects two different anchors on one fee — an item stores only one', () => {
    const mixed = (n: number, pct: number, anchor: string) =>
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee',
        'Instalment #': n, 'Share %': pct, 'Due After (Days)': n * 30,
        'Due Anchor': anchor,
      });
    const { errors } = resolveScheduleSheet(
      [mixed(1, 50, 'Generation Date'), mixed(2, 50, 'Academic Year Start')],
      lookups,
    );
    expect(errors[0]).toMatch(/more than one Due Anchor/);
  });
});

// ---------------------------------------------------------------------------
describe('Fee Schedules: "Amount (ref)" is read-only decoration', () => {
  it('every ref header is a real column on the sheet', () => {
    // SCHEDULE_HEADERS is now written out literally rather than spread from
    // SCHEDULE_REF_HEADERS, so nothing but this test stops the two drifting.
    for (const h of SCHEDULE_REF_HEADERS) expect(SCHEDULE_HEADERS).toContain(h);
  });

  it('does not change how a row resolves', () => {
    const base = { 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', 'Due After (Days)': 45 };
    const withAmt = resolveScheduleSheet([row({ ...base, 'Amount (ref)': 125000 })], lookups);
    const without = resolveScheduleSheet([row(base)], lookups);
    expect(withAmt.errors).toEqual([]);
    expect(withAmt.byStructure.get(STRUCT)).toEqual(without.byStructure.get(STRUCT));
  });

  it('a row carrying only ref columns is still blank, not a broken row', () => {
    const { errors, byStructure } = resolveScheduleSheet(
      [row({ 'Institution (ref)': 'Test College', 'Amount (ref)': 999 })],
      lookups,
    );
    expect(errors).toEqual([]);
    expect(byStructure.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The full export shape, through a REAL workbook. The unit tests above hand
// resolveScheduleSheet a hand-built object; this one writes the rows the export
// route actually writes -- every column populated, "Due Anchor" stamped on each
// row, "Amount (ref)" carrying rupees -- with ExcelJS, reads them back with
// `xlsx`, and checks the result is a no-op. That is the property the whole tab
// rests on: 949 rows get downloaded, a handful get edited, and the rest must
// come back through unchanged.
describe('Fee Schedules: an export-shaped workbook round-trips to a no-op', () => {
  it('keeps unconfigured fees unconfigured and splits intact', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const XLSX = await import('xlsx');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEE_SCHEDULE_SHEET_NAME);
    ws.columns = SCHEDULE_HEADERS.map((h) => ({ header: h, key: h }));

    const ref = {
      'Fee Structure ID': STRUCT,
      'Institution (ref)': 'Test College',
      'Structure Name (ref)': 'BE CSE — General — 2026',
    };
    // An unconfigured fee, exactly as the export writes it.
    ws.addRow({
      ...ref, 'Fee Category': 'Uniform Fee',
      'Instalment #': '', 'Share %': '', 'Fixed Amount': '',
      'Amount (ref)': 12000, 'Due Anchor': 'Generation Date',
      'Due After (Days)': '', 'Due Date': '', 'Promotes To': '',
    });
    // A configured 30/70 split, exactly as the export writes it.
    ws.addRow({
      ...ref, 'Fee Category': '1 Year Tuition Fee',
      'Instalment #': 1, 'Share %': 30, 'Fixed Amount': '',
      'Amount (ref)': 30000, 'Due Anchor': 'Academic Year Start',
      'Due After (Days)': 15, 'Due Date': '', 'Promotes To': 'Reserved',
    });
    ws.addRow({
      ...ref, 'Fee Category': '1 Year Tuition Fee',
      'Instalment #': 2, 'Share %': 70, 'Fixed Amount': '',
      'Amount (ref)': 70000, 'Due Anchor': 'Academic Year Start',
      'Due After (Days)': 120, 'Due Date': '', 'Promotes To': '',
    });

    const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      read.Sheets[FEE_SCHEDULE_SHEET_NAME], { defval: '' },
    );
    // No stray "__EMPTY" keys: every header survived the two libraries.
    for (const key of Object.keys(rows[0])) expect(SCHEDULE_HEADERS).toContain(key);

    const { errors, byStructure } = resolveScheduleSheet(rows, lookups);
    expect(errors).toEqual([]);

    const configs = byStructure.get(STRUCT)!;
    const uniform = configs.find((c) => c.billing_category_id === UNIFORM)!;
    expect(uniform.schedule_mode).toBe('single');
    expect(uniform.lines).toEqual([]);
    expect(uniform.due_date).toBeNull();
    expect(uniform.due_offset_days).toBeNull();
    // The exported default resolves back to the default — not to fixed_date,
    // which would be a due date invented out of an empty cell.
    expect(uniform.due_anchor).toBe('generation_date');

    const tuition = configs.find((c) => c.billing_category_id === TUITION)!;
    expect(tuition.schedule_mode).toBe('split');
    expect(tuition.due_anchor).toBe('academic_year_start');
    expect(tuition.lines.map((l) => l.share_percent)).toEqual([30, 70]);
    expect(tuition.lines.map((l) => l.due_offset_days)).toEqual([15, 120]);
    expect(tuition.lines[0].promotes_to_status_code).toBe('reserved');
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The template attaches its dropdowns by column LETTER. Those letters are
// derived from the header arrays, but a derivation is only as good as the
// arrays: inserting a header shifts every column after it, and a validation
// pinned to the old letter lands on the wrong column WITHOUT error -- exactly
// how the Status dropdown once ended up on Communities. These assertions fail
// the moment a header moves, which is the only warning anyone gets.
describe('Fee Schedules: the dropdown columns the template writes', () => {
  it('resolves header positions to the letters the validations use', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');

    expect(headerColumn(SCHEDULE_HEADERS, 'Fee Category')).toBe('D');
    expect(headerColumn(SCHEDULE_HEADERS, 'Due Anchor')).toBe('I');
    expect(headerColumn(SCHEDULE_HEADERS, 'Promotes To')).toBe('L');
    expect(headerColumn(SCHEDULE_HEADERS, 'Not A Header')).toBeNull();
  });

  it('keeps the editable columns in the order the on-screen editor shows them', () => {
    // Share % · Amount · Due · On payment → status. A sheet that reads
    // left-to-right differently from the screen is a sheet people mis-fill.
    const order = ['Share %', 'Fixed Amount', 'Amount (ref)', 'Due Anchor',
                   'Due After (Days)', 'Due Date', 'Promotes To'];
    const positions = order.map((h) => SCHEDULE_HEADERS.indexOf(h as any));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions).not.toContain(-1);
  });
});
