// ============================================
// EXCEL PARSER UTILITY
// ============================================
// Created: 2025-01-22
// Purpose: Parse Excel files for bulk operations
// ============================================

import * as XLSX from 'xlsx';

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, any>;
}

export interface ExcelParseResult {
  rows: ParsedRow[];
  totalRows: number;
  errors: string[];
}

const isDocSheet = (name: string) =>
  ['instruction', 'reference', 'info'].some(word => name.toLowerCase().includes(word));

/**
 * Pick the data sheet: prefer one whose header row carries an expected column,
 * else the first sheet that isn't a doc-only sheet ("📖 Instructions",
 * "Reference", "Info"), else sheet one. Position alone is not enough — staff
 * bulk upload silently read the prose "Instructions" sheet for months because
 * it happened to be SheetNames[0].
 */
function pickDataSheet(workbook: XLSX.WorkBook, anchorColumns?: string[]): string {
  if (anchorColumns?.length) {
    const anchored = workbook.SheetNames.find(name => {
      const header = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name], {
        header: 1,
        range: 0
      })[0];
      return Array.isArray(header) && header.some(cell => anchorColumns.includes(String(cell).trim()));
    });
    if (anchored) return anchored;
  }

  return workbook.SheetNames.find(name => !isDocSheet(name)) || workbook.SheetNames[0];
}

/**
 * Parse Excel file and return rows
 * @param file - Excel file to parse
 * @param sheetName - Preferred sheet name. Falls back to the first data sheet
 *   when absent: a sheet NAME is not proof of file identity. Excel "Save As
 *   CSV" round-trips, Google Sheets re-saves and copy-paste into a new
 *   workbook all rename the tab to "Sheet1", and SheetJS names EVERY parsed
 *   CSV "Sheet1" — so requiring the name rejected files whose data was
 *   perfectly valid. Callers must validate the COLUMNS they need instead.
 * @param anchorColumns - Header names that identify the data sheet (e.g. the
 *   ID aliases). Used only when `sheetName` is missing from the workbook, so a
 *   user file with a summary/pivot tab in front still resolves correctly.
 * @returns Parsed data with row numbers
 */
export async function parseExcelFile(
  file: File,
  sheetName?: string,
  anchorColumns?: string[]
): Promise<ExcelParseResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });

    // Find the sheet to use
    let worksheet: XLSX.WorkSheet;
    let selectedSheetName: string;

    if (sheetName) {
      // Try exact match first
      if (workbook.SheetNames.includes(sheetName)) {
        selectedSheetName = sheetName;
        worksheet = workbook.Sheets[sheetName];
      } else {
        // Try case-insensitive match
        const sheetNameLower = sheetName.toLowerCase();
        const matchingSheet = workbook.SheetNames.find(
          name => name.toLowerCase() === sheetNameLower
        );

        if (matchingSheet) {
          selectedSheetName = matchingSheet;
          worksheet = workbook.Sheets[matchingSheet];
          console.log(`[excel-parser] Using sheet "${matchingSheet}" (case-insensitive match for "${sheetName}")`);
        } else {
          selectedSheetName = pickDataSheet(workbook, anchorColumns);
          worksheet = workbook.Sheets[selectedSheetName];
          console.log(
            `[excel-parser] Sheet "${sheetName}" not found (have: ${workbook.SheetNames.join(', ')}) - ` +
            `falling back to "${selectedSheetName}"`
          );
        }
      }
    } else {
      selectedSheetName = pickDataSheet(workbook, anchorColumns);
      worksheet = workbook.Sheets[selectedSheetName];
    }

    // Parse to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      return {
        rows: [],
        totalRows: 0,
        errors: ['No data found in the Excel file']
      };
    }

    // Map to ParsedRow format
    const rows: ParsedRow[] = jsonData.map((row, index) => ({
      rowNumber: index + 2, // +2 because Excel is 1-indexed and has header row
      data: row as Record<string, any>
    }));

    return {
      rows,
      totalRows: rows.length,
      errors: []
    };

  } catch (error) {
    console.error('[excel-parser] Error parsing file:', error);
    return {
      rows: [],
      totalRows: 0,
      errors: [error instanceof Error ? error.message : 'Failed to parse Excel file']
    };
  }
}

