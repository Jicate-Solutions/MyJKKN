/**
 * Attendance analytics — shared display formatters.
 *
 * Mirrors analytics/bed-economics/_components/format.ts. Null renders as an
 * em-dash so an empty state reads as intentional rather than as "0%", which is
 * a real and very different attendance figure.
 */

/** Percentage with at most 1 decimal. null → '—'. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Plain integer with en-IN grouping. null → '—'. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}

/** YYYY-MM-DD → "8 Sep 2026". Returns the raw string if unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Short axis label: 'YYYY-MM-DD' → 'MM-DD'. */
export function shortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(5) : iso;
}

export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Tone for an attendance percentage. Thresholds match the at-risk bands used
 * on the learner list (<50 critical, <75 warning) so a colour means the same
 * thing on every surface of this dashboard.
 */
export function pctTone(pct: number | null | undefined): 'critical' | 'warning' | 'ok' | 'none' {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'none';
  if (pct < 50) return 'critical';
  if (pct < 75) return 'warning';
  return 'ok';
}

/** Tailwind text colour for a tone. */
export function toneClass(tone: ReturnType<typeof pctTone>): string {
  switch (tone) {
    case 'critical':
      return 'text-destructive';
    case 'warning':
      return 'text-amber-600 dark:text-amber-500';
    case 'ok':
      return 'text-emerald-600 dark:text-emerald-500';
    default:
      return 'text-muted-foreground';
  }
}

/** Status → label + badge colour, shared by the heatmap and the mark log. */
export const STATUS_META: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  present: {
    label: 'Present',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  late_entry: {
    label: 'Late entry',
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  absent: {
    label: 'Absent',
    dot: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  on_leave: {
    label: 'On leave',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  medical: {
    label: 'Medical',
    dot: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
};
