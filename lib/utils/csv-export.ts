// lib/utils/csv-export.ts
// Reusable CSV export utility for Solutions Hub list pages

export interface CsvColumn<T> {
  /** Column header label */
  header: string;
  /** Function to extract value from row */
  accessor: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Convert data array to CSV string
 */
function toCsvString<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headers = columns.map((col) => escapeCsvField(col.header));
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = col.accessor(row);
      if (value === null || value === undefined) return '';
      return escapeCsvField(String(value));
    })
  );

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Escape a CSV field — wraps in quotes if needed and prevents CSV injection.
 * Fields starting with =, +, -, @, \t, \r are prefixed with a single quote
 * to prevent formula execution in spreadsheet applications.
 */
function escapeCsvField(field: string): string {
  // Prevent CSV injection: prefix dangerous characters that spreadsheets interpret as formulas
  let sanitized = field;
  if (/^[=+\-@\t\r]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }

  if (sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r') || sanitized.includes('"')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Trigger a CSV file download in the browser
 */
export function downloadCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string
): void {
  const csv = toCsvString(data, columns);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation to ensure the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Format a date for CSV export (YYYY-MM-DD)
 */
export function formatDateForCsv(date: string | null | undefined): string {
  if (!date) return '';
  try {
    return new Date(date).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * Format currency for CSV export (plain number without symbol)
 */
export function formatCurrencyForCsv(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  return String(amount);
}

/**
 * Format an array field for CSV export (comma-separated in quotes)
 */
export function formatArrayForCsv(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '';
  return arr.join('; ');
}
