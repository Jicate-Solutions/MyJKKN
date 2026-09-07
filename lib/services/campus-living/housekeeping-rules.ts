/**
 * Housekeeping — pure rules.
 *
 * No I/O, no Supabase, no React. Everything here is unit-tested in
 * __tests__/campus-living/housekeeping-rules.test.ts.
 *
 * quotaWindowStart and isLiveStatus MIRROR database logic:
 *   - quotaWindowStart mirrors the CASE in fn_cl_housekeeping_book step 6
 *   - isLiveStatus mirrors the WHERE of ux_hk_one_live_booking_per_room
 * The database is the authority in both cases; these exist so the UI can show
 * "2 left this week" and disable a Book button without a round trip. If you
 * change one, change the other in the same commit or they will disagree
 * silently — the UI will offer a slot the RPC then refuses.
 */

import type { BookingStatus, FeedbackHold, UsagePeriod } from '@/types/campus-living/housekeeping';

/** Inclusive start of the rolling quota window ending on bookingDate. */
export function quotaWindowStart(bookingDate: string, period: UsagePeriod): string {
  const daysBack = period === 'day' ? 0 : period === 'week' ? 6 : 29;
  // Anchor at UTC noon so a DST shift can never move the calendar date.
  const d = new Date(`${bookingDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** slot_start + durationMinutes, returned as HH:MM. */
export function slotEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Sum of quantity x unit cost, rounded to paise. Mirrors the generated column. */
export function expenseTotal(lines: Array<{ quantity: number; unit_cost_inr: number }>): number {
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost_inr, 0);
  return Math.round(total * 100) / 100;
}

/** A learner may cancel only while no cleaner is assigned. */
export function canLearnerCancel(status: BookingStatus): boolean {
  return status === 'booked';
}

/** Statuses that hold the room lock. Mirrors ux_hk_one_live_booking_per_room. */
export function isLiveStatus(status: BookingStatus): boolean {
  return (
    status === 'booked' ||
    status === 'assigned' ||
    status === 'in_progress' ||
    status === 'awaiting_feedback'
  );
}

const BOOKING_ERROR_COPY: Record<string, string> = {
  unauthenticated: 'Please sign in again to book a cleaning.',
  feature_disabled: 'Cleaning booking is turned off right now. Ask your warden.',
  no_allocation: 'You need an active hostel room before you can book a cleaning.',
  type_unavailable: 'That cleaning type is no longer available.',
  category_not_eligible: 'This cleaning is not offered for your room type.',
  room_locked: 'A roommate already has a cleaning booked for your room. It has to finish first.',
  quota_exhausted: 'Your room has used all its bookings for this cleaning.',
  date_out_of_range: 'You cannot book that far ahead. Pick a nearer date.',
  day_closed: 'No cleaning is scheduled for that day.',
  slot_full: 'That slot was just taken. Please pick another.',
  slot_not_found: 'That slot is no longer on offer. Refresh and try again.',
  not_your_room: 'You can only book cleanings for your own room.',
  room_not_found: 'We could not find your room. Contact your warden.',
  already_assigned: 'A cleaner is already on the way, so this can no longer be cancelled.',
  not_cancellable: 'This booking can no longer be cancelled.',
  cleaner_unavailable: 'That cleaner is not available.',
  cleaner_wrong_block: 'That cleaner does not serve this block.',
  cleaner_not_working: 'That cleaner does not work on this day.',
  not_assignable: 'This booking can no longer be assigned.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'That booking no longer exists.',
};

export function bookingErrorMessage(code: string, fallback: string): string {
  return BOOKING_ERROR_COPY[code] ?? fallback;
}

// Explicit, not toLocaleDateString: Node's en-GB renders September as "Sept"
// and the exact abbreviation shifts with the runtime's ICU build. This message
// is shown to wardens and quoted in the database trigger, so it has to read the
// same everywhere.
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** A booking date (YYYY-MM-DD) as "12 Sep 2026". */
export function formatHoldDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTH_ABBR[m - 1]} ${y}`;
}

/** The banner text shown on the attendance mark page for a held learner. */
export function holdMessage(hold: FeedbackHold): string {
  return `Housekeeping feedback pending — ${hold.type_name} on ${formatHoldDate(hold.booking_date)}. Any roommate can rate the cleaning to release attendance.`;
}
