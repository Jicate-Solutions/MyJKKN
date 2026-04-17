/**
 * CSV Export Utility
 *
 * Shared utility for exporting data as CSV files from any reporting page.
 * Uses native browser Blob + download approach (no external libraries).
 *
 * Features:
 * - Proper CSV escaping (commas, quotes, newlines in data)
 * - Column mapping with custom labels
 * - Nested object property access (e.g., 'user.full_name')
 * - Automatic filename with date suffix
 *
 * Created: 2026-02-10
 */

export interface ExportColumn {
  /** Dot-notation key path to access value (e.g., 'user.full_name') */
  key: string;
  /** Column header label shown in CSV */
  label: string;
  /** Optional formatter for the value */
  formatter?: (value: any, row: Record<string, any>) => string;
}

/**
 * Get a nested property value from an object using dot notation.
 *
 * @param obj - The object to read from
 * @param path - Dot-notation path (e.g., 'learner.first_name')
 * @returns The value at that path, or undefined
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Escape a value for CSV format.
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 * Doubles any internal quotes per CSV spec (RFC 4180).
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If the value contains a comma, double-quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Export an array of objects to a CSV file and trigger browser download.
 *
 * @param data - Array of records to export
 * @param filename - Base filename (date will be appended, .csv extension added)
 * @param columns - Optional column definitions. If not provided, all keys from
 *                  the first record are used as columns.
 *
 * @example
 * ```ts
 * exportToCSV(filteredData, 'leave-report', [
 *   { key: 'learner.first_name', label: 'First Name' },
 *   { key: 'status', label: 'Status' },
 *   { key: 'created_at', label: 'Date', formatter: (v) => new Date(v).toLocaleDateString() },
 * ]);
 * ```
 */
export function exportToCSV(
  data: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[]
): void {
  if (!data || data.length === 0) {
    return;
  }

  // If no columns specified, derive from first record's keys
  const cols: ExportColumn[] = columns || Object.keys(data[0]).map((key) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  // Build header row
  const headerRow = cols.map((col) => escapeCSVValue(col.label)).join(',');

  // Build data rows
  const dataRows = data.map((row) => {
    return cols
      .map((col) => {
        const rawValue = getNestedValue(row, col.key);
        const displayValue = col.formatter ? col.formatter(rawValue, row) : rawValue;
        return escapeCSVValue(displayValue);
      })
      .join(',');
  });

  // Combine with BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csvContent = BOM + [headerRow, ...dataRows].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);
}
