import { describe, it, expect } from 'vitest';
import {
  resolveUnifiedSheet,
  detectSheetLayout,
  UNIFIED_HEADERS,
  DATE_HEADERS,
  FIXED_HEADERS,
  FEE_STRUCTURE_SHEET_NAME,
  type BulkResolveLookups,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

// What these tests cover: the UNIFIED tab, where one row is one instalment of
// one fee of one structure. Two things can go wrong here that could not go
// wrong on the old two-tab layout, and both are silent:
//   1. Rows are grouped into structures by the WRONG key, so two structures
//      merge or one splits in half.
//   2. A structure column filled differently on two of its rows resolves to
//      whichever the code happened to read first.
// Everything below exists to make those loud.

const INST = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DEG = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const DEPT = 'cccccccc-1111-4111-8111-cccccccccccc';
const PROG = 'dddddddd-1111-4111-8111-dddddddddddd';
const YEAR = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const QUOTA = 'ffffffff-1111-4111-8111-ffffffffffff';
const QUOTA2 = 'ffffffff-2222-4222-8222-ffffffffffff';
const COMM = '99999999-1111-4111-8111-999999999999';
const TUITION = '22222222-2222-4222-8222-222222222222';
const UNIFORM = '33333333-3333-4333-8333-333333333333';
const STRUCT = '11111111-1111-4111-8111-111111111111';
const STRUCT2 = '44444444-4444-4444-8444-444444444444';

const lookups = {
  institutions: new Map([['test college', INST]]),
  degrees: new Map([[`${INST}::undergraduate`, DEG]]),
  departments: new Map([[`${INST}::${DEG}::cse`, DEPT]]),
  programmes: new Map([[`${DEPT}::be cse`, PROG]]),
  admissionYears: new Map([[`${INST}::2026 - 2027`, YEAR]]),
  quotas: new Map([['management quota', QUOTA], ['government quota', QUOTA2]]),
  accommodations: new Map<string, string>(),
  hostelAccommodationId: null,
  roomCategories: new Map<string, string>(),
  messCategories: new Map<string, string>(),
  communities: new Map([['bc', COMM]]),
  categoriesByName: new Map([
    ['1 year tuition fee', TUITION],
    ['uniform fee', UNIFORM],
  ]),
  amountHeaders: ['1 Year Tuition Fee', 'Uniform Fee'],
  learnerStatuses: new Map([
    ['reserved', 'reserved'],
    ['admitted', 'admitted'],
  ]),
} as unknown as BulkResolveLookups;

// Every structure must promote to BOTH Reserved and Admitted somewhere (see
// REQUIRED_PROMOTIONS), so each happy-path fixture below carries the two rungs
// on rows that are otherwise about something else. A structure with one row
// can only name one rung, which is why several fixtures gained a second fee.

/** The structure columns as the export repeats them down every row. */
const STRUCTURE = {
  Institution: 'Test College',
  Degree: 'Undergraduate',
  Department: 'CSE',
  Programme: 'BE CSE',
  'Admission Year': '2026 - 2027',
  Quota: 'Management Quota',
  Communities: 'BC',
  Name: 'BE CSE — General — 2026',
  Status: 'draft',
} as const;

/** Builds a row with every unified header present, as sheet_to_json produces. */
const row = (over: Partial<Record<(typeof UNIFIED_HEADERS)[number], unknown>>) => {
  const base: Record<string, unknown> = {};
  for (const h of UNIFIED_HEADERS) base[h] = '';
  return { ...base, ...STRUCTURE, ...over };
};

const one = (rows: Record<string, unknown>[]) => {
  const { resolutions, itemCount } = resolveUnifiedSheet(rows, lookups);
  return { res: resolutions[0], resolutions, itemCount };
};

// ---------------------------------------------------------------------------
describe('detectSheetLayout', () => {
  it('calls the long layout unified and the wide one legacy', () => {
    expect(detectSheetLayout(UNIFIED_HEADERS)).toBe('unified');
    // The wide sheet spends a column on each category instead of naming one.
    expect(detectSheetLayout([...FIXED_HEADERS, '1 Year Tuition Fee', 'Uniform Fee'])).toBe('legacy');
    expect(detectSheetLayout([])).toBe('legacy');
  });

  it('does not depend on the tab name, which both layouts share', () => {
    expect(FEE_STRUCTURE_SHEET_NAME).toBe('Fee Structures');
  });
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — grouping rows into structures', () => {
  it('folds a structure’s fee rows into ONE payload', () => {
    const { res, resolutions, itemCount } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(resolutions).toHaveLength(1);
    expect(res.errors).toEqual([]);
    expect(itemCount).toBe(2);
    expect(res.payload!.structure_id).toBe(STRUCT);
    expect(res.payload!.items).toHaveLength(2);
    expect(res.payload!.items.map((i) => i.amount).sort((a, b) => a - b)).toEqual([5000, 100000]);
    // Reported at the FIRST row of the structure, which is where the operator
    // will start looking.
    expect(res.rowNumber).toBe(2);
  });

  it('keeps two structures apart even when their fee rows interleave', () => {
    const { resolutions } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT2, Name: 'Other', 'Fee Category': 'Uniform Fee', Amount: 2000, 'Instalment #': 1, 'Share %': 50, 'Due After (Days)': 15, 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
      row({ 'Fee Structure ID': STRUCT2, Name: 'Other', 'Fee Category': 'Uniform Fee', Amount: 2000, 'Instalment #': 2, 'Share %': 50, 'Due After (Days)': 90, 'Promotes To': 'Admitted' }),
    ]);
    expect(resolutions).toHaveLength(2);
    const byId = new Map(resolutions.map((r) => [r.payload?.structure_id, r]));
    expect(byId.get(STRUCT)!.payload!.items).toHaveLength(2);
    expect(byId.get(STRUCT2)!.payload!.items).toHaveLength(1);
  });

  it('groups NEW rows by their full identity, not by name alone', () => {
    // Same name, different quota -> two different structures. Keying on the
    // name would silently merge them and lose one.
    const { resolutions } = one([
      row({ 'Fee Category': '1 Year Tuition Fee', Amount: 100000 }),
      row({ Quota: 'Government Quota', 'Fee Category': '1 Year Tuition Fee', Amount: 50000 }),
    ]);
    expect(resolutions).toHaveLength(2);
  });

  it('folds the instalment rows of one fee into a single item', () => {
    const inst = (n: number, pct: number, days: number) =>
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Instalment #': n, 'Share %': pct, 'Due After (Days)': days,
        'Promotes To': n === 1 ? 'Reserved' : 'Admitted',
      });
    const { res, itemCount } = one([inst(1, 30, 15), inst(2, 40, 90), inst(3, 30, 180)]);
    expect(res.errors).toEqual([]);
    // THREE rows, ONE fee: the amount is split, not summed.
    expect(itemCount).toBe(1);
    expect(res.payload!.items).toHaveLength(1);
    expect(res.payload!.items[0].amount).toBe(100000);
    const sched = res.payload!.item_schedules!;
    expect(sched).toHaveLength(1);
    expect(sched[0].schedule_mode).toBe('split');
    expect(sched[0].lines.map((l) => l.share_percent)).toEqual([30, 40, 30]);
  });

  it('always sets item_schedules, so the sheet is the whole truth', () => {
    // Absent would mean "preserve what is stored". This tab always lists every
    // fee of every structure on it, so there is nothing left to preserve —
    // and a blank instalment row must be able to REMOVE a split.
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.payload).toHaveProperty('item_schedules');
    expect(res.payload!.item_schedules![0].schedule_mode).toBe('single');
    expect(res.payload!.item_schedules![0].lines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — repeated values must agree', () => {
  it('rejects a structure column that differs between two of its rows', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000 }),
      row({ 'Fee Structure ID': STRUCT, Status: 'active', 'Fee Category': 'Uniform Fee', Amount: 5000 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/"Status" is a property of the fee structure/);
    expect(res.errors[0]).toMatch(/^Row 3:/);
  });

  it('lets a blank cell follow the rows that are filled', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, Notes: 'Approved by AC', 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT, Notes: '', 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    expect(res.payload!.notes).toBe('Approved by AC');
  });

  it('rejects one fee carrying two different Amounts', () => {
    // The instalments SPLIT the amount. Two amounts means the operator thinks
    // they add up, which would silently double-bill.
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 30000, 'Instalment #': 1, 'Share %': 30, 'Due After (Days)': 15 }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 70000, 'Instalment #': 2, 'Share %': 70, 'Due After (Days)': 90 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/has more than one Amount/);
    expect(res.errors.join(' ')).toMatch(/Instalments SPLIT one amount/);
  });

  it('rejects a fee row with no Amount rather than treating it as a removal', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000 }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee' }),
    ]);
    expect(res.errors.join(' ')).toMatch(/has no Amount/);
    expect(res.errors.join(' ')).toMatch(/DELETE the row/);
  });

  it('rejects a row that names no fee at all', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '', Amount: 100000 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/Fee Category is required/);
  });

  it('rejects an unknown fee category', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Moon Fee', Amount: 100 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/"Moon Fee" is not an active billing category/);
  });
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — the shared rules still apply', () => {
  it('runs the same structure validation as the wide layout', () => {
    const { res } = one([
      row({ Institution: 'Nowhere College', 'Fee Category': '1 Year Tuition Fee', Amount: 100 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/Institution "Nowhere College" not found/);
  });

  it('derives the fixed_date anchor from a Due Date, exactly as sheet 2 did', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Due Date': '2027-01-31', 'Promotes To': 'Reserved' }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    expect(res.payload!.item_schedules![0].due_anchor).toBe('fixed_date');
    expect(res.payload!.item_schedules![0].due_date).toBe('2027-01-31');
  });

  it('still refuses percentages that do not total 100, naming the row', () => {
    const inst = (n: number, pct: number, days: number) =>
      row({
        'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Instalment #': n, 'Share %': pct, 'Due After (Days)': days,
      });
    const { res } = one([inst(1, 30, 15), inst(2, 30, 90)]);
    expect(res.errors.join(' ')).toMatch(/total 60\.00%, not 100%/);
    expect(res.errors[0]).toMatch(/^Row \d+:/);
  });

  it('still refuses a login-granting status', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Active' }),
    ]);
    expect(res.errors.join(' ')).toMatch(/Login-granting statuses/);
  });

  it('ignores entirely blank rows', () => {
    const blank: Record<string, unknown> = {};
    for (const h of UNIFIED_HEADERS) blank[h] = '';
    const { resolutions } = one([
      blank,
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Reserved' }),
      blank,
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The seam no unit test can see: the export writes with ExcelJS, the import
// reads with `xlsx`. Two libraries agreeing on one header row by convention.
describe('the unified tab survives a real workbook write/read', () => {
  it('round-trips an export-shaped sheet to a no-op', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const XLSX = await import('xlsx');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEE_STRUCTURE_SHEET_NAME);
    ws.columns = UNIFIED_HEADERS.map((h) => ({ header: h, key: h }));

    // Exactly what the export writes: identity repeated, anchor on every row.
    const base = { ...STRUCTURE, 'Fee Structure ID': STRUCT, 'Default Due (Days)': 30 };
    ws.addRow({ ...base, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Instalment #': 1, 'Share %': 30, 'Amount (ref)': 30000, 'Due Anchor': 'Academic Year Start', 'Due After (Days)': 15, 'Promotes To': 'Reserved' });
    ws.addRow({ ...base, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Instalment #': 2, 'Share %': 70, 'Amount (ref)': 70000, 'Due Anchor': 'Academic Year Start', 'Due After (Days)': 120 });
    ws.addRow({ ...base, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Amount (ref)': 5000, 'Due Anchor': 'Generation Date', 'Promotes To': 'Admitted' });

    const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'buffer', cellDates: true });
    expect(read.SheetNames).toContain(FEE_STRUCTURE_SHEET_NAME);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      read.Sheets[FEE_STRUCTURE_SHEET_NAME], { defval: '' },
    );
    // No stray "__EMPTY" keys: every header survived both libraries.
    for (const key of Object.keys(rows[0])) expect(UNIFIED_HEADERS).toContain(key);
    expect(detectSheetLayout(Object.keys(rows[0]))).toBe('unified');

    const { resolutions, itemCount } = resolveUnifiedSheet(rows, lookups);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].errors).toEqual([]);
    expect(itemCount).toBe(2);

    const payload = resolutions[0].payload!;
    expect(payload.structure_id).toBe(STRUCT);
    expect(payload.default_due_offset_days).toBe(30);

    const scheds = payload.item_schedules!;
    const tuition = scheds.find((s) => s.billing_category_id === TUITION)!;
    expect(tuition.schedule_mode).toBe('split');
    expect(tuition.due_anchor).toBe('academic_year_start');
    expect(tuition.lines.map((l) => l.share_percent)).toEqual([30, 70]);
    expect(tuition.lines[0].promotes_to_status_code).toBe('reserved');

    const uniform = scheds.find((s) => s.billing_category_id === UNIFORM)!;
    expect(uniform.schedule_mode).toBe('single');
    expect(uniform.lines).toEqual([]);
    // The exported default resolves back to the default, not to fixed_date —
    // a due date must never be invented out of an empty cell.
    expect(uniform.due_anchor).toBe('generation_date');
    expect(uniform.due_date).toBeNull();
  }, 60_000);
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — a structure with no fees on it', () => {
  it('reports the one accurate error, not a missing-category error too', () => {
    // The export writes a bare row for a structure that has no fee items, so
    // the structure stays visible and fees can be typed onto it.
    const { res } = one([row({ 'Fee Structure ID': STRUCT })]);
    expect(res.errors).toEqual(['At least one fee amount is required']);
  });

  it('but DOES flag a fee row whose category was blanked out', () => {
    const { res } = one([
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 100000 }),
      row({ 'Fee Structure ID': STRUCT, 'Fee Category': '', Amount: 5000 }),
    ]);
    expect(res.errors.join(' ')).toMatch(/Fee Category is required/);
  });
});

// ---------------------------------------------------------------------------
// The template ships worked example rows. If those rows would be REJECTED by
// the importer, the template is teaching a shape that does not work — the most
// expensive kind of documentation bug, because the operator trusts it. These
// mirror the sample rows in template/route.ts exactly.
describe('the template’s sample rows are shapes the importer accepts', () => {
  const A = { 'Fee Structure ID': STRUCT };
  const B = { 'Fee Structure ID': STRUCT2, Quota: 'Government Quota', Name: 'BE CSE — Government — 2026' };

  it('accepts a split that MIXES day offsets with a hard date', () => {
    const { res } = one([
      row({ ...A, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Instalment #': 1, 'Share %': 30, 'Due Anchor': 'Generation Date', 'Due After (Days)': 15, 'Promotes To': 'Reserved' }),
      row({ ...A, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Instalment #': 2, 'Share %': 40, 'Due Anchor': 'Generation Date', 'Due After (Days)': 90, 'Promotes To': 'Admitted' }),
      row({ ...A, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Instalment #': 3, 'Share %': 30, 'Due Anchor': 'Generation Date', 'Due Date': '2027-06-30' }),
      row({ ...A, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Due Anchor': 'Fixed Date', 'Due Date': '2027-01-31' }),
    ]);
    expect(res.errors).toEqual([]);

    const tuition = res.payload!.item_schedules!.find((s) => s.billing_category_id === TUITION)!;
    expect(tuition.lines.map((l) => l.due_offset_days)).toEqual([15, 90, null]);
    expect(tuition.lines.map((l) => l.due_date)).toEqual([null, null, '2027-06-30']);

    // The whole-fee row keeps the anchor that makes its date count.
    const uniform = res.payload!.item_schedules!.find((s) => s.billing_category_id === UNIFORM)!;
    expect(uniform.schedule_mode).toBe('single');
    expect(uniform.due_anchor).toBe('fixed_date');
    expect(uniform.due_date).toBe('2027-01-31');
  });

  it('accepts a split dated ENTIRELY by calendar date', () => {
    // Every instalment carries its own date and no offset anywhere. The anchor
    // still reads "Generation Date" because on a split it only governs rows
    // that use an offset — and there are none. This must NOT be rejected.
    const { res } = one([
      row({ ...B, 'Fee Category': '1 Year Tuition Fee', Amount: 90000, 'Instalment #': 1, 'Share %': 50, 'Due Anchor': 'Generation Date', 'Due Date': '2026-08-31', 'Promotes To': 'Reserved' }),
      row({ ...B, 'Fee Category': '1 Year Tuition Fee', Amount: 90000, 'Instalment #': 2, 'Share %': 50, 'Due Anchor': 'Generation Date', 'Due Date': '2027-01-31', 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    const sched = res.payload!.item_schedules![0];
    expect(sched.schedule_mode).toBe('split');
    expect(sched.due_anchor).toBe('generation_date');
    expect(sched.lines.map((l) => l.due_date)).toEqual(['2026-08-31', '2027-01-31']);
    expect(sched.lines.map((l) => l.due_offset_days)).toEqual([null, null]);
  });
});

// ---------------------------------------------------------------------------
describe('Due Date survives the formats Excel turns it into', () => {
  it('reads an ISO string, a dd/mm/yyyy string and a real date cell alike', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const XLSX = await import('xlsx');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEE_STRUCTURE_SHEET_NAME);
    // Columns carry the yyyy-mm-dd number format both writers now stamp on.
    ws.columns = UNIFIED_HEADERS.map((h) => ({
      header: h,
      key: h,
      ...(DATE_HEADERS.has(h) ? { style: { numFmt: 'yyyy-mm-dd' } } : {}),
    }));

    const base = { ...STRUCTURE, 'Fee Structure ID': STRUCT };
    // As the export writes it.
    ws.addRow({ ...base, 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Due Date': '2027-01-31', 'Promotes To': 'Reserved' });
    // As an operator types it on an Indian-locale machine.
    ws.addRow({ ...base, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Due Date': '31/01/2027', 'Promotes To': 'Admitted' });

    const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      read.Sheets[FEE_STRUCTURE_SHEET_NAME], { defval: '' },
    );

    const { resolutions } = resolveUnifiedSheet(rows, lookups);
    expect(resolutions[0].errors).toEqual([]);
    const scheds = resolutions[0].payload!.item_schedules!;
    // Both spellings land on the SAME day — no locale drift, no off-by-one.
    for (const s of scheds) {
      expect(s.due_date).toBe('2027-01-31');
      expect(s.due_anchor).toBe('fixed_date');
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// THE INSTALMENTS MUST ADD UP TO THE FEE. The engine sizes lines 1..n-1 as typed
// and hands the LAST line whatever is left — so a sheet whose parts did not
// total the Amount was never rejected, it was quietly corrected at billing
// time: 70,000 + 80,000 on a ₹1,40,000 fee billed 70,000 + 70,000, and
// 1,50,000 + 20,000 left nothing for the second instalment, so the fee was
// billed in one go with no split at all. "Amount (ref)" was ignored outright,
// so a wrong rupee figure could sit beside a share it contradicted.
describe('resolveUnifiedSheet — the instalments must add up to the fee Amount', () => {
  const FEE = { 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 140000 };
  // Instalment 1 promotes to Reserved and the rest to Admitted, so every split
  // here satisfies the both-rungs rule and only the rupees are under test.
  const rung = (n: number) => (n === 1 ? 'Reserved' : 'Admitted');
  const fixed = (n: number, amt: number, over: Record<string, unknown> = {}) =>
    row({ ...FEE, 'Instalment #': n, 'Fixed Amount': amt, 'Due After (Days)': n * 30, 'Promotes To': rung(n), ...over });
  const pct = (n: number, share: number, over: Record<string, unknown> = {}) =>
    row({ ...FEE, 'Instalment #': n, 'Share %': share, 'Due After (Days)': n * 30, 'Promotes To': rung(n), ...over });

  it('accepts fixed amounts that total the Amount', () => {
    const { res } = one([fixed(1, 70000), fixed(2, 70000)]);
    expect(res.errors).toEqual([]);
    expect(res.payload!.item_schedules![0].lines.map((l) => l.fixed_amount)).toEqual([70000, 70000]);
  });

  it('rejects fixed amounts that total MORE than the Amount, naming the last instalment', () => {
    const { res } = one([fixed(1, 70000), fixed(2, 80000)]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/^Row 3:/);
    expect(res.errors[0]).toMatch(/add up to ₹1,50,000, not the fee's Amount of ₹1,40,000/);
    expect(res.errors[0]).toMatch(/₹10,000 too much/);
  });

  it('rejects fixed amounts that fall SHORT of the Amount', () => {
    const { res } = one([fixed(1, 60000), fixed(2, 60000)]);
    expect(res.errors.join(' ')).toMatch(/add up to ₹1,20,000/);
    expect(res.errors.join(' ')).toMatch(/₹20,000 short/);
  });

  it('rejects a first instalment that already exceeds the Amount — the engine would not split at all', () => {
    const { res } = one([fixed(1, 150000), fixed(2, 20000)]);
    expect(res.errors.join(' ')).toMatch(/add up to ₹1,70,000/);
  });

  it('checks a MIXED split (percent + fixed) against the Amount too', () => {
    // 50% of 1,40,000 is 70,000; a fixed 80,000 beside it is 10,000 too much.
    expect(one([pct(1, 50), fixed(2, 80000)]).res.errors.join(' ')).toMatch(/₹10,000 too much/);
    // 1,00,000 fixed + 50% is 1,70,000 — the 50% is NOT quietly reduced to 40,000.
    expect(one([fixed(1, 100000), pct(2, 50)]).res.errors.join(' ')).toMatch(/₹30,000 too much/);
    // The pair that does add up passes.
    expect(one([pct(1, 50), fixed(2, 70000)]).res.errors).toEqual([]);
  });

  it('does not raise a rounding false alarm on a percent-only split', () => {
    // 33.33 / 33.33 / 33.34 of 1,00,000 = 33,330 + 33,330 + 33,340 (the last
    // absorbs rounding). Pinned by the 100% rule; no rupee rule is needed.
    const rows = [1, 2, 3].map((n) =>
      row({ ...FEE, Amount: 100000, 'Instalment #': n, 'Share %': n === 3 ? 33.34 : 33.33, 'Due After (Days)': n * 30, 'Promotes To': rung(n) }),
    );
    expect(one(rows).res.errors).toEqual([]);
  });

  it('rejects a Share % outside (0, 100] even when the percentages total 100', () => {
    // 120 / -20 totals 100 and would bill instalment 1 for MORE than the fee;
    // the engine then refuses to split and bills it in one go, silently.
    const { res } = one([pct(1, 120), pct(2, -20)]);
    expect(res.errors.join(' ')).toMatch(/Share % must be more than 0 and at most 100/);
  });

  it('rejects a Fixed Amount of 0', () => {
    const { res } = one([fixed(1, 0), fixed(2, 140000)]);
    expect(res.errors.join(' ')).toMatch(/Fixed Amount must be more than 0/);
  });

  describe('"Amount (ref)" is a cross-check, and it is now checked', () => {
    it('accepts a ref that matches what the instalment bills, and a blank one', () => {
      expect(one([pct(1, 50, { 'Amount (ref)': 70000 }), pct(2, 50, { 'Amount (ref)': 70000 })]).res.errors).toEqual([]);
      expect(one([pct(1, 50, { 'Amount (ref)': 70000 }), pct(2, 50)]).res.errors).toEqual([]);
    });

    it('rejects a ref that contradicts the share, naming the row', () => {
      const { res } = one([pct(1, 50, { 'Amount (ref)': 60000 }), pct(2, 50, { 'Amount (ref)': 70000 })]);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toMatch(/^Row 2:/);
      expect(res.errors[0]).toMatch(/Amount \(ref\) says ₹60,000, but this instalment bills ₹70,000 \(50% of ₹1,40,000\)/);
    });

    it('catches a stale ref after the Amount was raised', () => {
      // Exported at 1,40,000 (70,000 + 70,000), then Amount edited to 1,50,000
      // on both rows and the ref column left as it was.
      const { res } = one([
        pct(1, 50, { Amount: 150000, 'Amount (ref)': 70000 }),
        pct(2, 50, { Amount: 150000, 'Amount (ref)': 70000 }),
      ]);
      expect(res.errors).toHaveLength(2);
      expect(res.errors[0]).toMatch(/bills ₹75,000/);
    });

    it('checks the whole-fee row too', () => {
      // A whole-fee row names one rung; the other rides on a second fee.
      const ADMIT = row({ ...FEE, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' });
      const bad = one([row({ ...FEE, 'Amount (ref)': 130000, 'Promotes To': 'Reserved' }), ADMIT]);
      expect(bad.res.errors.join(' ')).toMatch(/Amount \(ref\) says ₹1,30,000, but the fee's Amount is ₹1,40,000/);
      const ok = one([row({ ...FEE, 'Amount (ref)': 140000, 'Promotes To': 'Reserved' }), ADMIT]);
      expect(ok.res.errors).toEqual([]);
    });

    it('rejects a non-numeric ref rather than silently skipping it', () => {
      const { res } = one([pct(1, 50, { 'Amount (ref)': 'seventy' }), pct(2, 50)]);
      expect(res.errors.join(' ')).toMatch(/Amount \(ref\) is not a number/);
    });
  });
});

// ---------------------------------------------------------------------------
// EVERY STRUCTURE MUST PROMOTE TO BOTH RUNGS. "Promotes To" is how a settled
// fee moves a learner account → reserved → admitted; a structure that names
// only one rung (or neither) strands learners on it however much they pay.
describe('resolveUnifiedSheet — every structure must promote to both Reserved and Admitted', () => {
  const FEE = { 'Fee Structure ID': STRUCT, 'Fee Category': '1 Year Tuition Fee', Amount: 140000 };
  const inst = (n: number, promotes: string, over: Record<string, unknown> = {}) =>
    row({ ...FEE, 'Instalment #': n, 'Share %': 50, 'Due After (Days)': n * 30, 'Promotes To': promotes, ...over });

  it('accepts both rungs on two instalments of one fee', () => {
    expect(one([inst(1, 'Reserved'), inst(2, 'Admitted')]).res.errors).toEqual([]);
  });

  it('accepts the rungs on two different fees, on whole-fee rows', () => {
    const { res } = one([
      row({ ...FEE, 'Promotes To': 'Reserved' }),
      row({ ...FEE, 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
  });

  it('rejects a structure that names neither, at its first row', () => {
    const { res } = one([inst(1, ''), inst(2, '')]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/^Row 2:/);
    expect(res.errors[0]).toMatch(/must promote a learner to both Reserved and Admitted/);
    expect(res.errors[0]).toMatch(/Missing: Reserved and Admitted\.$/);
  });

  it('rejects a structure that names only one rung, and says which is missing', () => {
    expect(one([inst(1, 'Reserved'), inst(2, 'Reserved')]).res.errors.join(' ')).toMatch(/Missing: Admitted\./);
    expect(one([inst(1, 'Admitted'), inst(2, '')]).res.errors.join(' ')).toMatch(/Missing: Reserved\./);
  });

  it('holds a brand-new structure (no ID) to the same rule', () => {
    const { res } = one([row({ 'Fee Category': '1 Year Tuition Fee', Amount: 100000 })]);
    expect(res.errors.join(' ')).toMatch(/must promote a learner to both/);
  });

  it('exempts an archived structure — it bills nobody', () => {
    expect(one([row({ ...FEE, Status: 'archived' })]).res.errors).toEqual([]);
  });

  it('reports row-level problems first, not the missing rungs on top of them', () => {
    const { res } = one([inst(1, '', { 'Share %': 30 }), inst(2, '', { 'Share %': 30 })]);
    expect(res.errors.join(' ')).toMatch(/not 100%/);
    expect(res.errors.join(' ')).not.toMatch(/must promote/);
  });
});
