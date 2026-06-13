/**
 * BoS Remuneration / TA-DA rates per the institution-wide SOP.
 *
 * Source of truth for the auto-generated claim amounts produced by the
 * attendance route (POST /api/bos/meetings/[id]/attendance). The manual
 * "New Claim" UX was retired in 2026-05-21 in favour of attendance-driven
 * generation; these constants encode the SOP so the same rule fires for
 * every present attendee without per-meeting data entry.
 *
 * If the SOP changes, edit this file. Migration is deliberately *not*
 * needed — `bos_ta_da_claims.honorarium_amount` stores the computed
 * value at generation time, so old claims keep their historical amounts.
 */

export const TA_DA_RATES = {
  /** Honorarium for external members (any expert_id set on the member). */
  honorariumExternal: 1500,
  /** Honorarium for internal members (staff_id set, expert_id null). */
  honorariumInternal: 1000,
  /** Per-kilometre TA rate. Applied to round-trip distance (one-way × 2). */
  travelPerKm: 5,
} as const;

export interface ComputeClaimInput {
  /** True when the member is external (member.expert_id IS NOT NULL). */
  isExternal: boolean;
  /**
   * One-way distance in km from the external expert to the institution.
   * Sourced from bos_external_experts.distance_km (mirrored onto
   * bos_members.display_distance_km by the sync trigger). Null/undefined
   * means no TA component — the claim still receives honorarium.
   *
   * Ignored for internal members (TA is external-only per SOP).
   */
  oneWayKm: number | null | undefined;
}

export interface ClaimAmounts {
  honorarium: number;
  travel: number;
  total: number;
}

/**
 * Compute the SOP-aligned amounts for an auto-generated TA/DA claim.
 *
 * Rules:
 *   • Honorarium: ₹1,500 external, ₹1,000 internal — always paid when
 *     the member is marked present + ta_da_eligible.
 *   • Travel:  external only. round_trip_km × ₹5/km, where round-trip
 *     is `oneWayKm × 2`. Internal members get 0 travel.
 *   • Total:   honorarium + travel.
 *
 * Pure function — no I/O, no DB access. Safe to call from both server
 * (auto-generation post-step) and client (read-only display preview).
 */
export function computeClaimAmounts(input: ComputeClaimInput): ClaimAmounts {
  const honorarium = input.isExternal
    ? TA_DA_RATES.honorariumExternal
    : TA_DA_RATES.honorariumInternal;

  const travel =
    input.isExternal && input.oneWayKm && input.oneWayKm > 0
      ? input.oneWayKm * 2 * TA_DA_RATES.travelPerKm
      : 0;

  return {
    honorarium,
    travel,
    total: honorarium + travel,
  };
}
