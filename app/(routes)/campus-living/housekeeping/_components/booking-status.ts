import type { BookingStatus } from '@/types/campus-living/housekeeping';

/**
 * Shared booking presentation, so the desktop table and the mobile card cannot
 * drift apart. Both render the same six statuses; two copies of these maps is
 * how one of them ends up a colour behind.
 *
 * 'booked' reads as "Unassigned" on purpose: to a warden the meaningful fact is
 * that nobody is doing it yet, not that a learner pressed a button.
 */
export const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_feedback: 'Awaiting feedback',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_TONE: Record<BookingStatus, string> = {
  booked: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  assigned: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  awaiting_feedback: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-muted text-muted-foreground',
};

/** HH:MM:SS from Postgres -> HH:MM for display. */
export function hhmm(t: string): string {
  return t?.slice(0, 5) ?? t;
}

/**
 * Read a plain YYYY-MM-DD back in UTC. Parsing a calendar string in local time
 * is how a date slips to the previous day for anyone east of UTC.
 */
export function bookingDateLabel(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Local YYYY-MM-DD. toISOString() would shift the date in IST. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
