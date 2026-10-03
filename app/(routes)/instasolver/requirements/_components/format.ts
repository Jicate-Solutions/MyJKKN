// Display helpers for requirements. Formatting only — no figures are computed here.

import { format, parseISO } from 'date-fns';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
});

/** Rupees in the Indian grouping (₹1,25,000). */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return INR.format(Number(value));
}

/** A date or timestamp as "30 Sep 2026". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
  } catch {
    return '—';
  }
}
