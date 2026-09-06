import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Housekeeping slot booking (table: hostel_cleaning_bookings) ────────────
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md
// Migration (Agent A): supabase/migrations/20260610190000_housekeeping_slot_booking.sql
// Entitlement rework: supabase/migrations/20260825120000_housekeeping_entitlement_by_room_category.sql
//
// Premium-room residents book 10-minute room-cleaning slots. Slots are COMPUTED
// server-side (service window ÷ slot_duration − bookings), never materialized;
// every knob is a platform_policies row (see housekeeping-policy-keys.ts) so
// the Director can retune without a deploy. Booking WRITES go through
// SECURITY DEFINER RPCs (atomic entitlement/quota/capacity/window validation
// with caller-derived identity); READS use the client `.from()` with RLS
// (residents see own rows; staff via campus_living.housekeeping.* permissions).
//
// Identity chain reminder: hostel_allocations.learner_id FKs profiles
// (= auth.users.id), while hostel_cleaning_bookings.learner_id FKs
// learners_profiles (denormalized for RLS speed) — bridge via
// profiles.learner_id when both are needed.

export type HousekeepingBookingStatus =
  | 'booked'
  | 'assigned'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Statuses staff may set from the day board (fn_housekeeping_mark_booking). */
export type MarkableBookingStatus = 'completed' | 'no_show';

/** Row shape of hostel_cleaning_bookings (per spec DDL). */
export interface HostelCleaningBooking {
  id: string;
  institution_id: string;
  block_id: string;
  room_id: string;
  allocation_id: string;
  /** learners_profiles.id (NOT profiles.id — see identity chain note above). */
  learner_id: string;
  /** ISO date 'YYYY-MM-DD'. */
  booking_date: string;
  /** Time 'HH:MM:SS' (postgres time). */
  slot_start: string;
  slot_end: string;
  status: HousekeepingBookingStatus | string;
  notes: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  /** profiles.id of the assigned cleaner (NULL for free-text-only assignees). */
  assigned_profile_id: string | null;
  /** Display name — resolved from profiles.full_name or typed free-text. */
  assigned_staff_name: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
}

/** One computed slot from fn_housekeeping_available_slots. */
export interface AvailableSlot {
  /** 'HH:MM'. */
  start: string;
  /** 'HH:MM'. */
  end: string;
  capacity: number;
  booked: number;
  available: boolean;
}

/** Return shape of fn_housekeeping_available_slots. */
export interface AvailableSlotsResult {
  date: string;
  slot_minutes: number;
  window: { start: string; end: string };
  enabled: boolean;
  slots: AvailableSlot[];
}

/** Error codes fn_housekeeping_book_slot may return (per spec contract). */
export type HousekeepingBookingErrorCode =
  | 'disabled'
  | 'no_active_allocation'
  | 'tier_not_entitled'
  | 'quota_exhausted'
  | 'slot_full'
  | 'outside_window'
  | 'too_far_ahead'
  | 'past_slot'
  | 'duplicate';

/** Return shape of fn_housekeeping_book_slot. */
export type BookSlotResult =
  | { success: true; booking_id: string; error_code?: never; message?: string }
  | {
      success: false;
      booking_id?: never;
      error_code: HousekeepingBookingErrorCode | string;
      message?: string;
    };

/** Return shape of fn_housekeeping_cancel_booking / fn_housekeeping_mark_booking. */
export interface BookingMutationResult {
  success: boolean;
  error_code?: string;
  message?: string;
}

/** Staff/Director day-board row from fn_housekeeping_booking_board. */
export interface BookingBoardRow extends HostelCleaningBooking {
  institution_name: string | null;
  room_number: string | null;
  /** hostel_rooms.floor (text/number in prod — render as-is). */
  floor: string | number | null;
  block_name: string | null;
  learner_name: string | null;
  roll_number: string | null;
  program_name: string | null;
  phone: string | null;
  photo_url: string | null;
}

/** Date scope for the staff board: one day, a range, or (all empty) every booking. */
export interface BookingBoardParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** One row of fn_housekeeping_assignable_staff — the assign-dialog picker. */
export interface AssignableStaff {
  id: string;
  full_name: string | null;
}

/** Entitlement envelope returned verbatim by fn_housekeeping_my_entitlement. */
export interface EntitlementResult {
  /** True when the room category's tier carries the feature AND quota > 0. */
  entitled: boolean;
  /** hostel_categories.tier_key ('standard' | 'premium' | 'premium_plus'). */
  tierKey: string | null;
  /** The resident's room category, e.g. 'Premium Room' — names the refusal. */
  categoryName: string | null;
  weeklyQuota: number;
  /** Own bookings this ISO week with status in ('booked','completed'). */
  usedThisWeek: number;
  /** Set only when entitled === false. */
  reason?: 'no_active_allocation' | 'tier_not_entitled' | 'no_weekly_quota';
}

/** Shown when the RPC itself fails — never treated as an entitlement. */
const ENTITLEMENT_UNKNOWN: EntitlementResult = {
  entitled: false,
  tierKey: null,
  categoryName: null,
  weeklyQuota: 0,
  usedThisWeek: 0,
  reason: 'no_active_allocation',
};

