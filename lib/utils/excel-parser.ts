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
      // Handle Excel date serial numbers
      if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
      // Handle string dates
      try {
        const date = new Date(stringValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        return stringValue;
      }
      return stringValue;

    default:
      return stringValue;
  }
}
