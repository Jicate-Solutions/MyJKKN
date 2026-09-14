import type { BookingStatus } from '@/types/campus-living/housekeeping';

/**
 * Learner-facing status vocabulary — deliberately NOT the warden's.
 *
 * The admin table calls 'booked' "Unassigned", which is the fact a warden acts
 * on. A learner has not failed to assign anyone; from their side the cleaning is
 * simply booked and waiting. Same column, different reader, different words —
 * which is why this is a second map rather than a shared one.
 */
export const LEARNER_STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'Booked',
  assigned: 'Cleaner assigned',
  in_progress: 'Cleaning now',
  awaiting_feedback: 'Rate it',
  completed: 'Done',
  cancelled: 'Cancelled',
};

/** One line saying what happens next, so the status never needs decoding. */
export const LEARNER_STATUS_HINT: Record<BookingStatus, string> = {
  booked: 'Waiting for the hostel office to assign a cleaner.',
  assigned: 'A cleaner is set for your slot. They will photograph the room before starting.',
  in_progress: 'Your cleaning is underway.',
  awaiting_feedback: 'Rate it to close it — attendance is held for your room until someone does.',
  completed: 'Finished and rated. Your room can book again.',
  cancelled: 'This booking was cancelled.',
};

export const LEARNER_STATUS_TONE: Record<BookingStatus, string> = {
  booked: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  assigned: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  awaiting_feedback: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-muted text-muted-foreground',
};

/**
 * The four steps a cleaning walks through, for the progress strip.
 * 'cancelled' has no place on it — it leaves the track rather than advancing.
 */
export const BOOKING_STEPS = ['Booked', 'Cleaner', 'Cleaning', 'Rated'] as const;

export function stepIndex(status: BookingStatus): number {
  switch (status) {
    case 'booked':
      return 0;
    case 'assigned':
      return 1;
    case 'in_progress':
      return 2;
    case 'awaiting_feedback':
      return 3;
    case 'completed':
      return 4; // past the last step: every dot filled
    default:
      return -1;
  }
}

/** HH:MM:SS from Postgres -> HH:MM. */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—';
}

/**
 * Read a plain YYYY-MM-DD back in UTC. Parsing a calendar string in local time
 * is how a date slips to the previous day for anyone east of UTC.
 */
export function bookingDateLabel(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "Today" / "Tomorrow" / a date — the phrasing a learner actually thinks in. */
export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const t = new Date(`${today}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return 'Tomorrow';
  return bookingDateLabel(iso);
}
