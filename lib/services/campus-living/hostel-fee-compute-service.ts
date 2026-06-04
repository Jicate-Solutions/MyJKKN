/**
 * Hostel upfront fractional-occupancy fee compute engine — PR δ.
 *
 * PURE compute (no DB writes). Two layers:
 *   1. Pure functions (computeFeeBreakdown, computeProRata, computeUpgradeDifferential)
 *      take explicit primitives and return typed results — fully unit-testable.
 *   2. A thin async wrapper (quoteUpfrontFee) fetches the rows then calls the pure
 *      compute. Fetch and compute are kept separable.
 *
 * Compute model locked 2026-05-28 (platform_policies fractional_occupancy.* / hostel.room.ac_*):
 *   base_share = (perBedAnnualRate × roomCapacity) / activeOccupants     (decision 1-4)
 *   ac_share   = (tonnage × base_inr_per_month_24h × 12) / activeOccupants (decisions 26-29; AC rooms only)
 *   mess_fee   = chosen mess category annual rate, FLAT per learner       (decision 10)
 *   total      = base_share + ac_share + mess_fee
 *
 * FEE BASIS DISCOVERY: hostel_fees.amount (for a hostel_category) is the
 * PER-BED annual rate — confirmed by fractional_occupancy.multiplier_cap policy
 * ("sole occupant of a 6-bed room pays 6× the per-bed base rate"). So the full
 * room cost = per_bed × capacity, recovered by the room and split among active
 * occupants. *** This is the load-bearing assumption — see PR body. ***
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  HOSTEL_FEE_CURRENCY,
  type AcConfig,
  type FeeBreakdown,
  type FeeComputeInput,
  type HostelYearWindow,
  type ProRataResult,
  type QuoteUpfrontFeeInput,
  type QuoteUpfrontFeeResult,
} from '@/types/hostel-fee-compute';

const HOSTEL_YEAR_MONTHS = 12;

/** Round to nearest rupee. */
function rupees(n: number): number {
  return Math.round(n);
}

/** Active occupants are guarded to ≥ 1 (divide-by-zero safety; decision 4 = no cap). */
function safeOccupants(activeOccupants: number): number {
  if (!Number.isFinite(activeOccupants) || activeOccupants < 1) return 1;
  return Math.floor(activeOccupants);
}

/** Annual AC cost for the whole room (before splitting), 0 when no AC config. */
function acRoomAnnualCost(acConfig?: AcConfig | null): number {
  if (!acConfig) return 0;
  const tonnage = Number(acConfig.tonnage) || 0;
  const perMonth24h = Number(acConfig.base_inr_per_month_24h) || 0;
  if (tonnage <= 0 || perMonth24h <= 0) return 0;
  // base_inr_per_month_24h is monthly → × 12 for annual; tonnage is a multiplier.
  return tonnage * perMonth24h * 12;
}

/**
 * Core pure compute for ONE learner in a room.
 * No DB, no IO, no rounding surprises — deterministic given the input.
 */
export function computeFeeBreakdown(input: FeeComputeInput): FeeBreakdown {
  const occupants = safeOccupants(input.activeOccupants);
  const perBed = Number(input.perBedAnnualRate) || 0;
  const capacity = Math.max(1, Math.floor(Number(input.roomCapacity) || 1));
  const messFee = rupees(Number(input.messAnnualFee) || 0);

  const fullRoomAnnual = perBed * capacity;
  const base_share = rupees(fullRoomAnnual / occupants);

  const acAnnual = acRoomAnnualCost(input.acConfig);
  const ac_share = rupees(acAnnual / occupants);

  const total_annual = base_share + ac_share + messFee;

  const basis: string[] = [];
  basis.push(
    `Base: ₹${perBed} per bed × ${capacity} beds = ₹${fullRoomAnnual} room / ${occupants} active occupant${occupants === 1 ? '' : 's'} = ₹${base_share}`
  );
  if (acAnnual > 0) {
    basis.push(
      `AC: ${input.acConfig?.tonnage} ton × ₹${input.acConfig?.base_inr_per_month_24h}/mo (24h) × 12 = ₹${acAnnual} room / ${occupants} active occupant${occupants === 1 ? '' : 's'} = ₹${ac_share}`
    );
  } else {
    basis.push('AC: none (non-AC room) = ₹0');
  }
  basis.push(`Mess: ₹${messFee} flat per learner (not split)`);
  basis.push(`Total upfront (annual): ₹${total_annual}`);

  return {
    base_share,
    ac_share,
    mess_fee: messFee,
    total_annual,
    currency: HOSTEL_FEE_CURRENCY,
    basis,
  };
}

