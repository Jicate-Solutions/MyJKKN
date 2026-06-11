/**
 * Housekeeping slot-booking policy-key constants (Housekeeping Booking Agent B, 2026-06-10).
 *
 * These 7 keys are the contract with the platform_policies rows seeded by Agent A's
 * migration (supabase/migrations/20260610190000_housekeeping_slot_booking.sql).
 * Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"Policy rows".
 * Every booking knob (slot length, daily window, capacity, advance window,
 * cancellation cutoff, per-tier weekly quota, master kill-switch) is a config
 * row the RPCs read at runtime via fn_get_policy — the Director edits a value
 * in the settings UI and the next page load reflects it, zero deploys. Keep
 * these strings in sync with the migration — they are the source of truth the
 * RPCs read at runtime.
 */
export const HOUSEKEEPING_POLICY_KEYS = {
  /** Length of one bookable slot in minutes (Director-stated: 10). */
  SLOT_DURATION_MINUTES: 'housekeeping.slot_duration_minutes',
  /** Daily cleaning window — jsonb {"start":"09:00","end":"17:00"}. */
  SERVICE_WINDOW: 'housekeeping.service_window',
  /** Parallel cleanings a block supports per slot (≈ staff on duty). */
  CAPACITY_PER_SLOT_PER_BLOCK: 'housekeeping.capacity_per_slot_per_block',
  /** How far ahead residents may book, in days. */
  BOOKING_ADVANCE_DAYS: 'housekeeping.booking_advance_days',
  /** Latest cancel before slot start, in minutes. */
  CANCELLATION_CUTOFF_MINUTES: 'housekeeping.cancellation_cutoff_minutes',
  /** Included bookings/week per tier_key — jsonb {"standard":0,"premium":2,"premium_plus":5}; 0 = not bookable. */
  WEEKLY_QUOTA_BY_TIER: 'housekeeping.weekly_quota_by_tier',
  /** Master kill-switch for the whole booking feature. */
  BOOKING_ENABLED: 'housekeeping.booking_enabled',
} as const;

export type HousekeepingPolicyKey =
  (typeof HOUSEKEEPING_POLICY_KEYS)[keyof typeof HOUSEKEEPING_POLICY_KEYS];
