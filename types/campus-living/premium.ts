// ============================================================================
// Premium Stay Phase 1 — type definitions
// ============================================================================
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
// Mirrors:
//   - supabase/migrations/20260516131800_create_hostel_tier_policy.sql
//   - supabase/migrations/20260516131806_create_fn_hostel_premium_evaluate.sql
//   - lib/services/campus-living/hostel-tier-service.ts
//   - lib/services/campus-living/hostel-premium-allocation-service.ts
// ============================================================================

// ─── Tier key + feature catalog (CHECK-constraint mirrored) ─────────────────

export type HostelTierKey = 'standard' | 'premium' | 'premium_plus';

/**
 * Feature keys recognized by the premium SKU. Stored as a JSONB array on
 * hostel_tier_policy.tier_features. The service layer reads these to gate
 * UI affordances (e.g. "show roommate-invite button only if
 * pick_roommate_with_consent is in the active tier's feature set").
 *
 * Locked spec decision-#4:
 *   premium      bundle: pick_block_and_room, pick_specific_bed, pick_roommate_with_consent
 *   premium_plus bundle: above + extended_curfew_quota, premium_maintenance_sla
 */
export type TierFeatureKey =
  | 'pick_block_and_room'
  | 'pick_specific_bed'
  | 'pick_roommate_with_consent'
  | 'extended_curfew_quota'
  | 'premium_maintenance_sla';

/**
 * Reusable bundle type representing the set of features a tier grants. Used by
 * hooks/components for type-safe predicate checks.
 */
export type TierFeatureBundle = ReadonlyArray<TierFeatureKey>;

// ─── hostel_tier_policy row ──────────────────────────────────────────────────

export interface HostelTierPolicy {
  id: string;
  institution_id: string | null;
  tier_key: HostelTierKey;
  tier_display_name: string;
  fee_uplift_percentage_default: number;
  tier_features: TierFeatureKey[];
  is_active: boolean;
  sort_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ─── CRUD payload shapes ─────────────────────────────────────────────────────

export interface UpsertHostelTierInput {
  id?: string;
  institution_id?: string | null;
  tier_key?: HostelTierKey;
  tier_display_name?: string;
  fee_uplift_percentage_default?: number;
  tier_features?: TierFeatureKey[];
  is_active?: boolean;
  sort_order?: number;
  description?: string | null;
}

// ─── Evaluator response (mirrors fn_hostel_premium_evaluate) ────────────────

export type PremiumEligibilityReason =
  | 'ok'
  | 'tier_not_found'
  | 'tier_inactive'
  | 'standard_tier_always_eligible'
  | 'not_a_hostelite'
  | 'outstanding_dues';

export interface PremiumEligibilityResult {
  eligible: boolean;
  reason: PremiumEligibilityReason;
}

// ─── Roommate invite state machine (Phase 1: types only; service stubs only) ─

export type RoommateInviteStatus =
  | 'pending'      // sent, awaiting both-party confirm
  | 'accepted'     // invited learner + parent (if minor) confirmed
  | 'declined'     // invited learner explicitly declined
  | 'expired'      // 48h window elapsed without confirm
  | 'cancelled';   // inviter cancelled before resolution

export interface RoommateInviteState {
  id: string;
  allocation_id: string;
  inviter_learner_id: string;
  invited_learner_id: string;
  status: RoommateInviteStatus;
  invite_token: string;
  expires_at: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  declined_at: string | null;
}

// ─── Premium dashboard summary (consumed by reporting page) ─────────────────

export interface PremiumDashboardSummary {
  total_premium_allocations: number;
  total_premium_plus_allocations: number;
  total_standard_allocations: number;
  revenue_uplift_inr: number;
  adoption_percent: number;
  per_college: ReadonlyArray<{
    institution_id: string;
    institution_name: string;
    premium_count: number;
    premium_plus_count: number;
    standard_count: number;
    fill_rate_percent: number;
  }>;
}

/**
 * One learner who may be invited into the caller's room.
 *
 * Produced by fn_premium_invite_candidates, which mirrors
 * fn_premium_create_invite's rules exactly — same institution, same gender,
 * hostelite, not already in this room, retry cap not spent. A candidate this
 * type describes is one the invite will accept; the list is never a set of dead
 * ends.
 */
export interface PremiumInviteCandidate {
  /** profiles.id — the id the invite RPC expects, NOT learners_profiles.id. */
  profile_id: string;
  full_name: string;
  register_number: string | null;
  department_name: string | null;
  semester_name: string | null;
  program_name: string | null;
  institution_name: string | null;
  /** Where she lives today. Null when she has no allocation yet. */
  current_room_category: string | null;
  current_block_name: string | null;
  current_room_number: string | null;
  current_room_id: string | null;
  /** True when her room is the same category as the inviter's — shown first. */
  same_category: boolean;
  /** She already has a pending invite from this inviter. */
  already_invited: boolean;
}
