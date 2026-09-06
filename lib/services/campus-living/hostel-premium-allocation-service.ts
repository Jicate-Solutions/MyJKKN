// ============================================================================
// Premium Room Phase 1 — Premium Allocation Service
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
  PremiumInviteCandidate,
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
  /** hostel_rooms.category_id — the fee band the room is priced in. Needed to
   *  quote what a sole occupant would owe before she confirms (2026-08-09). */
  category_id: string | null;
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
  // hostel-rooms-v2 PR 2 (2026-05-26): hostel_rooms.institution_id +
  // .status + .current_occupancy all dropped. Institution scope flows through
  // the block→institution junction (hostel_block_institutions) since 2026-06-03
  // (room_institution_access retired); read live occupancy from
  // v_hostel_room_occupancy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // 1) Find blocks that serve the caller's institution.
  const { data: blockRows, error: blocksErr } = await supabase
    .from('hostel_block_institutions')
    .select('block_id')
    .eq('institution_id', institutionId);
  if (blocksErr) {
    console.error('[premium-allocation] listAvailableRoomsForPremium blocks error:', blocksErr);
    throw new Error(blocksErr.message || 'Failed to list available premium rooms');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blockIds = ((blockRows ?? []) as any[]).map((b) => b.block_id);
  if (blockIds.length === 0) return [];

  // 2) Pull room details for premium-eligible rooms in those blocks.
  const { data, error } = await supabase
    .from('hostel_rooms')
    .select(
      'id, block_id, room_number, floor, capacity, category_id, ac_status, has_attached_bathroom, tier_access, hostel_blocks(name)',
    )
    .in('block_id', blockIds)
    .in('tier_access', ['premium_only', 'either']);
  if (error) {
    console.error('[premium-allocation] listAvailableRoomsForPremium rooms error:', error);
    throw new Error(error.message || 'Failed to list available premium rooms');
  }

  // 3) Pull derived occupancy for those rooms.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomIds = ((data ?? []) as any[]).map((r) => r.id);
  if (roomIds.length === 0) return [];
  const { data: occ } = await supabase
    .from('v_hostel_room_occupancy')
    .select('room_id, active_residents, derived_status, beds_available')
    .in('room_id', roomIds);
  const occMap = new Map<
    string,
    { activeResidents: number; derivedStatus: string; bedsAvailable: number }
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (occ ?? []) as any[]) {
    occMap.set(o.room_id, {
      activeResidents: o.active_residents,
      derivedStatus: o.derived_status,
      bedsAvailable: o.beds_available,
    });
  }

  // 4) Filter to rooms with beds available; assemble payload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((r) => {
      const o = occMap.get(r.id);
      return (
        o !== undefined &&
        (o.derivedStatus === 'available' || o.derivedStatus === 'partially_occupied') &&
        o.bedsAvailable > 0
      );
    })
    .map((r) => ({
      room_id: r.id,
      block_id: r.block_id,
      block_name: r.hostel_blocks?.name ?? null,
      institution_id: institutionId, // caller's scope; the row itself no longer carries this
      room_number: r.room_number,
      floor: r.floor,
      capacity: r.capacity,
      current_occupancy: occMap.get(r.id)?.activeResidents ?? 0,
      ac_status: r.ac_status,
      has_attached_bathroom: r.has_attached_bathroom ?? null,
      tier_access: r.tier_access,
      category_id: r.category_id ?? null,
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
 * Reserve a specific bed for a learner under a given tier. Wraps the
 * fn_premium_reserve_bed RPC (Phase 2 migration
 * 20260519140000_hostel_premium_invites_and_reserve_rpcs.sql) which:
 *   1. Acquires pg_try_advisory_xact_lock(hashtext(bed_id::text))
 *   2. Re-evaluates eligibility via fn_hostel_premium_evaluate
 *   3. Inserts hostel_allocations row with tier_id
 *   4. Marks the bed as occupied + bumps room.current_occupancy
 *
 * Concurrency: first writer wins; second concurrent caller for the same bed
 * receives reason='bed_locked_by_other' and the UI should re-fetch
 * availability + prompt for a different bed.
 */
export async function reserveBed(
  input: ReserveBedInput,
): Promise<ReserveBedResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_premium_reserve_bed', {
    p_learner_id: input.learnerId,
    p_bed_id: input.bedId,
    p_tier_id: input.tierId,
    p_room_id: input.roomId,
    p_block_id: input.blockId,
    p_institution_id: input.institutionId,
    p_academic_year_id: input.academicYearId,
    p_emergency_contact_name: input.emergencyContactName,
    p_emergency_contact_phone: input.emergencyContactPhone,
    p_emergency_contact_relation: input.emergencyContactRelation,
  });

  if (error) {
    console.error('[premium-allocation] reserveBed RPC error:', error);
    return {
      success: false,
      reason: 'unknown',
      detail: error.message || 'Failed to reserve bed',
    };
  }

  const verdict = (data ?? {}) as {
    success?: boolean;
    allocation_id?: string;
    reason?: ReserveBedResult['reason'];
    detail?: string;
  };

  return {
    success: Boolean(verdict.success),
    allocationId: verdict.allocation_id,
    reason: verdict.reason,
    detail: verdict.detail,
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
 * Create a pending roommate invite via the fn_premium_create_invite RPC.
 * Eligibility gates enforced in the RPC:
 *   - inviter has an active premium allocation
 *   - invited learner is in same institution
 *   - invited learner has same gender as inviter
 *   - invited learner is not already in an active premium allocation
 *   - retry_count for this pair is below hostel.premium.invite_max_retries
 * Window: hostel.premium.invite_window_hours (default 48h).
 */
export async function inviteRoommate(
  input: InviteRoommateInput,
): Promise<RoommateInviteState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_premium_create_invite', {
    p_allocation_id: input.allocationId,
    p_inviter_learner_id: input.inviterLearnerId,
    p_invited_learner_id: input.invitedLearnerId,
  });

  if (error) {
    console.error('[premium-allocation] inviteRoommate RPC error:', error);
    throw new Error(error.message || 'Failed to create roommate invite');
  }

  const verdict = (data ?? {}) as {
    success?: boolean;
    invite_id?: string;
    invite_token?: string;
    reason?: string;
    detail?: string;
  };

  if (!verdict.success || !verdict.invite_id) {
    throw new Error(verdict.detail || verdict.reason || 'Roommate invite failed');
  }

  // Re-read the invite row for full state (RPC returns id + token only).
  const { data: row, error: readError } = await supabase
    .from('hostel_premium_invites')
    .select('*')
    .eq('id', verdict.invite_id)
    .maybeSingle();

  if (readError) {
    console.error('[premium-allocation] inviteRoommate post-read error:', readError);
    throw new Error(readError.message || 'Failed to read created invite');
  }

  return row ? mapInviteRow(row) : null;
}

