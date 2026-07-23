/**
 * excel-compat — SheetJS-shaped write API over ExcelJS.
 *
 * Reads use SheetJS (xlsx). Writes go through this module, which wraps
 * ExcelJS to provide cell dropdowns (data validation), red-highlight
 * conditional formatting on invalid values, and 255-char inline-formula
 * overflow into a hidden _ValidCodes sheet.
 *
 * Caller responsibility: attach an `!dataValidation` array to a worksheet
 * to enable dropdowns + invalid-value highlighting on specific cell ranges.
 */

import ExcelJS from 'exceljs';

// ── SheetJS-shaped types ─────────────────────────────────────────────────────

export interface CompatColumn {
  wch?: number;
}

export interface CompatDataValidation {
  type: 'list';
  sqref: string;
  formula1: string;
  showDropDown?: boolean;
  showErrorMessage?: boolean;
  errorTitle?: string;
  error?: string;
}

export interface CompatWorksheet {
  _aoa: (string | number | null)[][];
  '!cols'?: CompatColumn[];
  '!freeze'?: { ySplit?: number; xSplit?: number };
  '!dataValidation'?: CompatDataValidation[];
  '!state'?: 'visible' | 'hidden' | 'veryHidden';
}

export interface CompatWorkbook {
  SheetNames: string[];
  Sheets: Record<string, CompatWorksheet>;
}

// ── Sheet builders ───────────────────────────────────────────────────────────

function aoa_to_sheet(aoa: (string | number | null)[][]): CompatWorksheet {
  return { _aoa: aoa.map((r) => [...r]) };
}

function json_to_sheet(
  rows: Record<string, string | number | null>[],
): CompatWorksheet {
  if (rows.length === 0) return { _aoa: [] };
  const headers = Object.keys(rows[0]);
  const aoa: (string | number | null)[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => row[h] ?? ''));
  }
  return { _aoa: aoa };
}

function book_new(): CompatWorkbook {
  return { SheetNames: [], Sheets: {} };
}

function book_append_sheet(
  wb: CompatWorkbook,
  ws: CompatWorksheet,
  name: string,
): void {
  if (wb.SheetNames.includes(name)) {
    throw new Error(`Sheet name "${name}" already exists`);
  }
  wb.SheetNames.push(name);
  wb.Sheets[name] = ws;
}

// ── ExcelJS write path ───────────────────────────────────────────────────────

const VALID_CODES_SHEET = '_ValidCodes';
const RED_FILL_ARGB = 'FFFFC7CE';
const RED_FONT_ARGB = 'FF9C0006';
const HEADER_FILL_ARGB = 'FFF3F4F6';
const INLINE_LIMIT = 255;

function columnLetter(idx1Based: number): string {
  let n = idx1Based;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(sqref: string): {
  startCol: number; startRow: number; endCol: number; endRow: number;
} {
  const m = sqref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) {
    const m2 = sqref.match(/^([A-Z]+)(\d+)$/);
    if (!m2) throw new Error(`Invalid range: ${sqref}`);
    const col = colToNum(m2[1]);
    const row = parseInt(m2[2], 10);
    return { startCol: col, startRow: row, endCol: col, endRow: row };
  }
  return {
    startCol: colToNum(m[1]),
    startRow: parseInt(m[2], 10),
    endCol: colToNum(m[3]),
    endRow: parseInt(m[4], 10),
  };
}

function parseInlineValues(formula1: string): string[] {
  const stripped = formula1.replace(/^"+|"+$/g, '');
  return stripped.split(',').map((v) => v.trim()).filter(Boolean);
}

