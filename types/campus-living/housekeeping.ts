/**
 * Campus Living — Housekeeping types.
 *
 * learner_id is a profiles.id throughout, matching hostel_allocations.learner_id
 * (which is a FK to profiles despite its name). It is NOT a learners_profiles.id.
 * The chain is: auth.uid() = profiles.id = hostel_allocations.learner_id
 *                                        = hostel_attendance.learner_id
 */

export type UsagePeriod = 'day' | 'week' | 'month';

export type BookingStatus =
  | 'booked'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_feedback'
  | 'completed'
  | 'cancelled';

export type PhotoPhase = 'before' | 'after';

/**
 * A GLOBAL catalogue row — cleaning types carry no institution_id. Eligibility
 * is decided by the room-category junction, not by tenancy. See
 * supabase/migrations/20260909110000_housekeeping_types_global.sql.
 */
export interface CleaningType {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  usage_limit_count: number;
  usage_period: UsagePeriod;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CleaningTypeExpense {
  id: string;
  type_id: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_cost_inr: number;
  line_total_inr: number;
  sort_order: number;
}

/** A type with its expense lines and the room categories allowed to book it. */
export interface CleaningTypeWithDetail extends CleaningType {
  expenses: CleaningTypeExpense[];
  category_ids: string[];
  expected_cost_inr: number;
}

/**
 * A GLOBAL directory row — cleaners carry no institution_id. hostel_blocks has
 * none either, and 4 of the 6 blocks house several colleges at once, so a
 * cleaner's real scope is block_ids.
 */
export interface Cleaner {
  id: string;
  full_name: string;
  phone: string | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  employee_code: string | null;
  /** Postgres DOW: 0=Sunday .. 6=Saturday. */
  working_days: number[];
  shift_start: string | null;
  shift_end: string | null;
  is_active: boolean;
  notes: string | null;
  block_ids: string[];
}

/** Per block, per weekday. Global: one window per block, whoever lives in it. */
export interface CleaningAvailability {
  id: string;
  block_id: string;
  /** Postgres DOW: 0=Sunday .. 6=Saturday. */
  weekday: number;
  is_open: boolean;
  window_start: string;
  window_end: string;
  capacity: number;
}

export interface CleaningBooking {
  id: string;
  institution_id: string;
  block_id: string;
  room_id: string;
  allocation_id: string;
  learner_id: string;
  type_id: string;
  booking_date: string;
  slot_start: string;
  slot_end: string;
  status: BookingStatus;
  cleaner_id: string | null;
  cleaner_name: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  feedback_due_at: string;
  type_name: string;
  duration_minutes: number;
  expected_cost_inr: number;
  waived_at: string | null;
  waived_by: string | null;
  waive_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A booking joined with the room/block labels the day board renders. */
export interface BookingBoardRow extends CleaningBooking {
  room_number: string | null;
  block_name: string | null;
  has_before_photo: boolean;
  has_after_photo: boolean;
  /** A phase holds as many photos as were uploaded — the table shows the count. */
  before_photo_count: number;
  after_photo_count: number;
  feedback_count: number;
  average_rating: number | null;
}

/**
 * Why a warden moved a booking. Mirrors the reason_code CHECK on
 * hostel_cleaning_booking_reschedules and the same list inside
 * fn_cl_housekeeping_reschedule — all three must move together.
 */
export type RescheduleReasonCode =
  | 'cleaner_unavailable'
  | 'cleaner_on_leave'
  | 'slot_full'
  | 'learner_requested'
  | 'emergency'
  | 'other';

/**
 * One move of one booking. Never updated — a booking pushed twice has two of
 * these, and the learner is shown both.
 *
 * The cleaner NAMES are snapshots for the same reason
 * CleaningBooking.cleaner_name is one: learners must never need SELECT on
 * hostel_cleaners, which holds staff phone numbers.
 */
export interface BookingReschedule {
  id: string;
  booking_id: string;
  institution_id: string;
  from_date: string;
  from_slot_start: string;
  from_slot_end: string;
  to_date: string;
  to_slot_start: string;
  to_slot_end: string;
  from_cleaner_id: string | null;
  from_cleaner_name: string | null;
  to_cleaner_id: string | null;
  to_cleaner_name: string | null;
  reason_code: RescheduleReasonCode;
  reason_note: string | null;
  rescheduled_by: string;
  created_at: string;
}

/** A move with the warden who made it resolved to a name. */
export interface BookingRescheduleWithActor extends BookingReschedule {
  rescheduled_by_name: string | null;
}

export interface BookingPhoto {
  id: string;
  booking_id: string;
  institution_id: string;
  phase: PhotoPhase;
  drive_file_id: string;
  drive_url: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface CleaningFeedback {
  id: string;
  booking_id: string;
  institution_id: string;
  room_id: string;
  learner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

/** A rating with the rater resolved — any roommate may rate, so the name matters. */
export interface CleaningFeedbackWithLearner extends CleaningFeedback {
  learner_name: string | null;
}

/** The person a profiles.id points at, as the booking detail view needs them. */
export interface BookingPerson {
  id: string;
  full_name: string | null;
  email: string | null;
  gender: string | null;
}

/**
 * Everything behind one booking, for the admin detail dialog.
 *
 * `booking` carries the SNAPSHOT columns (type_name, duration_minutes,
 * expected_cost_inr, cleaner_name) — what was true when it was booked and what
 * history must keep. `type` is the CURRENT catalogue row, which may since have
 * been renamed, repriced or deactivated; the dialog labels the two differently
 * on purpose.
 */
export interface BookingDetail {
  booking: BookingBoardRow;
  learner: BookingPerson | null;
  assigned_by: BookingPerson | null;
  cancelled_by: BookingPerson | null;
  waived_by: BookingPerson | null;
  room: {
    room_number: string | null;
    floor: number | null;
    room_type: string | null;
    capacity: number | null;
    has_attached_bathroom: boolean | null;
    category_name: string | null;
  } | null;
  block: { name: string | null; hostel_type: string | null } | null;
  institution_name: string | null;
  type: {
    description: string | null;
    usage_limit_count: number;
    usage_period: UsagePeriod;
    is_active: boolean;
  } | null;
  photos: BookingPhoto[];
  feedback: CleaningFeedbackWithLearner[];
  /** Every move this booking has made, oldest first. Empty for most bookings. */
  reschedules: BookingRescheduleWithActor[];
}

/**
 * One learner currently attendance-blocked by an unrated cleaning.
 * Shaped to mirror the academic side's LeaveBlockInfo so the attendance mark
 * page can render a housekeeping hold and a leave block through one banner.
 */
export interface FeedbackHold {
  learner_id: string;
  room_id: string;
  booking_id: string;
  booking_date: string;
  type_name: string;
}

/**
 * The caller's own live allocation, as the learner surface needs it.
 * allocation_id/room_id/block_id/institution_id come straight from
 * hostel_allocations; category_id is the SEATED room's category, which is the
 * axis cleaning-type eligibility is decided on.
 */
export interface MyAllocation {
  allocation_id: string;
  room_id: string;
  block_id: string;
  institution_id: string;
  room_number: string | null;
  category_id: string | null;
}

export interface Slot {
  slot_start: string;
  slot_end: string;
  remaining_capacity: number;
  is_bookable: boolean;
  reason: string | null;
}

export type SlotGridResult =
  | { open: true; slots: Slot[] }
  | { open: false; reason: string; slots: [] };

export type BookResult =
  | { success: true; booking_id: string; slot_end: string }
  | { success: false; error_code: string; used?: number; allowed?: number };

export type CancelResult = { success: true } | { success: false; error_code: string };

export type AssignResult =
  | { success: true; status: BookingStatus; cleaner_name?: string }
  | { success: false; error_code: string };

export type RescheduleResult =
  | {
      success: true;
      status: BookingStatus;
      booking_date: string;
      slot_start: string;
      slot_end: string;
      cleaner_name: string | null;
    }
  | { success: false; error_code: string };

/**
 * Narrowing helper for the RPC result unions.
 *
 * `if (result.success) {} else { result.error_code }` does NOT narrow in this
 * repo: tsconfig has `strict` (and so `strictNullChecks`) off, which weakens
 * discriminated-union narrowing on a boolean discriminant. This predicate
 * narrows explicitly and works regardless of the strictness setting.
 */
export function isRpcFailure<T extends { success: boolean }>(
  result: T,
): result is Extract<T, { success: false }> {
  return result.success === false;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export type CleaningExpenseInput = Pick<
  CleaningTypeExpense,
  'item_name' | 'unit' | 'quantity' | 'unit_cost_inr'
> & { sort_order?: number };

export interface CreateCleaningTypeDto {
  name: string;
  description?: string | null;
  duration_minutes: number;
  usage_limit_count: number;
  usage_period: UsagePeriod;
  is_active?: boolean;
  sort_order?: number;
  category_ids: string[];
  expenses: CleaningExpenseInput[];
}

export type UpdateCleaningTypeDto = Partial<CreateCleaningTypeDto>;

export interface CreateCleanerDto {
  full_name: string;
  phone?: string | null;
  gender?: 'Male' | 'Female' | 'Other' | null;
  employee_code?: string | null;
  working_days: number[];
  shift_start?: string | null;
  shift_end?: string | null;
  is_active?: boolean;
  notes?: string | null;
  block_ids: string[];
}

export type UpdateCleanerDto = Partial<CreateCleanerDto>;

export interface RescheduleBookingDto {
  bookingId: string;
  /** The new date, YYYY-MM-DD. */
  date: string;
  /** The new slot's start, HH:MM. slot_end is derived from the type's duration. */
  slotStart: string;
  reasonCode: RescheduleReasonCode;
  reasonNote?: string | null;
  /** Pick a different cleaner. Omit to keep whoever is already on the booking. */
  cleanerId?: string | null;
  /** Leave the booking with no cleaner, returning it to 'booked'. */
  clearCleaner?: boolean;
}

export interface UpsertAvailabilityDto {
  block_id: string;
  weekday: number;
  is_open: boolean;
  window_start: string;
  window_end: string;
  capacity: number;
}
