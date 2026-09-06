// ============================================================================
// Premium upgrade ACCEPT + differential billing (PR η)
//
// When a Classic resident accepts a Premium-vacancy upgrade offer (vacancy
// opened by PR ζ), this service:
//   1. Validates the vacancy is still 'open' and the learner is in the eligible
//      upgrade pool (gender + cluster match — via ζ's resolveUpgradePool).
//   2. Checks for a *pending Premium entitlement* (the learner prepaid Premium
//      at admission but was seated in Classic). If present → billing = ₹0
//      (decision 18, zero-fulfillment) and the entitlement is marked fulfilled.
//   3. Otherwise computes the DIFFERENTIAL via δ's computeUpgradeDifferential
//      (Premium pro-rata − Classic pro-rata for the remaining months,
//      decision 7), then applies the vacancy's current_discount_pct (set by θ).
//      billing = max(0, differential × (1 − discount/100)).
//   4. Reassigns the learner's bed to the Premium bed and marks the vacancy
//      'filled' — atomically, via the fn_premium_upgrade_accept RPC (advisory
//      lock + transactional, mirroring fn_premium_reserve_bed). The RPC is the
//      idempotent double-accept guard: a second accept of the same vacancy hits
//      status<>'open' and returns a clear error.
//
// READ-ONLY on ζ's premium-vacancy-service (we import resolveUpgradePool only)
// and δ's hostel-fee-compute-service (we import the pure computeUpgradeDifferential
// only). No edits to those files.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  learnerFacingError,
  logWithReference,
} from '@/lib/services/campus-living/error-sanitize';
import {
  resolveUpgradePool,
  type PremiumVacancy,
} from '@/lib/services/campus-living/premium-vacancy-service';
import { computeUpgradeDifferential } from '@/lib/services/campus-living/hostel-fee-compute-service';
import type { FeeComputeInput, HostelYearWindow } from '@/types/hostel-fee-compute';

const LOG = 'campus-living/premium-upgrade';

const VACANCY_COLS =
  'id, institution_id, room_id, bed_id, block_id, room_category_id, hostel_type, ' +
  'cluster_key, status, current_discount_pct';

export interface AcceptUpgradeInput {
  vacancyId: string;
  learnerId: string;
  hostelYearId: string;
}

export interface AcceptUpgradeResult {
  success: boolean;
  /** Final amount billed to the learner for the upgrade (₹, ≥ 0). */
  billed_inr: number;
  /** True when a pending entitlement zero-fulfilled the bill (decision 18). */
  was_free: boolean;
  /** The Premium bed the learner was moved to. */
  new_bed_id: string | null;
  /** New (Premium) allocation id. */
  new_allocation_id: string | null;
  /** Old (Classic) allocation id that was vacated. */
  old_allocation_id: string | null;
  /** Human-readable explanation lines (compute basis + entitlement notes). */
  basis: string[];
  /** Set when success=false. */
  reason?: string;
  detail?: string;
}

/** Normalise a fee amount to an annual figure (mirrors δ's private annualize). */
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

/**
 * Build the pure FeeComputeInput primitives for one room + category in a hostel
 * year. Mirrors δ's quoteUpfrontFee fetch logic (per-bed rate × capacity, AC via
 * the effective-amenities view, live active-occupant count). Read-only.
 *
 * EXPORTED 2026-08-09 so the empty-bed notice service can reuse it instead of
 * adding a THIRD copy of this fetch (δ's quoteUpfrontFee holds the second).
 * It takes the client as an argument, so a service-role caller works unchanged.
 * Behaviour is untouched.
 */
export async function buildFeeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roomId: string,
  roomCategoryId: string,
  hostelYearId: string,
): Promise<FeeComputeInput> {
  const { data: roomRow } = await supabase
    .from('hostel_rooms')
    .select('capacity')
    .eq('id', roomId)
    .single();
  const roomCapacity = Number(roomRow?.capacity) || 1;

  const { data: occ } = await supabase
    .from('v_hostel_room_occupancy')
    .select('active_residents')
    .eq('room_id', roomId)
    .maybeSingle();
  const activeOccupants = Number(occ?.active_residents) || 1;

  const { data: baseFee } = await supabase
    .from('hostel_fees')
    .select('amount, frequency')
    .eq('hostel_year_id', hostelYearId)
    .eq('hostel_category_id', roomCategoryId)
    .eq('is_active', true)
    .maybeSingle();
  const perBedAnnualRate = baseFee ? annualize(Number(baseFee.amount), baseFee.frequency) : 0;

  const { data: amenities } = await supabase
    .from('v_room_effective_billable_amenities')
    .select('code, effective_config')
    .eq('room_id', roomId)
    .eq('code', 'air_conditioner');
  const acRow = (amenities ?? [])[0];
  const acConfig = acRow?.effective_config
    ? {
        tonnage: Number((acRow.effective_config as Record<string, unknown>).tonnage) || 0,
        base_inr_per_month_24h:
          Number((acRow.effective_config as Record<string, unknown>).base_inr_per_month_24h) || 0,
      }
    : null;

  return { perBedAnnualRate, roomCapacity, activeOccupants, acConfig, messAnnualFee: 0 };
}

