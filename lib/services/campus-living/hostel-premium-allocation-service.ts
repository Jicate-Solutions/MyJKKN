// ============================================================================
// Premium Stay Phase 1 — Premium Allocation Service
// ============================================================================
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
// Companion: lib/services/campus-living/hostel-tier-service.ts (CRUD on table)
//
// Wraps the premium-specific allocation flow:
//   - getEligibility(learner, tier)            → calls fn_hostel_premium_evaluate RPC
//   - listAvailableRoomsForPremium(learner)    → joins hostel_rooms ∩ tier_access
//                                                ∩ not currently held
//   - reserveBed(learner, bed, tier)           → advisory-locked insert
//   - inviteRoommate(allocation, invitedLearner) → creates pending invite
//   - confirmRoommate(token)                   → resolves invite to accepted
//
// Phase 1 ships getEligibility + listAvailableRoomsForPremium fully wired
// (admin-side reporting needs them). reserveBed / inviteRoommate / confirm
// are stubbed with the right signatures + advisory-lock recipe; the
// learner-facing UI in Phase 2 will exercise them. This split mirrors the
// spec's Phase 1 admin-only / Phase 2 learner-facing scope split.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PremiumEligibilityResult,
  RoommateInviteState,
} from '@/types/campus-living/premium';

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Call fn_hostel_premium_evaluate(learner, tier) and return the verdict.
 * Reads hostel.premium.eligibility platform_policy at runtime.
 */
export async function getEligibility(
  learnerId: string,
  tierId: string,
): Promise<PremiumEligibilityResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_hostel_premium_evaluate', {
    p_learner_id: learnerId,
    p_tier_id: tierId,
  });

  if (error) {
    console.error('[premium-allocation] getEligibility error:', error);
    throw new Error(error.message || 'Failed to evaluate premium eligibility');
  }

  // RPC returns jsonb shaped like { eligible: bool, reason: text }
  const verdict = (data ?? {}) as Partial<PremiumEligibilityResult>;
  return {
    eligible: Boolean(verdict.eligible),
    reason: (verdict.reason ?? 'tier_not_found') as PremiumEligibilityResult['reason'],
  };
}

// ---------------------------------------------------------------------------
// Room availability
// ---------------------------------------------------------------------------

export interface PremiumAvailableRoom {
  room_id: string;
  block_id: string;
  block_name: string | null;
  institution_id: string;
  room_number: string;
  floor: number;
  capacity: number;
  current_occupancy: number;
  ac_status: string;
  has_attached_bathroom: boolean | null;
  tier_access: 'premium_only' | 'either';
}

/**
 * Returns rooms visible to a premium-tier learner:
 *   - tier_access IN ('premium_only', 'either')
 *   - status = 'available' (room enum)
 *   - current_occupancy < capacity
 *
 * Caller passes institutionId so we scope to the learner's college. RLS on
 * hostel_rooms (existing) further gates by user_has_permission +
 * role_has_institution_access for non-super_admin viewers.
 */
