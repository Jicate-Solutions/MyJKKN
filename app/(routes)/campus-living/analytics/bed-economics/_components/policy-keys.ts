/**
 * Bed Economics policy-key constants (Bed Economics PR B, 2026-06-07).
 *
 * These 7 keys are the contract with the platform_policies rows seeded by PR A's
 * migration (supabase/migrations/20260607120000_bed_economics_substrate.sql,
 * §7.1). PR C mirrors them into lib/policies/keys.ts as the canonical registry;
 * PR B (this dashboard) reads/writes them by string until then. Keep both in
 * sync — the strings are the source of truth the RPCs read at runtime.
 */
export const BED_ECON_POLICY_KEYS = {
  DENOMINATOR: 'bed_econ.denominator',
  INCLUDE_MESS_IN_REVENUE: 'bed_econ.include_mess_in_revenue',
  SELLABLE_ROOM_PURPOSES: 'bed_econ.sellable_room_purposes',
  OCCUPANCY_TARGET_PCT: 'bed_econ.occupancy_target_pct',
  COLLECTION_TARGET_PCT: 'bed_econ.collection_target_pct',
  STALE_VACANCY_DAYS: 'bed_econ.stale_vacancy_days',
  HOUSEKEEPING_COST_PER_ROOM_MONTH: 'bed_econ.housekeeping_cost_per_room_month',
} as const;

export type BedEconPolicyKey =
  (typeof BED_ECON_POLICY_KEYS)[keyof typeof BED_ECON_POLICY_KEYS];
