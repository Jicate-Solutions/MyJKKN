'use client';

import { useCurrentHostelYear } from '@/hooks/campus-living/use-hostel-years';
import { useFeeQuote } from '@/hooks/campus-living/use-allocation-eligibility';

/**
 * What one learner pays for the ROOM alone vs. what she'd pay if every bed
 * filled.
 *
 * Both numbers come from POST /api/campus-living/fee-quote (quoteUpfrontFee) —
 * the UI NEVER re-implements the split. Two quotes on the same room: one at
 * activeOccupants = 1, one at activeOccupants = capacity.
 *
 * ROOM CHARGE ONLY — mess is deliberately excluded (2026-08-11).
 * `breakdown.total_annual` is base_share + ac_share + mess_fee, and mess is
 * flat per learner ("not split", hostel-fee-compute-service.ts) — she pays it
 * whether the room is full or empty. Quoting the total under a sentence about
 * empty beds overstated the room and, worse, overstated what a SHARED bed
 * costs: a Premium quad reads ₹1,05,000 a bed instead of ₹42,500, so a learner
 * comparing rooms is misled by 2.5×. Mess cancels out of the difference, so
 * `extraCost` is unchanged by this — only the two endpoints move.
 *
 * This matches empty-bed-notice-service.ts, which already sums
 * `base_share + ac_share` for the notice sent to residents about the same room.
 * Before this change the two surfaces quoted different prices for one bed.
 *
 * `extraCost` is only reported when the alone-price is genuinely higher. Some
 * fee bands price flat per bed, and a room with no fee row quotes zero for both
 * — in either case the caller must show no money claim at all rather than a
 * misleading "you'll pay more".
 *
 * Everything degrades: no current hostel year, no room category, or a failed
 * quote all resolve to `ready: false` with no amounts, never an error state the
 * learner has to deal with.
 */
export interface SoleOccupancyCost {
  /**
   * Annual ROOM charge for this learner at the room's CURRENT occupancy.
   * Excludes mess. Named for the original sole-occupant case; `occupants` now
   * generalises it, so in a 2-of-4 room this is the two-way room share, not the
   * alone price.
   */
  aloneTotal: number | null;
  /** Annual ROOM charge for this learner once every bed is taken. Excludes mess. */
  fullTotal: number | null;
  /**
   * aloneTotal − fullTotal when positive; null when there is no difference.
   *
   * This is exactly what the empty beds cost her: the mess fee is flat and
   * cancels, leaving the room and AC shares she carries beyond her own bed. It
   * is the same figure the settle biller raises.
   */
  extraCost: number | null;
  /** True only when both quotes resolved AND the current share costs more. */
  ready: boolean;
  loading: boolean;
}

export function useSoleOccupancyCost(params: {
  roomId: string | null | undefined;
  roomCategoryId: string | null | undefined;
  capacity: number | null | undefined;
  messCategoryId?: string | null;
  /**
   * People living in the room right now. Defaults to 1 — the sole-occupancy
   * case this hook was written for, and what the pick-a-room notice needs,
   * since nobody is in that room yet.
   */
  occupants?: number;
}): SoleOccupancyCost {
  const { roomId, roomCategoryId, capacity, messCategoryId, occupants = 1 } = params;
  const { currentYear } = useCurrentHostelYear();

  const base =
    roomId && roomCategoryId && currentYear?.id && (capacity ?? 0) > 1
      ? {
          roomId,
          roomCategoryId,
          hostelYearId: currentYear.id,
          messCategoryId: messCategoryId ?? null,
        }
      : null;

  // Clamped: a caller mid-render can briefly hold an occupancy of 0, and the
  // quote endpoint would divide the whole room by nobody.
  const safeOccupants = Math.max(1, Math.floor(occupants || 1));

  const alone = useFeeQuote(base ? { ...base, activeOccupants: safeOccupants } : null);
  const full = useFeeQuote(base ? { ...base, activeOccupants: capacity! } : null);

  // Room charge only: base + AC, never mess. Both components divide by active
  // occupants; mess does not, so including it would inflate BOTH figures by the
  // same flat amount and misprice a shared bed.
  const roomShare = (b?: { base_share: number; ac_share: number }) =>
    b ? b.base_share + b.ac_share : null;

  const aloneTotal = roomShare(alone.data?.breakdown) ?? null;
  const fullTotal = roomShare(full.data?.breakdown) ?? null;
  const difference =
    aloneTotal !== null && fullTotal !== null && aloneTotal > fullTotal
      ? aloneTotal - fullTotal
      : null;

  return {
    aloneTotal,
    fullTotal,
    extraCost: difference,
    ready: difference !== null,
    loading: !!base && (alone.isLoading || full.isLoading),
  };
}

/** Rupees, no paise — the only money format these screens use. */
export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
