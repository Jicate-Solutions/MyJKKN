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
 * Format a date + time as "12/04/2026, 14:30" (24-hour, DD/MM/YYYY).
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
    hour12: false,
  });
}
