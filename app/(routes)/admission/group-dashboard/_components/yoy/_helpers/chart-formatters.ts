/**
 * X-axis tick formatter — convert day-N to a milestone label.
 * Day 0 = April 1 of the cohort's class-start year.
 *
 * Returns short labels at key milestones (Apr 1, Jul 1, Oct 1, Jan 1, etc.)
 * and bare day numbers elsewhere. Reduces visual clutter compared to bare
 * day-N integers at every tick.
 */
export function formatDayNTick(dayN: number): string {
  // Day-N anchored at April 1. Compute month + day-of-month for that offset.
  // Use a stable reference year (non-leap, doesn't matter which) since we
  // only care about the calendar-position label.
  const base = new Date(Date.UTC(2025, 3, 1)); // April 1, 2025
  const d = new Date(base.getTime() + dayN * 86_400_000);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  // Milestone labels at month-starts. The first label of each year-span
  // includes year offset to disambiguate when dayN > 365.
  if (day === 1) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[month];
  }
  // For days well past Year 1, show "+M" notation
  if (dayN > 365) return `+${dayN - 365}d`;
  if (dayN < 0) return `${dayN}`;
  return `${dayN}`;
}

/**
 * Number formatter — uses Indian thousands separators (1,23,456).
 * Director uses this convention; matches Sheet display.
 */
export function formatIndianNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (!Number.isFinite(n)) return '—';
  // Indian numbering: last 3 digits as ones, then groups of 2.
  // 1234567 → 12,34,567
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const s = abs.toString();
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${restGrouped},${last3}`;
}

/**
 * Compact number formatter for chart Y-axis labels.
 * 1234 → '1.2k', 12345 → '12k'.
 */
export function formatCompact(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1000)}k`;
  return n.toString();
}

/** Format a percentage delta with sign + 1 decimal. -14.5% / +31.2%. */
export function formatDeltaPct(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