/**
 * Confirm a roommate invite via its single-use token. Wraps
 * fn_premium_confirm_invite. Caller passes acting learner id (typically
 * profile.id) so the RPC can validate that the invited party is the actor.
 */
export async function confirmRoommate(
  inviteToken: string,
  actingLearnerId: string,
): Promise<RoommateInviteState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_premium_confirm_invite', {
    p_invite_token: inviteToken,
    p_acting_learner_id: actingLearnerId,
  });

  if (error) {
    console.error('[premium-allocation] confirmRoommate RPC error:', error);
    throw new Error(error.message || 'Failed to confirm roommate invite');
  }

  const verdict = (data ?? {}) as {
    success?: boolean;
    invite_id?: string;
    reason?: string;
    detail?: string;
  };

  if (!verdict.success || !verdict.invite_id) {
    throw new Error(verdict.detail || verdict.reason || 'Roommate confirmation failed');
  }

  const { data: row, error: readError } = await supabase
    .from('hostel_premium_invites')
    .select('*')
    .eq('id', verdict.invite_id)
    .maybeSingle();

  if (readError) {
    console.error('[premium-allocation] confirmRoommate post-read error:', readError);
    throw new Error(readError.message || 'Failed to read confirmed invite');
  }

  return row ? mapInviteRow(row) : null;
}

/**
 * Decline a roommate invite via its single-use token.
 */
export async function declineRoommate(
  inviteToken: string,
  actingLearnerId: string,
): Promise<RoommateInviteState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_premium_decline_invite', {
    p_invite_token: inviteToken,
    p_acting_learner_id: actingLearnerId,
  });

  if (error) {
    console.error('[premium-allocation] declineRoommate RPC error:', error);
    throw new Error(error.message || 'Failed to decline roommate invite');
  }

  const verdict = (data ?? {}) as {
    success?: boolean;
    invite_id?: string;
    reason?: string;
    detail?: string;
  };

  if (!verdict.success || !verdict.invite_id) {
    throw new Error(verdict.detail || verdict.reason || 'Decline failed');
  }

  const { data: row, error: readError } = await supabase
    .from('hostel_premium_invites')
    .select('*')
    .eq('id', verdict.invite_id)
    .maybeSingle();

  if (readError) {
    console.error('[premium-allocation] declineRoommate post-read error:', readError);
    throw new Error(readError.message || 'Failed to read declined invite');
  }

  return row ? mapInviteRow(row) : null;
}

/**
 * List invites where the given learner is either inviter or invited.
 * Used by the invite-roommate UI to show pending + history.
 */
export async function listInvitesForLearner(
  learnerId: string,
): Promise<RoommateInviteState[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('hostel_premium_invites')
    .select('*')
    .or(`inviter_learner_id.eq.${learnerId},invited_learner_id.eq.${learnerId}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[premium-allocation] listInvitesForLearner error:', error);
    throw new Error(error.message || 'Failed to list invites');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(mapInviteRow);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInviteRow(row: any): RoommateInviteState {
  return {
    id: row.id,
    allocation_id: row.allocation_id,
    inviter_learner_id: row.inviter_learner_id,
    invited_learner_id: row.invited_learner_id,
    status: row.status,
    invite_token: row.invite_token,
    expires_at: row.expires_at,
    retry_count: row.retry_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at,
  };
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

/**
 * Everyone the caller may invite into her room, with enough detail to recognise
 * a person: department, semester, programme, and where they live now.
 *
 * The list exists because a learner cannot know who else is in her room
 * category — search-by-name only helps if you already know the name. Ordering
 * puts her own room category first.
 *
 * Own-allocation scoped inside the RPC, which refuses an allocation that is not
 * the caller's.
 */
export async function listInviteCandidates(
  allocationId: string,
): Promise<PremiumInviteCandidate[]> {
  const supabase = createClientSupabaseClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data, error } = await supabase.rpc('fn_premium_invite_candidates', {
    p_allocation_id: allocationId,
  });

  if (error) {
    console.error('[premium-allocation] listInviteCandidates RPC error:', error);
    throw new Error(error.message || 'Could not load learners you can invite');
  }

  return (data ?? []) as PremiumInviteCandidate[];
}