/** 0-based month index helper from an ISO date (YYYY-MM-DD), UTC-safe. */
function monthIndexUTC(isoDate: string): { year: number; month: number } {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * Whole months remaining from joinDate through the hostel-year end (inclusive),
 * clamped to [0, 12]. A join in the start month → 12; a join in the end month → 1.
 */
export function remainingWholeMonths(
  joinDate: string,
  hostelYear: HostelYearWindow
): number {
  const join = monthIndexUTC(joinDate);
  const end = monthIndexUTC(hostelYear.end_date);
  const joinAbs = join.year * 12 + join.month;
  const endAbs = end.year * 12 + end.month;
  const remaining = endAbs - joinAbs + 1; // inclusive of the join month
  if (remaining <= 0) return 0;
  if (remaining > HOSTEL_YEAR_MONTHS) return HOSTEL_YEAR_MONTHS;
  return remaining;
}

/**
 * Pro-rata a full-year total for a mid-year join.
 * prorated = total_annual × remaining_whole_months / 12 (rounded to rupee).
 */
export function computeProRata(
  totalAnnual: number,
  joinDate: string,
  hostelYear: HostelYearWindow
): ProRataResult {
  const remaining_months = remainingWholeMonths(joinDate, hostelYear);
  const prorated_total = rupees((Number(totalAnnual) || 0) * (remaining_months / HOSTEL_YEAR_MONTHS));
  return {
    remaining_months,
    prorated_total,
    basis: [
      `Pro-rata: ₹${rupees(totalAnnual)} annual × ${remaining_months}/${HOSTEL_YEAR_MONTHS} months remaining = ₹${prorated_total}`,
    ],
  };
}

/**
 * Mid-year upgrader differential (decision 7):
 *   diff = (Premium total pro-rata) − (Classic total pro-rata) for remaining months.
 * Floored at 0 (never bill a negative differential).
 */
export function computeUpgradeDifferential(
  classicCtx: FeeComputeInput,
  premiumCtx: FeeComputeInput,
  fromDate: string,
  hostelYear: HostelYearWindow
): {
  classic_prorata: number;
  premium_prorata: number;
  differential: number;
  basis: string[];
} {
  const classicTotal = computeFeeBreakdown(classicCtx).total_annual;
  const premiumTotal = computeFeeBreakdown(premiumCtx).total_annual;
  const classic_prorata = computeProRata(classicTotal, fromDate, hostelYear).prorated_total;
  const premium_prorata = computeProRata(premiumTotal, fromDate, hostelYear).prorated_total;
  const differential = Math.max(0, premium_prorata - classic_prorata);
  return {
    classic_prorata,
    premium_prorata,
    differential,
    basis: [
      `Premium pro-rata ₹${premium_prorata} − Classic pro-rata ₹${classic_prorata} = differential ₹${differential}`,
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Async fetch wrapper — resolves IDs to compute primitives, then calls pure compute.
// Kept thin and separate so the math above stays unit-testable without a DB.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Fetch the needed rows for a quote, then call the pure compute. Read-only.
 * Throws on missing room / hostel year (genuine bad input); a missing fee row
 * resolves to 0 for that component and is reflected in `basis`.
 */
export async function quoteUpfrontFee(
  input: QuoteUpfrontFeeInput
): Promise<QuoteUpfrontFeeResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Hostel year window (anchors pro-rata; June–May per hostel.year.start_month).
  const { data: yearRow, error: yearErr } = await supabase
    .from('hostel_years')
    .select('start_date, end_date')
    .eq('id', input.hostelYearId)
    .single();
  if (yearErr || !yearRow) {
    logger.error('campus-living/fee-compute', 'Hostel year not found', yearErr);
    throw new Error('Hostel year not found');
  }
  const hostelYear: HostelYearWindow = {
    start_date: yearRow.start_date,
    end_date: yearRow.end_date,
  };

  // 2. Room capacity (bed count).
  const { data: roomRow, error: roomErr } = await supabase
    .from('hostel_rooms')
    .select('capacity')
    .eq('id', input.roomId)
    .single();
  if (roomErr || !roomRow) {
    logger.error('campus-living/fee-compute', 'Room not found', roomErr);
    throw new Error('Room not found');
  }
  const roomCapacity = Number(roomRow.capacity) || 1;

  // 3. PER-BED annual rate for the room's hostel category (additive fee row).
  const { data: baseFee } = await supabase
    .from('hostel_fees')
    .select('amount, frequency')
    .eq('hostel_year_id', input.hostelYearId)
    .eq('hostel_category_id', input.roomCategoryId)
    .eq('is_active', true)
    .maybeSingle();
  const perBedAnnualRate = baseFee ? annualize(Number(baseFee.amount), baseFee.frequency) : 0;

  // 4. Mess category annual fee (flat per learner) — same hostel_fees table.
  let messAnnualFee = 0;
  if (input.messCategoryId) {
    const { data: messFee } = await supabase
      .from('hostel_fees')
      .select('amount, frequency')
      .eq('hostel_year_id', input.hostelYearId)
      .eq('mess_category_id', input.messCategoryId)
      .eq('is_active', true)
      .maybeSingle();
    messAnnualFee = messFee ? annualize(Number(messFee.amount), messFee.frequency) : 0;
  }

  // 5. Resolved AC config via the effective-amenities view (override → block default).
  const { data: amenities } = await supabase
    .from('v_room_effective_billable_amenities')
    .select('code, fee_calculation_type, effective_config')
    .eq('room_id', input.roomId)
    .eq('code', 'air_conditioner');
  const acRow = (amenities ?? [])[0];
  const acConfig: AcConfig | null = acRow?.effective_config
    ? {
        tonnage: Number((acRow.effective_config as Record<string, unknown>).tonnage) || 0,
        base_inr_per_month_24h:
          Number((acRow.effective_config as Record<string, unknown>).base_inr_per_month_24h) || 0,
      }
    : null;

  const breakdown = computeFeeBreakdown({
    perBedAnnualRate,
    roomCapacity,
    activeOccupants: input.activeOccupants,
    acConfig,
    messAnnualFee,
  });

  const prorata = input.joinDate
    ? computeProRata(breakdown.total_annual, input.joinDate, hostelYear)
    : undefined;

  return { breakdown, prorata, hostelYear };
}

/** Normalise a fee amount to an annual figure based on its stored frequency. */
function annualize(amount: number, frequency: string | null | undefined): number {
  const a = Number(amount) || 0;
  switch (frequency) {
    case 'monthly':
      return a * 12;
    case 'semester':
      return a * 2;
    case 'annual':
    case 'one_time':
    default:
      return a;
  }
}
