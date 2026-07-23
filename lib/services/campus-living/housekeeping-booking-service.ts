import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { HOUSEKEEPING_POLICY_KEYS } from '@/lib/services/campus-living/housekeeping-policy-keys';

// ── Housekeeping slot booking (table: hostel_cleaning_bookings) ────────────
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md
// Migration (Agent A): supabase/migrations/20260610190000_housekeeping_slot_booking.sql
//
// Premium residents book 10-minute room-cleaning slots. Slots are COMPUTED
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
// profiles.learner_id when both are needed (see getMyEntitlement).

export type HousekeepingBookingStatus =
  | 'booked'
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
  room_number: string | null;
  block_name: string | null;
  learner_name: string | null;
}

/** Composed entitlement state for the current user (see getMyEntitlement). */
export interface EntitlementResult {
  /** True when tier_features has 'book_housekeeping_slots' AND weekly quota > 0. */
  entitled: boolean;
  /** hostel_tier_policy.tier_key ('standard' when allocation has no tier row). */
  tierKey: string | null;
  weeklyQuota: number;
  /** Own bookings this ISO week with status in ('booked','completed'). */
  usedThisWeek: number;
  /** Set only when entitled === false. */
  reason?: 'no_active_allocation' | 'tier_not_entitled' | 'no_weekly_quota';
}

/** Seeded defaults mirror the migration — used only if the policy read fails. */
const DEFAULT_QUOTA_BY_TIER: Record<string, number> = {
  standard: 0,
  premium: 2,
  premium_plus: 5,
};

/** Tier feature flag the migration appends to premium/premium_plus tiers. */
const BOOKING_FEATURE_KEY = 'book_housekeeping_slots';

/** Monday→Sunday date range (local) of the ISO week containing `ref`. */
function isoWeekRange(ref: Date): { start: string; end: string } {
  const monday = new Date(ref);
  // getDay(): 0=Sun..6=Sat → distance back to Monday is (day + 6) % 7.
  monday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

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

  // ── Staff day board ────────────────────────────────────────────────
  static async getBookingBoard(
    institutionId: string,
    date: string
  ): Promise<BookingBoardRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_housekeeping_booking_board',
        { p_institution_id: institutionId, p_date: date }
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

  // ── Entitlement ────────────────────────────────────────────────────
  /**
   * Composed client reads (no RPC): active allocation → tier feature flag +
   * weekly quota policy row + own usage count this ISO week.
   *
   * "No active allocation" is a clean non-error state — staff, day scholars
   * and residents whose allocation is still pending_approval all land there.
   */
  static async getMyEntitlement(): Promise<EntitlementResult> {
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return {
          entitled: false,
          tierKey: null,
          weeklyQuota: 0,
          usedThisWeek: 0,
          reason: 'no_active_allocation',
        };
      }

      // 1. Active allocation (hostel_allocations.learner_id FKs profiles = auth uid).
      const { data: allocation, error: allocError } = await supabase
        .from('hostel_allocations')
        .select('id, tier_id')
        .eq('learner_id', user.id)
        .eq('status', 'active')
        .order('allocation_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (allocError) {
        logger.error('campus-living/housekeeping', 'Failed to fetch active allocation', allocError);
        throw allocError;
      }
      if (!allocation) {
        return {
          entitled: false,
          tierKey: null,
          weeklyQuota: 0,
          usedThisWeek: 0,
          reason: 'no_active_allocation',
        };
      }

      // 2. Tier row → tier_key + booking feature flag (no tier row = standard).
      let tierKey = 'standard';
      let hasFeature = false;
      if (allocation.tier_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tier, error: tierError } = await (supabase as any)
          .from('hostel_tier_policy')
          .select('tier_key, tier_features')
          .eq('id', allocation.tier_id)
          .maybeSingle();
        if (tierError) {
          logger.error('campus-living/housekeeping', 'Failed to fetch tier policy', tierError);
          throw tierError;
        }
        if (tier) {
          tierKey = tier.tier_key as string;
          hasFeature =
            Array.isArray(tier.tier_features) &&
            (tier.tier_features as string[]).includes(BOOKING_FEATURE_KEY);
        }
      }

      // 3. Weekly quota by tier — single global policy row via the canonical
      //    reader; falls back to the seeded defaults if the read fails.
      let quotaByTier: Record<string, number> = DEFAULT_QUOTA_BY_TIER;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: quotaValue, error: quotaError } = await (supabase as any).rpc(
        'fn_get_policy',
        { p_key: HOUSEKEEPING_POLICY_KEYS.WEEKLY_QUOTA_BY_TIER, p_scope_id: null }
      );
      if (quotaError) {
        logger.warn('campus-living/housekeeping', 'Quota policy read failed, using defaults', {
          error: quotaError.message,
        });
      } else if (quotaValue && typeof quotaValue === 'object' && !Array.isArray(quotaValue)) {
        quotaByTier = quotaValue as Record<string, number>;
      }
      const rawQuota = quotaByTier[tierKey];
      const weeklyQuota = typeof rawQuota === 'number' && Number.isFinite(rawQuota) ? rawQuota : 0;

      // 4. Own bookings this ISO week (booked + completed count against quota).
      //    Bookings key on learners_profiles.id — bridge via profiles.learner_id.
      let usedThisWeek = 0;
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) {
        logger.error('campus-living/housekeeping', 'Failed to fetch profile learner_id', profileError);
        throw profileError;
      }
      const learnerProfileId = profileRow?.learner_id as string | null | undefined;
      if (learnerProfileId) {
        const { start, end } = isoWeekRange(new Date());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error: countError } = await (supabase as any)
          .from('hostel_cleaning_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('learner_id', learnerProfileId)
          .gte('booking_date', start)
          .lte('booking_date', end)
          .in('status', ['booked', 'completed']);
        if (countError) {
          logger.error('campus-living/housekeeping', 'Failed to count weekly bookings', countError);
          throw countError;
        }
        usedThisWeek = count ?? 0;
      }

      const entitled = hasFeature && weeklyQuota > 0;
      if (entitled) {
        return { entitled, tierKey, weeklyQuota, usedThisWeek };
      }
      return {
        entitled,
        tierKey,
        weeklyQuota,
        usedThisWeek,
        reason: !hasFeature ? 'tier_not_entitled' : 'no_weekly_quota',
      };
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getMyEntitlement', error);
      throw error;
    }
  }
}
