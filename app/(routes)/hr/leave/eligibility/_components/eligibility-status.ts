import type { LeaveEligibilityRow } from '@/types/hr-leave-types';

/** Badge colours for an eligibility status — shared by the page's own-standing card and the table. */
export const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  revoked: 'bg-muted text-muted-foreground',
};

/**
 * One row of the "Granted & decided" table: the eligibility plus the institution
 * NAME, resolved once by the table wrapper so that sorting, searching and the
 * export all read the same text instead of a uuid.
 */
export interface EligibilityTableRow extends LeaveEligibilityRow {
  institution_name: string | null;
}

/** Leave type names are typed by hand per organisation ("PH.D" vs "PH.D "), so compare them trimmed and lower-cased. */
export function normalizeTypeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * A date-only column (valid_until) as dd/MM/yyyy, WITHOUT going through Date.
 * `new Date('2026-12-31')` is UTC midnight and renders as the previous day in any
 * zone west of UTC; splitting the string cannot shift it.
 */
export function fmtDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}
