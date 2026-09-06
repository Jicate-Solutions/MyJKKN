/**
 * Read an uploaded staff bulk-edit workbook into rows.
 *
 * The data sheet is found by INSPECTING HEADERS, not by index and not by name:
 * SheetNames[0] is the Instructions sheet after an Excel round-trip, and users rename
 * sheets. bulk-upload-staff.tsx uses the same technique for the same reason.
 *
 * Columns are read by header name, so reordering or inserting a column is harmless.
 */
import * as XLSX from 'xlsx';
import { BULK_EDIT_COLUMNS, MATCH_KEY_HEADER } from './staff-bulk-edit-columns';
import type { ParsedStaffRow } from './staff-bulk-edit-validation';

const KNOWN_HEADERS = new Set(BULK_EDIT_COLUMNS.map(c => c.header));

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`;
  }
  return String(value).trim();
}

// blankrows must stay true (sheet_to_json's default): a fully blank row is a real row in
// the sheet. Dropping it from the array (blankrows: false) shifts every row after it out
// of sync with its real sheet position, and rowNumber is what the error sheet sends the
// user back to — an off-by-one there points them at the wrong line.
const SHEET_TO_AOA_OPTS = { header: 1 as const, blankrows: true };

export function parseStaffBulkEditWorkbook(
  buffer: ArrayBuffer | Buffer
): { rows: ParsedStaffRow[]; sheetName: string; error?: string } {
  const workbook = XLSX.read(buffer, { cellDates: true });

  let sheetName = '';
  let headerRow: string[] = [];

  for (const name of workbook.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], SHEET_TO_AOA_OPTS);
    if (aoa.length === 0) continue;
    const headers = (aoa[0] as unknown[]).map(h => cellToString(h));
    if (headers.includes(MATCH_KEY_HEADER)) {
      sheetName = name;
      headerRow = headers;
      break;
    }
  }

  if (!sheetName) {
    return {
      rows: [],
      sheetName: '',
      error: `No sheet in this file has an "${MATCH_KEY_HEADER}" column. Download a fresh template and fill that in.`
    };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], SHEET_TO_AOA_OPTS);

  const rows: ParsedStaffRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] as unknown[];
    const cells: Record<string, string> = {};
    headerRow.forEach((header, col) => {
      if (KNOWN_HEADERS.has(header)) cells[header] = cellToString(values?.[col]);
    });

    const institutionEmail = cells[MATCH_KEY_HEADER] ?? '';
    if (institutionEmail === '') continue; // blank key = spacer row

    rows.push({ rowNumber: i + 1, institutionEmail, cells });
  }

  return { rows, sheetName };
}