/**
 * Accept a Premium-vacancy upgrade offer. Idempotent: a second accept of the
 * same vacancy returns success=false reason='vacancy_not_open' (the RPC re-checks
 * 'open' under a row lock + bed advisory lock).
 */
export async function acceptUpgrade(input: AcceptUpgradeInput): Promise<AcceptUpgradeResult> {
  const { vacancyId, learnerId, hostelYearId } = input;
  const basis: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerSupabaseClient()) as any;

  const fail = (reason: string, detail: string): AcceptUpgradeResult => ({
    success: false,
    billed_inr: 0,
    was_free: false,
    new_bed_id: null,
    new_allocation_id: null,
    old_allocation_id: null,
    basis,
    reason,
    detail,
  });

  // 1. Load the vacancy + validate it is open.
  const { data: vacancyRow, error: vacErr } = await supabase
    .from('hostel_premium_vacancies')
    .select(VACANCY_COLS)
    .eq('id', vacancyId)
    .maybeSingle();
  if (vacErr) throw vacErr;
  if (!vacancyRow) return fail('vacancy_not_found', 'Upgrade vacancy not found.');
  const vacancy = vacancyRow as PremiumVacancy;
  if (vacancy.status !== 'open') {
    return fail('vacancy_not_open', `Upgrade vacancy is no longer open (status: ${vacancy.status}).`);
  }
  if (!vacancy.room_category_id) {
    return fail('vacancy_no_category', 'Vacancy has no room category to price.');
  }

  // 2. Validate the learner is in the eligible upgrade pool (gender + cluster).
  const pool = await resolveUpgradePool(vacancy);
  const member = pool.find((m) => m.learner_id === learnerId);
  if (!member) {
    return fail('not_in_pool', 'You are not eligible for this upgrade (cluster / gender mismatch).');
  }

  // 3. Pending entitlement → ZERO billing (decision 18, zero-fulfillment).
  const { data: entitlement } = await supabase
    .from('hostel_pending_premium_entitlements')
    .select('id, package_value_inr, amount_prepaid_inr')
    .eq('learner_id', learnerId)
    .eq('hostel_year_id', hostelYearId)
    .eq('target_room_category_id', vacancy.room_category_id)
    .eq('status', 'pending')
    .order('package_value_inr', { ascending: false })
    .limit(1)
    .maybeSingle();

  let billedInr = 0;
  let wasFree = false;

  if (entitlement) {
    wasFree = true;
    basis.push(
      `Pending Premium entitlement found (prepaid ₹${entitlement.amount_prepaid_inr ?? 0}) — upgrade billed ₹0 (decision 18).`,
    );
  } else {
    // 4. Compute the differential (decision 7) from the learner's current
    //    Classic room → the vacancy's Premium room.
    const { data: currentAlloc } = await supabase
      .from('hostel_allocations')
      .select('room_id, room:hostel_rooms!hostel_allocations_room_id_fkey(id, room_category_id)')
      .eq('learner_id', learnerId)
      .eq('status', 'active')
      .order('allocation_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!currentAlloc?.room_id) {
      return fail('no_active_allocation', 'You have no active allocation to upgrade from.');
    }
    const classicCategoryId: string | null =
      currentAlloc.room?.room_category_id ?? null;
    if (!classicCategoryId) {
      return fail('classic_category_missing', 'Could not resolve your current room category.');
    }

    const { data: yearRow } = await supabase
      .from('hostel_years')
      .select('start_date, end_date')
      .eq('id', hostelYearId)
      .maybeSingle();
    if (!yearRow) return fail('hostel_year_not_found', 'Hostel year not found.');
    const hostelYear: HostelYearWindow = {
      start_date: yearRow.start_date,
      end_date: yearRow.end_date,
    };

    const classicCtx = await buildFeeContext(
      supabase,
      currentAlloc.room_id,
      classicCategoryId,
      hostelYearId,
    );
    const premiumCtx = await buildFeeContext(
      supabase,
      vacancy.room_id,
      vacancy.room_category_id,
      hostelYearId,
    );

    // fromDate = today (the move takes effect now → remaining months from now).
    const fromDate = new Date().toISOString().slice(0, 10);
    const diff = computeUpgradeDifferential(classicCtx, premiumCtx, fromDate, hostelYear);
    basis.push(...diff.basis);

    // 5. Apply the vacancy's current_discount_pct (set by θ; 0 by default).
    const discountPct = Math.max(0, Math.min(100, Number(vacancy.current_discount_pct) || 0));
    billedInr = Math.max(0, Math.round(diff.differential * (1 - discountPct / 100)));
    if (discountPct > 0) {
      basis.push(
        `Vacancy discount ${discountPct}% applied → billed ₹${billedInr} (from differential ₹${diff.differential}).`,
      );
    } else {
      basis.push(`No vacancy discount → billed differential ₹${billedInr}.`);
    }
  }

  // 6. Atomic bed move + vacancy fill via the SECURITY DEFINER RPC.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_premium_upgrade_accept', {
    p_vacancy_id: vacancyId,
    p_learner_id: learnerId,
    p_billed_inr: billedInr,
    p_was_free: wasFree,
  });
  if (rpcErr) {
    // Raw Postgres/PostgREST text (constraint names, SQLSTATE prose) must never
    // reach a learner — full error logged with a reference id (2026-08-07).
    const reference = logWithReference(LOG, 'fn_premium_upgrade_accept RPC error', rpcErr);
    return fail('rpc_error', learnerFacingError('reassigning your bed', reference));
  }
  const verdict = (rpcData ?? {}) as {
    success?: boolean;
    new_allocation_id?: string;
    old_allocation_id?: string;
    new_bed_id?: string;
    reason?: string;
    detail?: string;
  };
  if (!verdict.success) {
    const reason = verdict.reason ?? 'unknown';
    // Details for these reasons are hand-written sentences inside the
    // fn_premium_upgrade_accept RPC and safe to show. Any OTHER reason —
    // notably 'unknown', whose detail is raw SQLERRM (this is the exact path
    // that put `duplicate key value violates unique constraint
    // "hostel_allocations_room_bed_active_uidx"` on a learner's phone) — is
    // logged in full and replaced with a plain sentence + reference (2026-08-07).
    const RPC_SAFE_DETAIL_REASONS = new Set([
      'vacancy_not_found',
      'vacancy_not_open',
      'vacancy_no_bed',
      'bed_locked_by_other',
      'bed_unavailable',
      'no_active_allocation',
    ]);
    if (RPC_SAFE_DETAIL_REASONS.has(reason)) {
      return fail(reason, verdict.detail ?? 'Upgrade could not be completed.');
    }
    const reference = logWithReference(LOG, `fn_premium_upgrade_accept failed (reason: ${reason})`, {
      reason,
      detail: verdict.detail,
    });
    return fail(reason, learnerFacingError('completing your upgrade', reference));
  }

  // 7. If a pending entitlement was used, mark it fulfilled + link the vacancy.
  if (entitlement) {
    const { error: entErr } = await supabase
      .from('hostel_pending_premium_entitlements')
      .update({
        status: 'fulfilled',
        fulfilled_by_vacancy_id: vacancyId,
        fulfilled_at: new Date().toISOString(),
      })
      .eq('id', entitlement.id)
      .eq('status', 'pending'); // guard: don't re-fulfill
    if (entErr) {
      // Bed move already committed; surface but don't roll back the move.
      logger.warn(LOG, 'entitlement fulfill update failed (bed move stands)', entErr);
      basis.push('WARNING: entitlement could not be marked fulfilled — flag for manual review.');
    }
  }

  logger.info(LOG, 'upgrade accepted', {
    vacancyId,
    learnerId,
    billedInr,
    wasFree,
    newAllocationId: verdict.new_allocation_id,
  });

  return {
    success: true,
    billed_inr: billedInr,
    was_free: wasFree,
    new_bed_id: verdict.new_bed_id ?? null,
    new_allocation_id: verdict.new_allocation_id ?? null,
    old_allocation_id: verdict.old_allocation_id ?? null,
    basis,
  };
}
