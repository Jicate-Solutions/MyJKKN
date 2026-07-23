/**
 * Bed Economics — shared display formatters (Bed Economics PR B, 2026-06-07).
 *
 * Currency: round rupees, no decimals (spec §8 quality bar). Percentages: 1
 * decimal max. Null/undefined render as an em-dash so empty states read
 * intentionally rather than as "0" or "NaN".
 */

/** ₹ with en-IN grouping, rounded to whole rupees. null → '—'. */
export function formatRupees(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Whole-rupee number without the symbol (for table cells beside an icon). */
export function formatRupeesPlain(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}

/** Percentage with at most 1 decimal. null → '—'. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  // Drop the trailing .0 for clean whole numbers.
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Plain integer with en-IN grouping. null → '—'. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}

/** A short numeric value with at most 1 decimal (density etc). */
export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** YYYY-MM-DD → "7 Jun 2026". Returns the raw string if unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
