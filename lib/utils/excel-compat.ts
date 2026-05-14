/**
 * excel-compat — SheetJS-shaped write API over ExcelJS.
 *
<<<<<<< Updated upstream
 * Reads use SheetJS (xlsx). Writes go through this module, which wraps
 * ExcelJS to provide cell dropdowns (data validation), red-highlight
 * conditional formatting on invalid values, and 255-char inline-formula
 * overflow into a hidden _ValidCodes sheet.
 *
 * Caller responsibility: attach an `!dataValidation` array to a worksheet
 * to enable dropdowns + invalid-value highlighting on specific cell ranges.
=======
 * Why this layer exists:
 *
 *   - We read XLSX with SheetJS (xlsx) — it is fast and well-typed.
 *   - We write XLSX with ExcelJS — only ExcelJS supports the rich features
 *     we need: cell-level data validation (dropdowns), conditional
 *     formatting (red highlight for invalid values), frozen panes, hidden
 *     sheets, named ranges.
 *
 * This module exposes a SheetJS-like API (`utils.json_to_sheet`,
 * `utils.book_new`, `utils.book_append_sheet`, `writeFile`) so callers can
 * write once and get dropdown + red-highlight behaviour automatically.
 *
 * Caller responsibility: attach an `!dataValidation` array to a worksheet to
 * enable dropdowns + invalid-value highlighting on specific cell ranges.
 * Each entry follows the SheetJS shape:
 *
 *   {
 *     type: 'list',
 *     sqref: 'A2:A1000',                   // cell range
 *     formula1: '"Value1,Value2,Value3"',  // quoted comma list
 *     showDropDown: true,
 *     showErrorMessage: true,
 *     errorTitle: '...',
 *     error: '...',
 *   }
 *
 * Behind the scenes this module:
 *   1. Creates a hidden `_ValidCodes` sheet and writes each list's values
 *      into its own column (A, B, C…).
 *   2. Attaches an ExcelJS `dataValidation` to every cell in `sqref`:
 *        - inline list if total length ≤ 255 chars
 *        - sheet reference (`'_ValidCodes'!$A$1:$A$N`) otherwise
 *   3. Adds conditional formatting: any non-empty cell whose value is not
 *      in the validation column is painted red (#FFC7CE bg, #9C0006 font).
>>>>>>> Stashed changes
 */

import ExcelJS from 'exceljs';

// ── SheetJS-shaped types ─────────────────────────────────────────────────────

export interface CompatColumn {
<<<<<<< Updated upstream
=======
  /** Excel column width in characters */
>>>>>>> Stashed changes
  wch?: number;
}

export interface CompatDataValidation {
  type: 'list';
<<<<<<< Updated upstream
  sqref: string;
=======
  /** Excel range like "A2:A1000" */
  sqref: string;
  /** Quoted comma-separated list: `"Value1,Value2"` */
>>>>>>> Stashed changes
  formula1: string;
  showDropDown?: boolean;
  showErrorMessage?: boolean;
  errorTitle?: string;
  error?: string;
}

export interface CompatWorksheet {
<<<<<<< Updated upstream
  _aoa: (string | number | null)[][];
  '!cols'?: CompatColumn[];
  '!freeze'?: { ySplit?: number; xSplit?: number };
  '!dataValidation'?: CompatDataValidation[];
=======
  /** AOA representation set by utils.json_to_sheet / utils.aoa_to_sheet */
  _aoa: (string | number | null)[][];
  /** Column widths */
  '!cols'?: CompatColumn[];
  /** Freeze panes (e.g. { ySplit: 1 } freezes the header row) */
  '!freeze'?: { ySplit?: number; xSplit?: number };
  /** Data validations: each gets a dropdown + red-highlight when invalid */
  '!dataValidation'?: CompatDataValidation[];
  /** When set, the sheet is hidden in Excel ('hidden' or 'veryHidden') */
>>>>>>> Stashed changes
  '!state'?: 'visible' | 'hidden' | 'veryHidden';
}

export interface CompatWorkbook {
  SheetNames: string[];
  Sheets: Record<string, CompatWorksheet>;
}

// ── Sheet builders ───────────────────────────────────────────────────────────

<<<<<<< Updated upstream
=======
function emptyWorksheet(): CompatWorksheet {
  return { _aoa: [] };
}

>>>>>>> Stashed changes
function aoa_to_sheet(aoa: (string | number | null)[][]): CompatWorksheet {
  return { _aoa: aoa.map((r) => [...r]) };
}