export async function listAvailableRoomsForPremium(
  institutionId: string,
): Promise<PremiumAvailableRoom[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('hostel_rooms')
    .select(
      'id, block_id, institution_id, room_number, floor, capacity, current_occupancy, ac_status, has_attached_bathroom, tier_access, hostel_blocks(name)',
    )
    .eq('institution_id', institutionId)
    .in('tier_access', ['premium_only', 'either'])
    .eq('status', 'available');

  if (error) {
    console.error('[premium-allocation] listAvailableRoomsForPremium error:', error);
    throw new Error(error.message || 'Failed to list available premium rooms');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((r) => Number(r.current_occupancy ?? 0) < Number(r.capacity ?? 0))
    .map((r) => ({
      room_id: r.id,
      block_id: r.block_id,
      block_name: r.hostel_blocks?.name ?? null,
      institution_id: r.institution_id,
      room_number: r.room_number,
      floor: r.floor,
      capacity: r.capacity,
      current_occupancy: r.current_occupancy ?? 0,
      ac_status: r.ac_status,
      has_attached_bathroom: r.has_attached_bathroom ?? null,
      tier_access: r.tier_access,
    }));
}

// ---------------------------------------------------------------------------
// Reserve bed (atomic, advisory-locked)
// ---------------------------------------------------------------------------

export interface ReserveBedInput {
  learnerId: string;
  bedId: string;
  tierId: string;
  roomId: string;
  blockId: string;
  institutionId: string;
  academicYearId: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
}

export interface ReserveBedResult {
  success: boolean;
  allocationId?: string;
  reason?:
    | 'bed_locked_by_other'
    | 'eligibility_failed'
    | 'bed_unavailable'
    | 'tier_inactive'
    | 'unknown';
  detail?: string;
}

/**
 * Reserve a specific bed for a learner under a given tier. Uses
 * pg_try_advisory_xact_lock(hashtext(bed_id)) for concurrency safety —
 * first writer wins atomically; loser gets a bed_locked_by_other result
 * with the service caller deciding whether to offer alternatives.
 *
 * Phase 1: stub returning unknown. Phase 2 (learner-facing UI) wires up the
 * advisory-lock + transactional insert. The signature is locked so the
 * Phase 2 PR is a pure body fill-in, not an API change.
 *
 * Recipe (for Phase 2 implementer):
 *
 *   await supabase.rpc('fn_premium_reserve_bed', {
 *     p_learner_id, p_bed_id, p_tier_id, p_room_id, p_block_id,
 *     p_institution_id, p_academic_year_id, ...
 *   })
 *
 *   The RPC will:
 *   1. PERFORM pg_try_advisory_xact_lock(hashtext(p_bed_id::text))
 *      → if false, RETURN bed_locked_by_other
 *   2. SELECT fn_hostel_premium_evaluate(p_learner_id, p_tier_id)
 *      → if eligible=false, RETURN eligibility_failed
 *   3. INSERT INTO hostel_allocations (..., tier_id) VALUES (..., p_tier_id)
 *      RETURNING id
 *   4. UPDATE hostel_rooms SET current_occupancy = current_occupancy + 1
 *      WHERE id = p_room_id (existing trigger handles this; verify)
 */
export async function reserveBed(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: ReserveBedInput,
): Promise<ReserveBedResult> {
  // Phase 1: stub. See JSDoc above for the Phase 2 wiring recipe.
  console.warn(
    '[premium-allocation] reserveBed is a Phase 1 stub. The learner-facing UI in Phase 2 will wire this to the fn_premium_reserve_bed RPC.',
  );
  return {
    success: false,
    reason: 'unknown',
    detail: 'reserveBed is a Phase 1 stub. Learner-facing premium flow ships in Phase 2.',
  };
}

// ---------------------------------------------------------------------------
// Roommate invite
// ---------------------------------------------------------------------------

export interface InviteRoommateInput {
  allocationId: string;
  inviterLearnerId: string;
  invitedLearnerId: string;
}

/**
 * Create a pending roommate invite. Spec decisions #6a/#6b:
 *   - eligibility: same tier + same institution + same gender
 *   - 48h window (hostel.premium.invite_window_hours platform_policy)
 *   - 2 retries max (hostel.premium.invite_max_retries platform_policy)
 *   - minor invitee triggers parent SMS branch (Phase 2)
 *
 * Phase 1: stub returning placeholder state with the correct shape so the
 * dashboard tab #3 (activity log) and admin UI can render the column
 * headers and "0 active invites" empty state.
 */
export async function inviteRoommate(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: InviteRoommateInput,
): Promise<RoommateInviteState | null> {
  console.warn(
    '[premium-allocation] inviteRoommate is a Phase 1 stub. Wire to fn_premium_create_invite + SMS dispatch in Phase 2.',
  );
  return null;
}

/**
 * Confirm a roommate invite via its single-use token. Phase 1: stub.
 */
export async function confirmRoommate(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _inviteToken: string,
): Promise<RoommateInviteState | null> {
  console.warn(
    '[premium-allocation] confirmRoommate is a Phase 1 stub. Wire to fn_premium_confirm_invite in Phase 2.',
  );
  return null;
}

// ---------------------------------------------------------------------------
// Dashboard aggregations (Phase 1 fully wired — reporting page uses these)
// ---------------------------------------------------------------------------

export interface PremiumAllocationCounts {
  standard: number;
  premium: number;
  premium_plus: number;
  total: number;
}

/**
 * Count allocations by tier_key for the given institution (or all when null).
 * Used by the dashboard Revenue + Adoption tab.
 */
export async function countAllocationsByTier(
  institutionId?: string | null,
): Promise<PremiumAllocationCounts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('hostel_allocations')
    .select('tier_id, hostel_tier_policy!hostel_allocations_tier_id_fkey(tier_key)')
    .eq('status', 'active');
  if (institutionId) query = query.eq('institution_id', institutionId);

  const { data, error } = await query;
  if (error) {
    console.error('[premium-allocation] countAllocationsByTier error:', error);
    throw new Error(error.message || 'Failed to count allocations by tier');
  }

  const counts: PremiumAllocationCounts = {
    standard: 0,
    premium: 0,
    premium_plus: 0,
    total: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const tierKey = row.hostel_tier_policy?.tier_key as keyof PremiumAllocationCounts | undefined;
    if (tierKey === 'standard' || tierKey === 'premium' || tierKey === 'premium_plus') {
      counts[tierKey] += 1;
      counts.total += 1;
    }
  }

  return counts;
}
