/**
 * Day and hour formatting for the Time Off module.
 *
 * `toFixed(1)` was used throughout, which rendered whole balances as
 * "12.0 day(s) available". Leave is granted in whole days almost everywhere —
 * only half-day requests produce a fraction — so a forced decimal made the
 * common case read like a precision the number does not have.
 *
 * Round first, then let Number drop the trailing zeros: toFixed(2) fixes
 * binary-float noise (0.1 + 0.2 = 0.30000000000000004) and String(Number(...))
 * removes '.00' and '.50' -> '.5'.
 *
 *   12      -> "12"
 *   12.00   -> "12"      (numeric columns arrive as "12.00")
 *   0.5     -> "0.5"
 *   2.5     -> "2.5"
 *   1.25    -> "1.25"    (kept — never silently rounded away)
 */
export function formatDays(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(2)));
}

/** Same rule for hour totals on Short Time Off. */
export const formatHours = formatDays;

/**
 * The first day a request's biometric file is missing, for the approval gate's
 * message — "12 Aug 2026".
 *
 * Parsed as parts rather than `new Date(iso)`: the value is a bare `date` from
 * Postgres with no zone, and `new Date('2026-08-12')` is read as UTC midnight,
 * which renders as 11 Aug in any timezone behind UTC. India is ahead so it
 * happens not to bite here, but the same shortcut has produced off-by-one dates
 * in this codebase before and there is no reason to leave the trap set.
 */
export function formatBiometricGap(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
