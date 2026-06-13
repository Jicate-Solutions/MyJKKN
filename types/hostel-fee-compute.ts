/**
 * Hostel upfront fractional-occupancy fee compute — input + output types.
 *
 * Compute model locked 2026-05-28 (see platform_policies `fractional_occupancy.*`
 * and `hostel.room.ac_*` rows). The fee for ONE learner in a room is:
 *
 *   base_share  = full_room_annual_cost / active_occupants
 *   ac_share    = (tonnage × base_inr_per_month_24h × 12) / active_occupants   (AC rooms only)
 *   mess_fee    = chosen mess category annual rate, FLAT per learner (NOT divided)
 *   total       = base_share + ac_share + mess_fee
 *
 * FEE BASIS (discovered, 2026-05-28): `hostel_fees.amount` for a
 * hostel_category row is the PER-BED annual rate. Confirmed by policy rows:
 *   fractional_occupancy.multiplier_cap → "Sole occupant of a 6-bed room pays
 *     6× the per-bed base rate."
 *   fractional_occupancy.trigger_model → "Classic stays at flat per-bed price
 *     regardless of occupancy."
 * Therefore: full_room_annual_cost = per_bed_annual_rate × room_capacity.
 */

export const HOSTEL_FEE_CURRENCY = 'INR' as const;

/** Resolved AC config (shape stored in hostel_*_billable_amenities config / view). */
export interface AcConfig {
  /** AC capacity in tons (a multiplier on the per-ton monthly cost). */
  tonnage: number;
  /** Base INR cost per month assuming 24h running, per ton. */
  base_inr_per_month_24h: number;
}

/**
 * Pure-compute input. All values are already-fetched primitives — no DB
 * handles. This is what makes the core engine unit-testable.
 */
export interface FeeComputeInput {
  /** PER-BED annual rate for the room's hostel category (from hostel_fees.amount). */
  perBedAnnualRate: number;
  /** Room bed count (hostel_rooms.capacity). full_room_annual = perBedAnnualRate × roomCapacity. */
  roomCapacity: number;
  /** Active (paying) occupants the room cost is split among. Guarded to ≥ 1. */
  activeOccupants: number;
  /** Resolved AC config if the room has an active AC billable amenity; null otherwise. */
  acConfig?: AcConfig | null;
  /** Annual mess category rate, flat per learner. 0 if learner picked no mess / no fee configured. */
  messAnnualFee?: number;
}

/** Fee breakdown returned by the pure compute. All money rounded to nearest rupee. */
export interface FeeBreakdown {
  /** Learner's share of the room base cost (annual). */
  base_share: number;
  /** Learner's share of the AC cost (annual). 0 if non-AC room. */
  ac_share: number;
  /** Flat mess fee for the learner (annual). NOT divided by occupants. */
  mess_fee: number;
  /** base_share + ac_share + mess_fee. */
  total_annual: number;
  /** Currency code (always INR for hostel fees). */
  currency: typeof HOSTEL_FEE_CURRENCY;
  /** Human-readable explanation lines for the quote UI / audit trail. */
  basis: string[];
}

/** Hostel year window for pro-rata anchoring (from hostel_years). */
export interface HostelYearWindow {
  /** ISO date string (YYYY-MM-DD), e.g. June 1. */
  start_date: string;
  /** ISO date string (YYYY-MM-DD), e.g. May 31. */
  end_date: string;
}

/** Pro-rata result for a mid-year join. */
export interface ProRataResult {
  /** Whole months remaining from the join month through the hostel-year end month (inclusive). */
  remaining_months: number;
  /** total_annual × remaining_months / 12, rounded to nearest rupee. */
  prorated_total: number;
  basis: string[];
}

/** Async quote-endpoint input — IDs the fetch wrapper resolves to compute primitives. */
export interface QuoteUpfrontFeeInput {
  roomId: string;
  /** hostel_fees row's hostel_category to price the room base. */
  roomCategoryId: string;
  activeOccupants: number;
  /** Optional mess category; if omitted, mess_fee = 0. */
  messCategoryId?: string | null;
  hostelYearId: string;
  /** Optional mid-year join date (YYYY-MM-DD). If given, the quote includes pro-rata. */
  joinDate?: string | null;
}

/** Quote-endpoint output: the full-year breakdown plus optional pro-rata. */
export interface QuoteUpfrontFeeResult {
  breakdown: FeeBreakdown;
  prorata?: ProRataResult;
  hostelYear: HostelYearWindow;
}