/**
 * True when at least one parsed row carries one of the given column aliases.
 * Use this to verify an upload is the right FILE — the sheet name can't, since
 * every CSV and every re-saved workbook arrives named "Sheet1".
 */
export function hasColumn(rows: ParsedRow[], aliases: string[]): boolean {
  return rows.some(row => aliases.some(alias => row.data[alias] !== undefined));
}

/**
 * Column headers actually present in the upload, for error messages.
 */
export function listColumns(rows: ParsedRow[], limit = 10): string {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.data)) seen.add(key);
    if (seen.size > limit) break;
  }
  const names = [...seen];
  return names.length > limit
    ? `${names.slice(0, limit).join(', ')} … (+${names.length - limit} more)`
    : names.join(', ');
}

/**
 * Map row data using flexible column names
 * Tries multiple variations of column names
 */
export function mapColumns(
  row: Record<string, any>,
  columnMapping: Record<string, string[]>
): Record<string, any> {
  const mappedData: Record<string, any> = {};

  Object.entries(columnMapping).forEach(([targetKey, possibleKeys]) => {
    for (const key of possibleKeys) {
      // Try exact match, lowercase, uppercase
      const value = row[key] || row[key.toLowerCase()] || row[key.toUpperCase()];

      if (value !== undefined && value !== null && value !== '') {
        mappedData[targetKey] = value;
        break;
      }
    }
  });

  return mappedData;
}

/**
 * Check if a row is completely empty
 */
export function isRowEmpty(row: Record<string, any>, requiredFields: string[]): boolean {
  return requiredFields.every(field => {
    const value = row[field];
    return value === undefined || value === null || value === '';
  });
}

/** A date outside this window is never a real DOB / admission date. */
const DATE_MIN_YEAR = 1900;
const DATE_MAX_YEAR = 2100;

function isoIfReal(y: number, m: number, d: number): string {
  if (y < DATE_MIN_YEAR || y > DATE_MAX_YEAR || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isoFromExcelSerial(serial: number): string {
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return '';
  return isoIfReal(date.y, date.m, date.d);
}

/**
 * Date cells → 'YYYY-MM-DD', or '' when the cell cannot be read as a real
 * date (callers treat '' as "not provided").
 *
 * 2026-09-22: an Excel serial that arrives as a STRING ("42842" — pasted, or
 * CSV) used to fall through to `new Date("42842")`, which V8 reads as YEAR
 * 42842 and toISOString() emits as "+042842-01-01". 456 learner DOBs were
 * stored that way. Serials are now recognised whether numeric or string,
 * DD-MM-YYYY / DD.MM.YYYY are read day-first, and any result outside
 * 1900–2100 is rejected rather than written.
 */
function sanitizeDateValue(value: any, stringValue: string): string {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    return isoFromExcelSerial(value);
  }
  // Serial that lost its numeric type (pasted / CSV).
  if (/^\d{4,6}(\.\d+)?$/.test(stringValue)) {
    return isoFromExcelSerial(Number(stringValue));
  }
  const dmy = stringValue.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    return isoIfReal(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }
  const ymd = stringValue.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (ymd) {
    return isoIfReal(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }
  // Anything else (e.g. "15 Aug 2005"): let the engine try, but never let an
  // out-of-range year through.
  const parsed = new Date(stringValue);
  if (isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  if (y < DATE_MIN_YEAR || y > DATE_MAX_YEAR) return '';
  return parsed.toISOString().slice(0, 10);
}

/**
 * Sanitize and format field values
 */
export function sanitizeValue(value: any, type: 'text' | 'email' | 'mobile' | 'number' | 'date'): any {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const stringValue = String(value).trim();

  switch (type) {
    case 'text':
      return stringValue.toUpperCase();

    case 'email':
      return stringValue.toLowerCase();

    case 'mobile':
      // Extract only digits
      return stringValue.replace(/\D/g, '');

    case 'number':
      return stringValue;

    case 'date':
      return sanitizeDateValue(value, stringValue);

    default:
      return stringValue;
  }
}
