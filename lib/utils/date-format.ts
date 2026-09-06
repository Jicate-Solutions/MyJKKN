// lib/utils/date-format.ts
// BUG-003016: The admission team asked that all dates render as DD/MM/YYYY
// (Indian / UK style) rather than the ambiguous server-default MM/DD/YYYY
// that `new Date(x).toLocaleDateString()` produces on most US-English
// deployment environments. A lead record created on 3 October 2026 was
// rendering as "10/03/2026" which is indistinguishable from 10 March 2026.
//
// This module centralises date formatting so the fix applies everywhere
// at once and future code can't drift back to ambiguous formats by
// accident. Using en-GB locale guarantees DD/MM/YYYY regardless of the
// browser or server TZ/locale settings.

export type DateInput = string | number | Date | null | undefined;

/**
 * Format a date as DD/MM/YYYY (Indian / UK convention). Returns '—' for
 * null / undefined / invalid inputs so callers don't need null-guards.
 */
export function formatDateDMY(input: DateInput): string {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
}

/**
 * Format a date as "12 Apr 2026" (short, unambiguous, human-readable).
 * Use when you want month names instead of numeric DD/MM/YYYY.
 */
export function formatDateShort(input: DateInput): string {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a date + time as "12/04/2026, 02:30 PM" (12-hour with am/pm,
 * DD/MM/YYYY). Switched from 24-hour to 12-hour on 2026-05-20 per product
 * request — every consumer is a user-facing admission UI surface (activity
 * tabs, comms log, checklist, lead detail) where AM/PM reads more naturally
 * than 14:30. The `en-GB` locale keeps the date part as DD/MM/YYYY; `hour12`
 * flips the time into 12-hour with locale-correct AM/PM markers.
 */
export function formatDateTimeDMY(input: DateInput): string {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── IST business day ─────────────────────────────────────────────────────────
// Added 2026-07-30 for the IMS POS go-live. Every "today" window in the IMS
// reporting layer was built as `${date}T00:00:00.000Z` … `T23:59:59.999Z`, i.e.
// UTC midnight to UTC midnight. India runs at UTC+05:30, so that window is
// 05:30 today → 05:30 tomorrow local: a bill rung at 19:00 IST fell into the
// NEXT day's totals, and the first 5.5 h of each reported day belonged to the
// previous business day. For a cash-drawer POS that makes the day-close figure
// impossible to tie to the till, so the boundaries have to be IST-anchored.
//
// The offset is written as a fixed +05:30 rather than resolved through a tz
// database: India has no DST and has not changed offset since 1945, and a fixed
// offset keeps these strings safe to hand straight to PostgREST as timestamptz
// comparisons.

const IST_OFFSET = '+05:30';

/**
 * Today's date in IST as `YYYY-MM-DD`, regardless of where the caller runs.
 *
 * Uses `en-CA` because that locale's short date format IS ISO `YYYY-MM-DD` —
 * the same trick already used in lib/services/ims/inventory-service.server.ts.
 */
export function istBusinessDate(input?: DateInput): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * The inclusive timestamptz bounds of one IST business day, for use in
 * `.gte(from)` / `.lte(to)` filters.
 *
 * istDayBounds('2026-07-30') -> { from: '2026-07-30T00:00:00.000+05:30',
 *                                to:   '2026-07-30T23:59:59.999+05:30' }
 */
export function istDayBounds(date: string): { from: string; to: string } {
  return {
    from: `${date}T00:00:00.000${IST_OFFSET}`,
    to: `${date}T23:59:59.999${IST_OFFSET}`,
  };
}

/**
 * Bounds spanning an inclusive IST date range. Passing the same date twice is
 * equivalent to istDayBounds.
 */
export function istRangeBounds(dateFrom: string, dateTo: string): { from: string; to: string } {
  return {
    from: `${dateFrom}T00:00:00.000${IST_OFFSET}`,
    to: `${dateTo}T23:59:59.999${IST_OFFSET}`,
  };
}