export class HousekeepingBookingService {
  // ── Slots ──────────────────────────────────────────────────────────
  static async getAvailableSlots(
    blockId: string,
    date: string
  ): Promise<AvailableSlotsResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_available_slots',
        { p_block_id: blockId, p_date: date }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch available slots', error);
        throw error;
      }
      return data as AvailableSlotsResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getAvailableSlots', error);
      throw error;
    }
  }

  // ── Bookings (resident) ────────────────────────────────────────────
  static async bookSlot(
    date: string,
    slotStart: string,
    notes?: string
  ): Promise<BookSlotResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_book_slot',
        { p_date: date, p_slot_start: slotStart, p_notes: notes ?? null }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to book slot', error);
        throw error;
      }
      return data as BookSlotResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in bookSlot', error);
      throw error;
    }
  }

  static async cancelBooking(bookingId: string): Promise<BookingMutationResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_cancel_booking',
        { p_booking_id: bookingId }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to cancel booking', error);
        throw error;
      }
      return data as BookingMutationResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in cancelBooking', error);
      throw error;
    }
  }

  /**
   * Current user's own bookings (RLS scopes the read to own rows via the
   * profiles.learner_id chain — no explicit learner filter needed).
   */
  static async getMyBookings(fromDate?: string): Promise<HostelCleaningBooking[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = (supabase as any)
        .from('hostel_cleaning_bookings')
        .select('*');

      if (fromDate) query = query.gte('booking_date', fromDate);
      query = query
        .order('booking_date', { ascending: true })
        .order('slot_start', { ascending: true });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch my bookings', error);
        throw error;
      }
      return (data ?? []) as HostelCleaningBooking[];
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getMyBookings', error);
      throw error;
    }
  }

  // ── Staff board (one day, a range, or all bookings) ────────────────
  /**
   * `institutionId` omitted / null = every institution the caller can access
   * (the RPC applies the same per-row tenant scope RLS would). Never coerce a
   * missing id to '' here — that would be sent as a real UUID param and match
   * nothing, which is the platform's classic silent-empty-table bug.
   */
  static async getBookingBoard(
    institutionId?: string | null,
    params: BookingBoardParams = {}
  ): Promise<BookingBoardRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_booking_board',
        {
          p_institution_id: institutionId ?? null,
          p_date: params.date ?? null,
          p_date_from: params.dateFrom ?? null,
          p_date_to: params.dateTo ?? null,
        }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch booking board', error);
        throw error;
      }
      return (data ?? []) as BookingBoardRow[];
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getBookingBoard', error);
      throw error;
    }
  }

  static async markBooking(
    bookingId: string,
    status: MarkableBookingStatus
  ): Promise<BookingMutationResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_mark_booking',
        { p_booking_id: bookingId, p_status: status }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to mark booking', error);
        throw error;
      }
      return data as BookingMutationResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in markBooking', error);
      throw error;
    }
  }

  /**
   * Assign / re-assign a booking to a cleaner (fn_housekeeping_assign_booking,
   * gated on campus_living.housekeeping.schedule). Either a profile id (system
   * user) or a free-text name; `clear: true` reverts to plain 'booked'.
   */
  static async assignBooking(
    bookingId: string,
    opts: { profileId?: string | null; name?: string | null; clear?: boolean }
  ): Promise<BookingMutationResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_assign_booking',
        {
          p_booking_id: bookingId,
          p_assignee_profile_id: opts.profileId ?? null,
          p_assignee_name: opts.name ?? null,
          p_clear: opts.clear ?? false,
        }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to assign booking', error);
        throw error;
      }
      return data as BookingMutationResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in assignBooking', error);
      throw error;
    }
  }

  /** Active profiles whose roles grant '.mark_done' in this institution. */
  static async getAssignableStaff(institutionId: string): Promise<AssignableStaff[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_assignable_staff',
        { p_institution_id: institutionId }
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch assignable staff', error);
        throw error;
      }
      return (data ?? []) as AssignableStaff[];
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getAssignableStaff', error);
      throw error;
    }
  }

  // ── Entitlement ────────────────────────────────────────────────────
  /**
   * Whole entitlement envelope in ONE SECURITY DEFINER call.
   *
   * This used to be composed client-side from five queries (auth → allocation
   * → tier → policy → profile → weekly count), which duplicated the write
   * gate's rules in TypeScript and let the two drift — the client, for one,
   * computed the ISO week in browser-local time while the RPC computed it in
   * IST. fn_housekeeping_my_entitlement is now the single definition both the
   * UI gate and fn_housekeeping_book_slot read, so the meter a resident sees
   * can never disagree with the quota that rejects them.
   *
   * "No active allocation" is a clean non-error state — staff, day scholars
   * and residents whose allocation is still pending_approval all land there.
   */
  static async getMyEntitlement(): Promise<EntitlementResult> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_my_entitlement'
      );
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch entitlement', error);
        throw error;
      }
      if (!data || typeof data !== 'object') return ENTITLEMENT_UNKNOWN;
      return data as EntitlementResult;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getMyEntitlement', error);
      throw error;
    }
  }
}
