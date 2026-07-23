import { formatCurrency } from '@/lib/utils';

export type DatePreset = 'today' | 'month' | 'year' | 'all' | 'custom';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

/** Local YYYY-MM-DD (uses local TZ so IST users don't get a UTC off-by-one). */
function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Resolve a preset (or custom from/to) into the date window the RPCs expect. */
export function presetRange(
  preset: DatePreset,
  from?: string,
  to?: string
): { date_from?: string; date_to?: string } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { date_from: isoDate(now), date_to: isoDate(now) };
    case 'month':
      return {
        date_from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        date_to: isoDate(now),
      };
    case 'year':
      return {
        date_from: isoDate(new Date(now.getFullYear(), 0, 1)),
        date_to: isoDate(now),
      };
    case 'custom':
      return { date_from: from || undefined, date_to: to || undefined };
    case 'all':
    default:
      return {};
  }
}

/** Coerce a PostgREST numeric (which can arrive as a string) to a number. */
export const num = (v: unknown): number =>
  typeof v === 'number' ? v : Number(v ?? 0) || 0;

/** Compact Indian currency: ₹3.11 Cr · ₹4.50 L · ₹12.0K · ₹120. */
export function formatINRCompact(value: unknown): string {
  const amount = num(value);
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount, { showDecimals: false });
}

export const CATEGORY_LABELS: Record<string, string> = {
  tuition: 'Tuition',
  hostel: 'Hostel',
  transport: 'Transport',
  exam: 'Exam',
  university_fee: 'University Fee',
  application_fee: 'Application Fee',
  establishment: 'Establishment',
  other: 'Other',
  uncategorized: 'Uncategorized',
};

export const AGING_LABELS: Record<string, string> = {
  not_due: 'Not Due',
  '0-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
};

/** Chart palette (kept in sync with the Tailwind brand-ish hues). */
export const CHART_COLORS = [
  '#2563eb', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#65a30d',
];

export { formatCurrency };
