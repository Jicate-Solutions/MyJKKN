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

/**
 * Parse Excel file and return rows
 * @param file - Excel file to parse
 * @param sheetName - Optional sheet name (uses first sheet if not provided)
 * @returns Parsed data with row numbers
 */
export async function parseExcelFile(
  file: File,
  sheetName?: string
): Promise<ExcelParseResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

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
          // Sheet not found - provide helpful error with available sheets
          const availableSheets = workbook.SheetNames.join(', ');
          return {
            rows: [],
            totalRows: 0,
            errors: [
              `Sheet "${sheetName}" not found in file. Available sheets: ${availableSheets}. ` +
              `Please ensure you're uploading the correct file with the "Active Learners" sheet.`
            ]
          };
        }
      }
    } else {
      // Use first non-reference sheet (skip sheets like "Instructions", "Reference", etc.)
      const mainSheetName = workbook.SheetNames.find(name =>
        !name.toLowerCase().includes('instruction') &&
        !name.toLowerCase().includes('reference') &&
        !name.toLowerCase().includes('info')
      ) || workbook.SheetNames[0];

      selectedSheetName = mainSheetName;
      worksheet = workbook.Sheets[mainSheetName];
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
