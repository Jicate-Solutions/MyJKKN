// ============================================================================
// Premium Stay Phase 2 — Audit log + override types
// ============================================================================
// Mirrors:
//   - supabase/migrations/20260519101705_create_hostel_premium_audit_log.sql
//   - lib/services/campus-living/hostel-premium-audit-service.ts
// ============================================================================

/**
 * Distinct audit-log event classes. Mirrors the CHECK constraint on
 * hostel_premium_audit_log.event_type.
 */
export type PremiumAuditEventType =
  | 'tier_change'
  | 'override'
  | 'room_change'
  | 'status_change'
  | 'fee_status_change'
  | 'opt_in'
  | 'opt_out'
  | 'invite_sent'
  | 'invite_resolved';

export interface PremiumAuditLogRow {
  id: string;
  event_type: PremiumAuditEventType;

  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;

  allocation_id: string | null;
  learner_id: string | null;
  learner_name: string | null;
  institution_id: string | null;
  block_id: string | null;
  room_id: string | null;
  bed_id: string | null;

  old_tier_id: string | null;
  new_tier_id: string | null;
  old_tier_key: string | null;
  new_tier_key: string | null;

  override_reason: string | null;

  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;

  description: string;
  metadata: Record<string, unknown>;

  created_at: string;
}

/**
 * Filters accepted by listPremiumAuditEvents().
 *
 * - tierKey:  matches new_tier_key (filters on the "after" side; the "before"
 *             side is captured in the row for reference).
 * - eventTypes: when provided, only these event classes are returned.
 * - learnerId / institutionId: scope filters.
 * - fromDate / toDate: ISO date strings, inclusive bounds on created_at.
 * - search:    case-insensitive substring match on learner_name, actor_name,
 *              override_reason, or description.
 */
export interface PremiumAuditFilters {
  tierKey?: 'standard' | 'premium' | 'premium_plus' | null;
  eventTypes?: PremiumAuditEventType[];
  learnerId?: string | null;
  institutionId?: string | null;
  fromDate?: string | null; // ISO 8601 (date or datetime)
  toDate?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface PremiumAuditListResult {
  rows: PremiumAuditLogRow[];
  total: number;
}

/**
 * Row shape returned by listCurrentPremiumAllocations() for the override
 * page. Joins learner profile, block, room, bed, and tier.
 */
export interface PremiumAllocationSummary {
  allocation_id: string;
  learner_id: string | null;
  learner_name: string | null;
  learner_email: string | null;
  institution_id: string;
  block_id: string;
  block_name: string | null;
  room_id: string;
  room_number: string | null;
  bed_id: string;
  bed_number: string | null;
  tier_id: string;
  tier_key: string | null;
  tier_display_name: string | null;
  status: string;
  fee_status: string | null;
  override_reason: string | null;
  allocation_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Payload accepted by overridePremiumAllocation().
 *
 * The override path writes hostel_allocations directly. The new RLS policy
 * (20260516131807) gates the write on a non-empty override_reason; the
 * audit trigger captures the change as an `override` event (and as
 * `tier_change` / `room_change` if tier_id / block_id / room_id / bed_id
 * also moved).
 */
export interface OverridePremiumAllocationInput {
  allocationId: string;
  overrideReason: string;
  newTierId?: string | null;
  newBlockId?: string | null;
  newRoomId?: string | null;
  newBedId?: string | null;
}

export interface OverridePremiumAllocationResult {
  success: boolean;
  allocationId: string;
  error?: string;
}
