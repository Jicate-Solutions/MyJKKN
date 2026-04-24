// rows-to-csv.ts
// Client-side CSV converter + browser download trigger.
//
// Keeps the Run-Query PR self-contained — Export CSV works purely from the
// already-fetched `rows` state (no round-trip to a server endpoint).
// Agent D's `/api/audit/parameters/[code]/export-query` can replace this
// later for "export ALL pages" (vs current-page-only); for now, 100 rows/page
// is the normal case and this covers it.

/**
 * Convert an array of flat JSON objects to a CSV string.
 * - Column order = union of keys, first-row-first
 * - Values: null/undefined → empty cell; objects/arrays → JSON.stringify
 * - Escapes `"`, commas, and newlines per RFC 4180
 */
export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) return '';

  // Build column order: first row's keys first, then any extras from later rows.
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const escapeCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let str: string;
    if (typeof value === 'object') {
      try {
        str = JSON.stringify(value);
      } catch {
        str = String(value);
      }
    } else {
      str = String(value);
    }
    // RFC 4180 escape — wrap in quotes if it contains quote, comma, or newline
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map(escapeCell).join(',');
  const body = rows
    .map((row) => columns.map((col) => escapeCell(row?.[col])).join(','))
    .join('\n');

  return `${header}\n${body}`;
}

/**
 * Trigger a browser download of `csv` as `filename`.
 * No-op on SSR / non-browser environments.
 */
export function downloadCsv(csv: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the blob URL on next tick
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