function json_to_sheet(
  rows: Record<string, string | number | null>[],
): CompatWorksheet {
<<<<<<< Updated upstream
  if (rows.length === 0) return { _aoa: [] };
=======
  if (rows.length === 0) return emptyWorksheet();
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
const RED_FILL_ARGB = 'FFFFC7CE';
const RED_FONT_ARGB = 'FF9C0006';
const HEADER_FILL_ARGB = 'FFF3F4F6';
const INLINE_LIMIT = 255;
=======
const RED_FILL_ARGB = 'FFFFC7CE';   // light red background
const RED_FONT_ARGB = 'FF9C0006';   // dark red text
const HEADER_FILL_ARGB = 'FFF3F4F6'; // light grey
const INLINE_LIMIT = 255;            // Excel inline-formula char cap
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
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
=======
/** Parse "A2:A1000" → { startCol:1, startRow:2, endCol:1, endRow:1000 } */
function parseRange(sqref: string): {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
} {
  const m = sqref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) {
    // Single cell like "A2" — treat as 1x1 range
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
function parseInlineValues(formula1: string): string[] {
=======
function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function parseInlineValues(formula1: string): string[] {
  // Strip surrounding quotes from `"Value1,Value2"`
>>>>>>> Stashed changes
  const stripped = formula1.replace(/^"+|"+$/g, '');
  return stripped.split(',').map((v) => v.trim()).filter(Boolean);
}

async function buildExcelJsWorkbook(wb: CompatWorkbook): Promise<ExcelJS.Workbook> {
  const xwb = new ExcelJS.Workbook();
  xwb.creator = 'MyJKKN';
  xwb.created = new Date();

<<<<<<< Updated upstream
=======
  // First pass: ensure _ValidCodes sheet exists if any worksheet has validations
>>>>>>> Stashed changes
  const needsValidCodes = wb.SheetNames.some((n) => {
    const ws = wb.Sheets[n];
    return ws['!dataValidation'] && ws['!dataValidation'].length > 0;
  });

  let validCodesSheet: ExcelJS.Worksheet | null = null;
  let validCodesNextCol = 1;
<<<<<<< Updated upstream

  type ValidationMapping = {
    sheetName: string;
    validation: CompatDataValidation;
    codesCol: number;
=======
  // Track which validation entry maps to which column in _ValidCodes
  type ValidationMapping = {
    sheetName: string;
    validation: CompatDataValidation;
    /** 1-based column index in _ValidCodes sheet */
    codesCol: number;
    /** Last row of values in that column */
>>>>>>> Stashed changes
    codesLastRow: number;
    values: string[];
  };
  const mappings: ValidationMapping[] = [];

  if (needsValidCodes) {
    validCodesSheet = xwb.addWorksheet(VALID_CODES_SHEET);
    validCodesSheet.state = 'hidden';
  }

<<<<<<< Updated upstream
  for (const sheetName of wb.SheetNames) {
    if (sheetName === VALID_CODES_SHEET) continue;
    const ws = wb.Sheets[sheetName];
    const xws = xwb.addWorksheet(sheetName);

    const ySplit = ws['!freeze']?.ySplit ?? 1;
    if (ySplit > 0) xws.views = [{ state: 'frozen', ySplit }];

=======
  // Second pass: add each sheet, attach validations + conditional formatting
  for (const sheetName of wb.SheetNames) {
    if (sheetName === VALID_CODES_SHEET) continue; // we manage this one
    const ws = wb.Sheets[sheetName];
    const xws = xwb.addWorksheet(sheetName);

    // Freeze the header row
    const ySplit = ws['!freeze']?.ySplit ?? 1;
    if (ySplit > 0) {
      xws.views = [{ state: 'frozen', ySplit }];
    }

    // Hidden state passthrough
>>>>>>> Stashed changes
    if (ws['!state'] === 'hidden' || ws['!state'] === 'veryHidden') {
      xws.state = ws['!state'];
    }

<<<<<<< Updated upstream
    ws._aoa.forEach((row, rowIdx) => {
      xws.addRow(row);
      if (rowIdx === 0 && ySplit > 0) {
=======
    // Write AOA rows
    ws._aoa.forEach((row, rowIdx) => {
      xws.addRow(row);
      if (rowIdx === 0 && ySplit > 0) {
        // Style header
>>>>>>> Stashed changes
        const headerRow = xws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: HEADER_FILL_ARGB },
        };
      }
    });

<<<<<<< Updated upstream
=======
    // Apply column widths
>>>>>>> Stashed changes
    if (ws['!cols']) {
      ws['!cols'].forEach((c, i) => {
        if (c?.wch) xws.getColumn(i + 1).width = c.wch;
      });
    }

<<<<<<< Updated upstream
=======
    // Stash validations for the third pass — we need all _ValidCodes columns
    // populated before we can write the dropdown / conditional-formatting refs.
>>>>>>> Stashed changes
    if (ws['!dataValidation'] && validCodesSheet) {
      for (const validation of ws['!dataValidation']) {
        const values = parseInlineValues(validation.formula1);
        const codesCol = validCodesNextCol++;
        const codesLastRow = values.length;
<<<<<<< Updated upstream
        values.forEach((v, i) => {
          validCodesSheet!.getCell(i + 1, codesCol).value = v;
        });
        mappings.push({ sheetName, validation, codesCol, codesLastRow, values });
=======

        // Write values into _ValidCodes column
        values.forEach((v, i) => {
          validCodesSheet!.getCell(i + 1, codesCol).value = v;
        });

        mappings.push({
          sheetName,
          validation,
          codesCol,
          codesLastRow,
          values,
        });
>>>>>>> Stashed changes
      }
    }
  }

<<<<<<< Updated upstream
=======
  // Third pass: apply dropdowns + conditional formatting
>>>>>>> Stashed changes
  for (const m of mappings) {
    const xws = xwb.getWorksheet(m.sheetName)!;
    const { startCol, startRow, endCol, endRow } = parseRange(m.validation.sqref);
    const codesColLetter = columnLetter(m.codesCol);
    const codesRangeRef = `'${VALID_CODES_SHEET}'!$${codesColLetter}$1:$${codesColLetter}$${m.codesLastRow}`;

<<<<<<< Updated upstream
=======
    // Choose inline list vs sheet ref based on length
>>>>>>> Stashed changes
    const inlineFormula = `"${m.values.join(',')}"`;
    const useInline = inlineFormula.length <= INLINE_LIMIT;
    const formulae = useInline ? [inlineFormula] : [codesRangeRef];

<<<<<<< Updated upstream
=======
    // Apply data validation to every cell in the range
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    const targetColLetter = columnLetter(startCol);
    const cfRef = `${targetColLetter}${startRow}:${targetColLetter}${endRow}`;
=======
    // Conditional formatting: highlight cells whose value isn't in the codes
    // range. We always reference the codes sheet for COUNTIF, regardless of
    // whether the dropdown uses inline or sheet ref.
    const targetColLetter = columnLetter(startCol);
    const cfRef = `${targetColLetter}${startRow}:${targetColLetter}${endRow}`;
    // The COUNTIF formula uses the first cell of the range; Excel auto-adjusts
    // for each cell in the range.
>>>>>>> Stashed changes
    const firstCell = `${targetColLetter}${startRow}`;
    const cfFormula = `AND(${firstCell}<>"",COUNTIF(${codesRangeRef},${firstCell})=0)`;

    xws.addConditionalFormatting({
      ref: cfRef,
<<<<<<< Updated upstream
      rules: [{
        type: 'expression',
        formulae: [cfFormula],
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_FILL_ARGB } },
          font: { color: { argb: RED_FONT_ARGB } },
        },
        priority: 1,
      }],
=======
      rules: [
        {
          type: 'expression',
          formulae: [cfFormula],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: RED_FILL_ARGB },
            },
            font: { color: { argb: RED_FONT_ARGB } },
          },
          priority: 1,
        },
      ],
>>>>>>> Stashed changes
    });
  }

  return xwb;
}

<<<<<<< Updated upstream
=======
/**
 * Build the workbook into an ArrayBuffer for streaming as a response.
 * Use this when running inside an API route.
 */
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
/**
 * SheetJS-API-compatible writeFile (for client-side downloads only).
 * In API-route contexts, use writeBuffer instead and stream as a Response.
 */
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
const utils = { aoa_to_sheet, json_to_sheet, book_new, book_append_sheet };
=======
const utils = {
  aoa_to_sheet,
  json_to_sheet,
  book_new,
  book_append_sheet,
};
>>>>>>> Stashed changes

const XLSXCompat = { utils, writeFile, writeBuffer };
export default XLSXCompat;
