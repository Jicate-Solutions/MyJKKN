import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  FEE_STRUCTURE_SHEET_NAME,
  UNIFIED_HEADERS,
  SCHEDULE_HEADERS,
  headerRowScore,
  normalizeHeaderText,
  pickDataSheet,
  findSheetName,
  resolveUnifiedSheet,
  type BulkResolveLookups,
  type SheetCandidate,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

// What these tests cover: WHICH TAB the importer reads, and WHICH ROW it treats
// as the header.
//
// The importer used to do `wb.Sheets['Fee Structures']` and reject anything
// else with `Sheet "Fee Structures" not found` — a dead end for every ordinary
// thing an operator does to a workbook. These tests pin the replacement:
// recognition by COLUMNS, with the tab name as a tie-breaker only.
//
// The header-ROW index is the part most likely to rot silently: it is fed
// straight back to sheet_to_json as `range`, so an off-by-one there does not
// throw — it reads the sheet one row out and reports every row number wrong.

/** The scan the route performs: first N rows of every tab, blank rows KEPT. */
function scan(wb: XLSX.WorkBook, depth = 12): SheetCandidate[] {
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: true, range: 0 })
      .slice(0, depth),
  }));
}

/**
 * A minimal but realistic structure: ONE fee, split 50/50. Two rows rather
 * than one because every structure must promote to both Reserved and
 * Admitted, and a single row can only name one of them.
 */
const dataRows = (name: string) => {
  const base = {
    'Fee Structure ID': '',
    Institution: 'Test College',
    Degree: 'Undergraduate',
    Department: 'CSE',
    Programme: 'BE CSE',
    'Admission Year': '2026 - 2027',
    Quota: 'Management Quota',
    Communities: 'BC',
    Name: name,
    Status: 'draft',
    'Fee Category': '1 Year Tuition Fee',
    Amount: 100000,
  };
  return [
    { ...base, 'Instalment #': 1, 'Share %': 50, 'Due After (Days)': 15, 'Promotes To': 'Reserved' },
    { ...base, 'Instalment #': 2, 'Share %': 50, 'Due After (Days)': 90, 'Promotes To': 'Admitted' },
  ];
};

/** Builds a workbook with one data tab under the given name, plus decoy tabs. */
async function buildWorkbook(opts: {
  dataSheetName: string;
  /** Rows of junk written ABOVE the header row. */
  preamble?: string[][];
  extraTabs?: Array<{ name: string; headers: readonly string[] }>;
}): Promise<XLSX.WorkBook> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(opts.dataSheetName);
  for (const line of opts.preamble ?? []) sheet.addRow(line);
  sheet.addRow([...UNIFIED_HEADERS]);
  for (const name of ['Structure A', 'Structure B']) {
    for (const row of dataRows(name)) {
      sheet.addRow(UNIFIED_HEADERS.map((h) => (row as Record<string, unknown>)[h] ?? ''));
    }
  }
  for (const tab of opts.extraTabs ?? []) {
    const ws = wb.addWorksheet(tab.name);
    ws.addRow([...tab.headers]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

describe('normalizeHeaderText', () => {
  it('folds the non-breaking space Excel leaves behind on a pasted header', () => {
    expect(normalizeHeaderText('Fee Structure ID')).toBe('fee structure id');
    expect(normalizeHeaderText('  Fee   Structure ID  ')).toBe('fee structure id');
  });
});

describe('headerRowScore', () => {
  it('scores the real header row far above a data row', () => {
    expect(headerRowScore([...UNIFIED_HEADERS])).toBeGreaterThanOrEqual(12);
    expect(headerRowScore(['', 'Test College', 'Undergraduate', 'CSE'])).toBeLessThan(5);
  });

  it('keeps the legacy Fee Schedules tab below the recognition threshold', () => {
    // It shares "Fee Structure ID" and "Fee Category" and nothing else. If this
    // ever clears 5 it would be picked as the DATA sheet on a legacy workbook.
    expect(headerRowScore([...SCHEDULE_HEADERS])).toBeLessThan(5);
  });
});

describe('pickDataSheet', () => {
  it('finds the data tab when Excel has renamed it "Fee Structures (2)"', async () => {
    const wb = await buildWorkbook({ dataSheetName: 'Fee Structures (2)' });
    const pick = pickDataSheet(scan(wb));
    expect(pick).not.toBeNull();
    expect(pick!.name).toBe('Fee Structures (2)');
    expect(pick!.nameMatched).toBe(false);
    expect(pick!.layout).toBe('unified');
    expect(pick!.headerRowIndex).toBe(0);
  });

  it('finds the data tab after a CSV round-trip left it called "Sheet1"', async () => {
    const wb = await buildWorkbook({ dataSheetName: 'Sheet1' });
    expect(pickDataSheet(scan(wb))!.name).toBe('Sheet1');
  });

  it('prefers the correctly-named tab when two tabs both carry the columns', async () => {
    const wb = await buildWorkbook({
      dataSheetName: 'Backup of Fee Structures',
      extraTabs: [{ name: FEE_STRUCTURE_SHEET_NAME, headers: UNIFIED_HEADERS }],
    });
    const pick = pickDataSheet(scan(wb))!;
    expect(pick.name).toBe(FEE_STRUCTURE_SHEET_NAME);
    expect(pick.nameMatched).toBe(true);
  });

  it('is not fooled by the Lists or Instructions tabs', async () => {
    const wb = await buildWorkbook({
      dataSheetName: 'Data',
      extraTabs: [
        { name: 'Lists', headers: ['Institution', 'Quota', 'Gender', 'Status', 'Community'] },
        { name: 'Instructions', headers: ['INSTRUCTIONS — BULK FEE STRUCTURE IMPORT'] },
      ],
    });
    expect(pickDataSheet(scan(wb))!.name).toBe('Data');
  });

  it('returns null for a workbook that carries none of the columns', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Roll No', 'Learner Name', 'Amount Paid']);
    ws.addRow(['1', 'A', 100]);
    const parsed = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'buffer' });
    expect(pickDataSheet(scan(parsed))).toBeNull();
  });

  // The header-row index feeds sheet_to_json's `range`. These two assert the
  // whole chain, not just the index: a title line above the headers must not
  // shift a single value or a single reported row number.
  it('finds the header row under a title line, and reads the rows from there', async () => {
    const wb = await buildWorkbook({
      dataSheetName: FEE_STRUCTURE_SHEET_NAME,
      preamble: [['JKKN COLLEGE — FEE STRUCTURES 2026-27'], []],
    });
    const pick = pickDataSheet(scan(wb))!;
    expect(pick.headerRowIndex).toBe(2); // 0-based: title, blank, headers

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[pick.name],
      { defval: '', range: pick.headerRowIndex },
    );
    expect(rows).toHaveLength(4); // two structures, two instalment rows each
    expect(rows[0]['Name']).toBe('Structure A');
    expect(rows[0]['Institution']).toBe('Test College');

    // Spreadsheet row of rows[0]: headers on sheet row 3, so data starts at 4.
    expect(pick.headerRowIndex + 2).toBe(4);
  });

  it('reads a plain template with no preamble from row 2', async () => {
    const wb = await buildWorkbook({ dataSheetName: FEE_STRUCTURE_SHEET_NAME });
    const pick = pickDataSheet(scan(wb))!;
    expect(pick.headerRowIndex).toBe(0);
    expect(pick.headerRowIndex + 2).toBe(2);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[pick.name],
      { defval: '', range: pick.headerRowIndex },
    );
    expect(rows[0]['Name']).toBe('Structure A');
  });
});

