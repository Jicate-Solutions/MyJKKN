/**
 * Billing Audit — shared display formatters.
 *
 * Null renders as an em-dash so "no expectation configured" and "no bill"
 * read as intentional rather than as ₹0, which is a real and very different
 * figure on an audit screen.
 */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

/** ₹ with en-IN grouping, no paise. null → '—'. */
export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return inr.format(value);
}

/** Compact ₹ for KPI cards: 11,478,500 → "₹1.15 Cr", 770,000 → "₹7.7 L". */
export function formatInrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`;
  return inr.format(value);
}

/** Plain integer with en-IN grouping. null → '—'. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}

/** Share of a whole as a whole-number percentage. 0/0 → '—'. */
export function formatShare(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** YYYY-MM-DD → "30 Sep 2026". Returns the raw string if unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