async function buildExcelJsWorkbook(wb: CompatWorkbook): Promise<ExcelJS.Workbook> {
  const xwb = new ExcelJS.Workbook();
  xwb.creator = 'MyJKKN';
  xwb.created = new Date();

  const needsValidCodes = wb.SheetNames.some((n) => {
    const ws = wb.Sheets[n];
    return ws['!dataValidation'] && ws['!dataValidation'].length > 0;
  });

  let validCodesSheet: ExcelJS.Worksheet | null = null;
  let validCodesNextCol = 1;

  type ValidationMapping = {
    sheetName: string;
    validation: CompatDataValidation;
    codesCol: number;
    codesLastRow: number;
    values: string[];
  };
  const mappings: ValidationMapping[] = [];

  if (needsValidCodes) {
    validCodesSheet = xwb.addWorksheet(VALID_CODES_SHEET);
    validCodesSheet.state = 'hidden';
  }

  for (const sheetName of wb.SheetNames) {
    if (sheetName === VALID_CODES_SHEET) continue;
    const ws = wb.Sheets[sheetName];
    const xws = xwb.addWorksheet(sheetName);

    const ySplit = ws['!freeze']?.ySplit ?? 1;
    if (ySplit > 0) xws.views = [{ state: 'frozen', ySplit }];

    if (ws['!state'] === 'hidden' || ws['!state'] === 'veryHidden') {
      xws.state = ws['!state'];
    }

    ws._aoa.forEach((row, rowIdx) => {
      xws.addRow(row);
      if (rowIdx === 0 && ySplit > 0) {
        const headerRow = xws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: HEADER_FILL_ARGB },
        };
      }
    });

    if (ws['!cols']) {
      ws['!cols'].forEach((c, i) => {
        if (c?.wch) xws.getColumn(i + 1).width = c.wch;
      });
    }

    if (ws['!dataValidation'] && validCodesSheet) {
      for (const validation of ws['!dataValidation']) {
        const values = parseInlineValues(validation.formula1);
        const codesCol = validCodesNextCol++;
        const codesLastRow = values.length;
        values.forEach((v, i) => {
          validCodesSheet!.getCell(i + 1, codesCol).value = v;
        });
        mappings.push({ sheetName, validation, codesCol, codesLastRow, values });
      }
    }
  }

  for (const m of mappings) {
    const xws = xwb.getWorksheet(m.sheetName)!;
    const { startCol, startRow, endCol, endRow } = parseRange(m.validation.sqref);
    const codesColLetter = columnLetter(m.codesCol);
    const codesRangeRef = `'${VALID_CODES_SHEET}'!$${codesColLetter}$1:$${codesColLetter}$${m.codesLastRow}`;

    const inlineFormula = `"${m.values.join(',')}"`;
    const useInline = inlineFormula.length <= INLINE_LIMIT;
    const formulae = useInline ? [inlineFormula] : [codesRangeRef];

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = xws.getCell(row, col);
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae,
          showErrorMessage: m.validation.showErrorMessage ?? true,
          errorStyle: 'warning',
          errorTitle: m.validation.errorTitle ?? 'Invalid value',
          error: m.validation.error ?? 'Please select a valid value from the list.',
        };
      }
    }

    const targetColLetter = columnLetter(startCol);
    const cfRef = `${targetColLetter}${startRow}:${targetColLetter}${endRow}`;
    const firstCell = `${targetColLetter}${startRow}`;
    const cfFormula = `AND(${firstCell}<>"",COUNTIF(${codesRangeRef},${firstCell})=0)`;

    xws.addConditionalFormatting({
      ref: cfRef,
      rules: [{
        type: 'expression',
        formulae: [cfFormula],
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_FILL_ARGB } },
          font: { color: { argb: RED_FONT_ARGB } },
        },
        priority: 1,
      }],
    });
  }

  return xwb;
}

export async function writeBuffer(wb: CompatWorkbook): Promise<ArrayBuffer> {
  const xwb = await buildExcelJsWorkbook(wb);
  const buf = await xwb.xlsx.writeBuffer();
  if (buf instanceof ArrayBuffer) return buf;
  const nodeBuf = buf as unknown as Buffer;
  return nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  ) as ArrayBuffer;
}

async function writeFile(wb: CompatWorkbook, filename: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('writeFile requires a browser context; use writeBuffer on the server.');
  }
  const ab = await writeBuffer(wb);
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const utils = { aoa_to_sheet, json_to_sheet, book_new, book_append_sheet };

const XLSXCompat = { utils, writeFile, writeBuffer };
export default XLSXCompat;
