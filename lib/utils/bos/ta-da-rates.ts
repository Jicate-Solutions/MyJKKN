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

import type { BosAttendanceMode, BosTaDaTravelBasis } from '@/types/bos';

export const TA_DA_RATES = {
  /** Honorarium for external members (any expert_id set on the member). */
  honorariumExternal: 1500,
  /** Honorarium for internal members (staff_id set, expert_id null). */
  honorariumInternal: 1000,
  /** Per-kilometre TA rate. Applied to round-trip distance (one-way × 2). */
  travelPerKm: 5,
} as const;

/**
 * Reserved `bos_ta_da_rates.committee_name` meaning "this institution, every
 * council" — the institution-wide tier of the rate resolution.
 *
 * Rates are keyed (institutions_id, committee_name, member_type), which until
 * now forced an institution paying a non-SOP rate to repeat the same grid
 * under every council name — and left councils created later silently back on
 * the code constants. A row stored under this sentinel applies to all of the
 * institution's councils.
 *
 * Resolution, most specific wins:
 *   1. a row for the meeting's own council      (per-council override)
 *   2. a row under INSTITUTION_WIDE_COMMITTEE   (institution default)
 *   3. the flat TA_DA_RATES constants above     (code SOP)
 *
 * Both lookups are per MEMBER TYPE, so a council may override one type and
 * inherit the rest. Institutions that never configure anything still land on
 * (3), and existing per-council rows keep winning — the tier is additive.
 *
 * '*' is safe as a sentinel because real names come from the committee
 * dropdown (bos_committees.name), which can never produce it.
 *
 * ⚠ ALWAYS match it with `eq`, NEVER `ilike`. PostgREST rewrites '*' to '%'
 * inside like/ilike filters, so `.ilike('committee_name', '*')` compiles to
 * `ILIKE '%'` and silently matches EVERY council's rows — which would let one
 * institution's per-council config leak in as its institution-wide tier.
 * Real council names keep using `ilike` (case-insensitive exact match).
 *
 * Never render it raw — it is a storage key, not a label.
 */
export const INSTITUTION_WIDE_COMMITTEE = '*';

/** Label for the sentinel wherever a council name is shown to a user. */
export const INSTITUTION_WIDE_LABEL = 'Institution-wide (all councils)';

/** True when a stored committee_name is the institution-wide sentinel. */
export function isInstitutionWideCommittee(name: string | null | undefined): boolean {
  return name?.trim() === INSTITUTION_WIDE_COMMITTEE;
}

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
  /**
   * How the member attended (bos_meeting_attendees.attendance_mode,
   * 20260805120000). Online attendance selects the online sitting charge and
   * pays ZERO travel — a member who did not travel has no travel allowance
   * under any member type, so that rule is hardcoded here rather than being
   * a configurable column. Undefined is treated as 'offline', which is how
   * every claim generated before the migration was computed.
   */
  mode?: BosAttendanceMode;
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
 *     the member is marked present + ta_da_eligible. Unaffected by mode:
 *     the SOP quotes identical offline and online sitting charges, and a
 *     council that pays differently configures a rate row.
 *   • Travel:  external only, and offline only. round_trip_km × ₹5/km, where
 *     round-trip is `oneWayKm × 2`. Internal members get 0 travel.
 *   • Total:   honorarium + travel.
 *
 * Pure function — no I/O, no DB access. Safe to call from both server
 * (auto-generation post-step) and client (read-only display preview).
 */
export function computeClaimAmounts(input: ComputeClaimInput): ClaimAmounts {
  const honorarium = input.isExternal
    ? TA_DA_RATES.honorariumExternal
    : TA_DA_RATES.honorariumInternal;

  const isOnline = input.mode === 'online';
  const travel =
    !isOnline && input.isExternal && input.oneWayKm && input.oneWayKm > 0
      ? input.oneWayKm * 2 * TA_DA_RATES.travelPerKm
      : 0;

  return {
    honorarium,
    travel,
    total: honorarium + travel,
  };
}

/** Configured rate row shape (subset of bos_ta_da_rates the resolver needs). */
export interface TaDaRateOverride {
  /** Sitting charge for offline (in-person) attendance. */
  honorarium_amount: number;
  /** Sitting charge for online attendance. Null/undefined = same as offline. */
  honorarium_amount_online?: number | null;
  /** Per-km rate, applied only under the 'distance' basis. */
  ta_per_km: number;
  /** Null/undefined means 'distance' — the pre-20260805120000 behaviour. */
  travel_basis?: BosTaDaTravelBasis | null;
  /** Fixed travel allowance under the 'flat' basis. */
  travel_flat_amount?: number | null;
}

/**
 * Rate-settings-aware variant of computeClaimAmounts (20260710130000, extended
 * for offline/online + travel bases in 20260805120000).
 *
 * When the meeting's council/committee has a configured rate row for the
 * member's type (bos_ta_da_rates), that row wins:
 *
 *   • Sitting charge: `honorarium_amount` offline, `honorarium_amount_online`
 *     online — falling back to the offline amount when the online column is
 *     null, since most SOP rows quote the same figure for both.
 *   • Travel: zero for online attendance, always. Offline, by basis —
 *       distance → round-trip km × ta_per_km (distance only exists for
 *                   external experts, so internal members still get 0)
 *       flat     → travel_flat_amount, regardless of distance. Paid to
 *                   internal members too: the basis is configured against a
 *                   specific member type, so choosing it IS the intent.
 *       none     → 0.
 *
 * With no rate row (null) the legacy flat-SOP computeClaimAmounts applies —
 * institutions that never configure rates see no behavior change.
 */
export function computeClaimAmountsWithRate(
  rate: TaDaRateOverride | null | undefined,
  input: ComputeClaimInput,
): ClaimAmounts {
  if (!rate) return computeClaimAmounts(input);

  const isOnline = input.mode === 'online';

  const offlineHonorarium = Number(rate.honorarium_amount) || 0;
  const onlineRaw = rate.honorarium_amount_online;
  // `?? offlineHonorarium` only when the column is genuinely unset — an
  // explicitly configured ₹0 online charge must stay ₹0, so this cannot
  // collapse into a falsy check.
  const onlineHonorarium =
    onlineRaw === null || onlineRaw === undefined
      ? offlineHonorarium
      : Number(onlineRaw) || 0;
  const honorarium = isOnline ? onlineHonorarium : offlineHonorarium;

  const travel = isOnline ? 0 : computeTravel(rate, input.oneWayKm);

  return {
    honorarium,
    travel,
    total: honorarium + travel,
  };
}

/** Offline travel component for a configured rate row. */
function computeTravel(
  rate: TaDaRateOverride,
  oneWayKm: number | null | undefined,
): number {
  const basis: BosTaDaTravelBasis = rate.travel_basis ?? 'distance';

  if (basis === 'none') return 0;

  if (basis === 'flat') {
    const flat = Number(rate.travel_flat_amount) || 0;
    return flat > 0 ? flat : 0;
  }

  const perKm = Number(rate.ta_per_km) || 0;
  return oneWayKm && oneWayKm > 0 ? oneWayKm * 2 * perKm : 0;
}