describe('findSheetName', () => {
  it('matches the schedules tab regardless of case and stray spaces', () => {
    expect(findSheetName(['Fee Structures', ' fee  schedules '], 'Fee Schedules')).toBe(
      ' fee  schedules ',
    );
    expect(findSheetName(['Fee Structures'], 'Fee Schedules')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The whole read path, end to end: pick the tab, read from the header row,
// resolve. What this guards is the ROW NUMBER — pickDataSheet's index feeds
// sheet_to_json's `range` AND resolveUnifiedSheet's firstRowNumber, and if the
// two ever disagree the preview still renders, it just sends the operator to
// the wrong cell.
// ---------------------------------------------------------------------------
const INST = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DEG = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const DEPT = 'cccccccc-1111-4111-8111-cccccccccccc';
const PROG = 'dddddddd-1111-4111-8111-dddddddddddd';
const YEAR = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const QUOTA = 'ffffffff-1111-4111-8111-ffffffffffff';
const COMM = '99999999-1111-4111-8111-999999999999';
const TUITION = '22222222-2222-4222-8222-222222222222';

const testLookups = {
  institutions: new Map([['test college', INST]]),
  degrees: new Map([[`${INST}::undergraduate`, DEG]]),
  departments: new Map([[`${INST}::${DEG}::cse`, DEPT]]),
  programmes: new Map([[`${DEPT}::be cse`, PROG]]),
  admissionYears: new Map([[`${INST}::2026 - 2027`, YEAR]]),
  quotas: new Map([['management quota', QUOTA]]),
  accommodations: new Map<string, string>(),
  hostelAccommodationId: null,
  roomCategories: new Map<string, string>(),
  messCategories: new Map<string, string>(),
  communities: new Map([['bc', COMM]]),
  categoriesByName: new Map([['1 year tuition fee', TUITION]]),
  amountHeaders: ['1 Year Tuition Fee'],
  learnerStatuses: new Map([
    ['reserved', 'reserved'],
    ['admitted', 'admitted'],
  ]),
} as unknown as BulkResolveLookups;

describe('read path: tab → header row → resolved rows', () => {
  it('reports real spreadsheet rows when a title line sits above the headers', async () => {
    const wb = await buildWorkbook({
      dataSheetName: 'Fee Structures (2)',
      preamble: [['JKKN COLLEGE — FEE STRUCTURES 2026-27'], []],
    });
    const pick = pickDataSheet(scan(wb))!;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[pick.name], {
      defval: '',
      range: pick.headerRowIndex,
    });

    const { resolutions } = resolveUnifiedSheet(rawRows, testLookups, pick.headerRowIndex + 2);

    expect(resolutions).toHaveLength(2);
    // Headers on sheet row 3 → structure A starts on row 4 and, two rows
    // later, structure B on row 6.
    expect(resolutions.map((r) => r.rowNumber)).toEqual([4, 6]);
    expect(resolutions.every((r) => r.errors.length === 0)).toBe(true);
    expect(resolutions[0].payload!.institution_id).toBe(INST);
    // The operator's own text survives for the change preview to name.
    expect(resolutions[0].source?.Institution).toBe('Test College');
  });

  it('still reports real rows (2 and 4) for an ordinary template', async () => {
    const wb = await buildWorkbook({ dataSheetName: FEE_STRUCTURE_SHEET_NAME });
    const pick = pickDataSheet(scan(wb))!;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[pick.name], {
      defval: '',
      range: pick.headerRowIndex,
    });
    const { resolutions } = resolveUnifiedSheet(rawRows, testLookups, pick.headerRowIndex + 2);
    expect(resolutions.map((r) => r.rowNumber)).toEqual([2, 4]); // two rows per structure
  });
});
