/**
 * Housekeeping — pure rules.
 *
 * No I/O, no Supabase, no React. Everything here is unit-tested in
 * __tests__/campus-living/housekeeping-rules.test.ts.
 *
 * quotaWindow*, typeQuota and isLiveStatus MIRROR database logic:
 *   - quotaWindowStart/End and typeQuota mirror step 6 of fn_cl_housekeeping_book,
 *     whose window is SYMMETRIC about the booking date (migration 20260909150000)
 *   - isLiveStatus mirrors the WHERE of ux_hk_one_live_booking_per_room
 * The database is the authority in both cases; these exist so the UI can show
 * "2 left this week" and disable a Book button without a round trip. If you
 * change one, change the other in the same commit or they will disagree
 * silently — the UI will offer a slot the RPC then refuses.
 */

import type {
  BookingStatus,
  FeedbackHold,
  RescheduleReasonCode,
  UsagePeriod,
} from '@/types/campus-living/housekeeping';

/** Half-width of the quota window, in days. 0 / 6 / 29 for day / week / month. */
function quotaWindowDays(period: UsagePeriod): number {
  return period === 'day' ? 0 : period === 'week' ? 6 : 29;
}

/** Inclusive START of the quota window around bookingDate. */
export function quotaWindowStart(bookingDate: string, period: UsagePeriod): string {
  return shiftDays(bookingDate, -quotaWindowDays(period));
}

/**
 * Inclusive END of the quota window around bookingDate.
 *
 * The window is SYMMETRIC: '1 per week' means gone for a week in both
 * directions. Counting only backwards let a room book the later date first and
 * then fit a second cleaning in before it -- see migration 20260909150000.
 */
export function quotaWindowEnd(bookingDate: string, period: UsagePeriod): string {
  return shiftDays(bookingDate, quotaWindowDays(period));
}

/** Anchor at UTC noon so a DST shift can never move the calendar date. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Default for housekeeping.booking_advance_days — the same fallback
 *  fn_cl_housekeeping_book uses when the policy row is absent. */
export const DEFAULT_BOOKING_ADVANCE_DAYS = 7;

export interface TypeQuota {
  /** Bookings left if the room booked for TODAY. This is what "left this week" means. */
  remainingToday: number;
  /** Whether ANY bookable date still has room. Decides enable/disable. */
  bookable: boolean;
  /** Soonest date with room, when today has none. Null if today already works. */
  nextAvailableDate: string | null;
}

/**
 * How much of a type's quota the ROOM has left.
 *
 * MIRRORS fn_cl_housekeeping_book step 6: the window is SYMMETRIC about the
 * date being booked -- `booking_date BETWEEN p_date - n AND p_date + n` for
 * n = 0 / 6 / 29.
 *
 * Two separate bugs lived here. The page counted only `booking_date <= today`,
 * so a booking made for TOMORROW was invisible and a 1-per-week type looked free
 * the moment its one booking moved into the future. And the RPC itself counted
 * only backwards, so booking the later date first left room to squeeze a second
 * cleaning in before it. Both closed; migration 20260909150000 has the numbers.
 *
 * Because the window moves with the date, there is no single "remaining" — a
 * type can be full for today and free next Tuesday. So this returns both: the
 * number to SHOW (today's window) and whether to ENABLE (any date in the
 * horizon). The RPC remains the authority; this only avoids a round trip.
 */
export function typeQuota(args: {
  bookings: Array<{ type_id: string; status: BookingStatus; booking_date: string }>;
  typeId: string;
  usageLimit: number;
  usagePeriod: UsagePeriod;
  today: string;
  advanceDays?: number;
}): TypeQuota {
  const { bookings, typeId, usageLimit, usagePeriod, today } = args;
  const advanceDays = args.advanceDays ?? DEFAULT_BOOKING_ADVANCE_DAYS;

  // Same predicate as the RPC: everything but a cancellation counts, including
  // bookings already completed and bookings still in the future.
  const relevant = bookings.filter((b) => b.type_id === typeId && b.status !== 'cancelled');

  const remainingOn = (date: string) => {
    const from = quotaWindowStart(date, usagePeriod);
    const to = quotaWindowEnd(date, usagePeriod);
    const used = relevant.filter(
      (b) => b.booking_date >= from && b.booking_date <= to,
    ).length;
    return usageLimit - used;
  };

  const remainingToday = Math.max(0, remainingOn(today));

  let nextAvailableDate: string | null = null;
  for (let i = 0; i <= advanceDays; i += 1) {
    const d = addDays(today, i);
    if (remainingOn(d) > 0) {
      nextAvailableDate = d;
      break;
    }
  }

  return {
    remainingToday,
    bookable: nextAvailableDate !== null,
    // Only worth surfacing when today itself is full.
    nextAvailableDate: remainingToday > 0 ? null : nextAvailableDate,
  };
}

/** Calendar-safe day shift. UTC noon so a DST hour can never move the date. */
export const addDays = shiftDays;

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

/**
 * A booking may be moved only before the cleaner has started.
 *
 * Mirrors the status gate in fn_cl_housekeeping_reschedule: once the job is
 * in_progress its started_at belongs to a slot, and once it is
 * awaiting_feedback the cleaning has already happened. Moving either would
 * make the record say something untrue.
 */
export function canReschedule(status: BookingStatus): boolean {
  return status === 'booked' || status === 'assigned';
}

/**
 * Why a booking was moved, in the warden's words and the learner's.
 *
 * ONE map, used by the reschedule dialog, the admin timeline and the learner's
 * banner alike — the learner reads the reason the warden picked, so a second
 * copy of this list would let the two surfaces describe the same move
 * differently. Mirrors the reason_code CHECK on
 * hostel_cleaning_booking_reschedules.
 */
export const RESCHEDULE_REASON_LABEL: Record<RescheduleReasonCode, string> = {
  cleaner_unavailable: 'Cleaner unavailable at that time',
  cleaner_on_leave: 'Cleaner on leave',
  slot_full: 'That slot was full',
  learner_requested: 'Learner asked for a different time',
  emergency: 'Emergency',
  other: 'Other',
};

export const RESCHEDULE_REASON_CODES = Object.keys(
  RESCHEDULE_REASON_LABEL,
) as RescheduleReasonCode[];

/** 'other' is not a reason on its own — it needs the note that explains it. */
export function rescheduleNeedsNote(code: RescheduleReasonCode): boolean {
  return code === 'other';
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
  not_reschedulable: 'The cleaning has already started, so it can no longer be moved.',
  date_in_past: 'Pick a date from today onwards.',
  invalid_reason: 'Pick a reason for moving this booking.',
  reason_note_required: 'Tell the learner what "Other" means — a note is required.',
  slot_unchanged: 'That is the slot the booking is already on. Pick a different date or time.',
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
