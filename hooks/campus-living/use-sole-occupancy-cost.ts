'use client';

import { useCurrentHostelYear } from '@/hooks/campus-living/use-hostel-years';
import { useFeeQuote } from '@/hooks/campus-living/use-allocation-eligibility';

/**
 * What one learner pays alone in a room vs. what she'd pay if every bed filled.
 *
 * Both numbers come from POST /api/campus-living/fee-quote (quoteUpfrontFee) —
 * the UI NEVER re-implements the split. Two quotes on the same room: one at
 * activeOccupants = 1, one at activeOccupants = capacity.
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
  /** Annual total for this learner as the room's only occupant. */
  aloneTotal: number | null;
  /** Annual total for this learner once every bed is taken. */
  fullTotal: number | null;
  /** aloneTotal − fullTotal when positive; null when there is no difference. */
  extraCost: number | null;
  /** True only when both quotes resolved AND alone costs more than full. */
  ready: boolean;
  loading: boolean;
}

export function useSoleOccupancyCost(params: {
  roomId: string | null | undefined;
  roomCategoryId: string | null | undefined;
  capacity: number | null | undefined;
  messCategoryId?: string | null;
}): SoleOccupancyCost {
  const { roomId, roomCategoryId, capacity, messCategoryId } = params;
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

  const alone = useFeeQuote(base ? { ...base, activeOccupants: 1 } : null);
  const full = useFeeQuote(base ? { ...base, activeOccupants: capacity! } : null);

  const aloneTotal = alone.data?.breakdown.total_annual ?? null;
  const fullTotal = full.data?.breakdown.total_annual ?? null;
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
