// ============================================================================
// Premium Room Phase 2 — Audit Log Service + Chief-Warden Override
// ============================================================================
// Companion migration: supabase/migrations/20260519101705_create_hostel_premium_audit_log.sql
// Companion UIs:
//   - app/(routes)/campus-living/premium/override/page.tsx
//   - app/(routes)/campus-living/premium/audit-log/page.tsx
//
// What lives here:
//   - listPremiumAuditEvents(filters)         — audit-log viewer
//   - getAuditRow(id)                         — single event detail
//   - listCurrentPremiumAllocations(scope)    — override-page list
//   - overridePremiumAllocation(input)        — chief warden override write
//
// The audit table is never written from app code — the trigger installed in
// 20260519101705 captures every change as a side-effect of the override
// mutation. This service only READS the audit table.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PremiumAuditLogRow,
  PremiumAuditFilters,
  PremiumAuditListResult,
  PremiumAllocationSummary,
  OverridePremiumAllocationInput,
  OverridePremiumAllocationResult,
} from '@/types/campus-living/premium-audit';

// ---------------------------------------------------------------------------
// Audit log reader
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;

/**
 * Read the premium audit log with optional filters. RLS gates by
 * is_super_admin / is_admin / campus_living.premium.view_dashboard.
 *
 * The `search` filter does a case-insensitive OR across learner_name,
 * actor_name, override_reason, and description.
 */
export async function listPremiumAuditEvents(
  filters: PremiumAuditFilters = {},
): Promise<PremiumAuditListResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('hostel_premium_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    query = query.in('event_type', filters.eventTypes);
  }

  if (filters.tierKey) {
    query = query.eq('new_tier_key', filters.tierKey);
  }

  if (filters.learnerId) {
    query = query.eq('learner_id', filters.learnerId);
  }

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }

  if (filters.fromDate) {
    query = query.gte('created_at', filters.fromDate);
  }

  if (filters.toDate) {
    query = query.lte('created_at', filters.toDate);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const s = filters.search.trim().replace(/[(),]/g, ' '); // strip PostgREST or-syntax chars
    query = query.or(
      [
        `learner_name.ilike.%${s}%`,
        `actor_name.ilike.%${s}%`,
        `override_reason.ilike.%${s}%`,
        `description.ilike.%${s}%`,
      ].join(','),
    );
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[premium-audit] listPremiumAuditEvents error:', error);
    throw new Error(error.message || 'Failed to load premium audit events');
  }

  return {
    rows: (data ?? []) as PremiumAuditLogRow[],
    total: count ?? 0,
  };
}

/**
 * Fetch a single audit row by id.
 */
export async function getAuditRow(id: string): Promise<PremiumAuditLogRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('hostel_premium_audit_log')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[premium-audit] getAuditRow error:', error);
    throw new Error(error.message || 'Failed to load audit row');
  }
  return (data as PremiumAuditLogRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Override page reader
// ---------------------------------------------------------------------------

export interface ListCurrentPremiumAllocationsParams {
  institutionId?: string | null;
  tierKey?: 'premium' | 'premium_plus' | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface PremiumAllocationListResult {
  rows: PremiumAllocationSummary[];
  total: number;
}

/**
 * Returns CURRENT active allocations on premium / premium_plus tier (i.e. the
 * candidates for chief warden override). Joins learner profile, block, room,
 * bed, and tier. RLS on hostel_allocations gates the read.
 */
export async function listCurrentPremiumAllocations(
  params: ListCurrentPremiumAllocationsParams = {},
): Promise<PremiumAllocationListResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('hostel_allocations')
    .select(
      'id, learner_id, institution_id, block_id, room_id, bed_id, tier_id, status, fee_status, override_reason, allocation_date, created_at, updated_at, ' +
        'learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), ' +
        'hostel_blocks(name), ' +
        'hostel_rooms(room_number), ' +
        'hostel_beds(bed_number), ' +
        'hostel_tier_policy!hostel_allocations_tier_id_fkey(tier_key, tier_display_name)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.institutionId) {
    query = query.eq('institution_id', params.institutionId);
  }

  // Filter to premium tiers only by default; allow caller to drill into one.
  if (params.tierKey) {
    // Need a join filter — easiest is to inner-filter post-fetch, but PostgREST
    // supports filtering through embedded resource via .eq on a nested key.
    // We instead resolve tier ids beforehand to avoid relying on resource-embed
    // filter quirks across versions.
    const { data: tierRows, error: tierErr } = await supabase
      .from('hostel_tier_policy')
      .select('id, tier_key')
      .eq('tier_key', params.tierKey);
    if (tierErr) {
      console.error('[premium-audit] tier lookup error:', tierErr);
      throw new Error(tierErr.message || 'Failed to resolve tier ids');
    }
    const tierIds = (tierRows ?? []).map((r: { id: string }) => r.id);
    if (tierIds.length === 0) {
      return { rows: [], total: 0 };
    }
    query = query.in('tier_id', tierIds);
  } else {
    // Default scope: premium + premium_plus
    const { data: tierRows, error: tierErr } = await supabase
      .from('hostel_tier_policy')
      .select('id, tier_key')
      .in('tier_key', ['premium', 'premium_plus']);
    if (tierErr) {
      console.error('[premium-audit] tier lookup error:', tierErr);
      throw new Error(tierErr.message || 'Failed to resolve tier ids');
    }
    const tierIds = (tierRows ?? []).map((r: { id: string }) => r.id);
    if (tierIds.length === 0) {
      return { rows: [], total: 0 };
    }
    query = query.in('tier_id', tierIds);
  }

  if (params.search && params.search.trim().length > 0) {
    // Search learner profile name/email — supabase doesn't allow ilike across
    // embedded resources reliably, so fall back to the plain learner_name in
    // the audit list page; here we use a name-substring filter post-fetch.
    // The .or() below limits to direct columns on hostel_allocations.
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[premium-audit] listCurrentPremiumAllocations error:', error);
    throw new Error(error.message || 'Failed to list premium allocations');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: PremiumAllocationSummary[] = ((data ?? []) as any[]).map((r) => ({
    allocation_id: r.id,
    learner_id: r.learner_id ?? null,
    learner_name: r.learner?.full_name ?? null,
    learner_email: r.learner?.email ?? null,
    institution_id: r.institution_id,
    block_id: r.block_id,
    block_name: r.hostel_blocks?.name ?? null,
    room_id: r.room_id,
    room_number: r.hostel_rooms?.room_number ?? null,
    bed_id: r.bed_id,
    bed_number: r.hostel_beds?.bed_number ?? null,
    tier_id: r.tier_id,
    tier_key: r.hostel_tier_policy?.tier_key ?? null,
    tier_display_name: r.hostel_tier_policy?.tier_display_name ?? null,
    status: r.status,
    fee_status: r.fee_status ?? null,
    override_reason: r.override_reason ?? null,
    allocation_date: r.allocation_date ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  }));

  // Post-fetch name/email substring filter (case-insensitive). Done client-side
  // because embedded-resource ilike across PostgREST is unreliable.
  if (params.search && params.search.trim().length > 0) {
    const s = params.search.trim().toLowerCase();
    rows = rows.filter((r) =>
      (r.learner_name ?? '').toLowerCase().includes(s)
      || (r.learner_email ?? '').toLowerCase().includes(s)
      || (r.block_name ?? '').toLowerCase().includes(s)
      || (r.room_number ?? '').toLowerCase().includes(s),
    );
  }

  return {
    rows,
    total: params.search ? rows.length : (count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Override mutation
// ---------------------------------------------------------------------------

/**
 * Apply a chief warden override on a premium allocation. Writes the new
 * tier_id / block_id / room_id / bed_id (any of which may be omitted) along
 * with the mandatory override_reason. The audit trigger emits the
 * corresponding `override` (+ optional `tier_change` / `room_change`)
 * events automatically.
 *
 * RLS gates the write via the policy `hostel_allocations_premium_override`
 * (migration 20260516131807): the user must hold
 * `campus_living.premium.override_pick` AND have institution+block scope AND
 * supply a non-empty override_reason.
 */
export async function overridePremiumAllocation(
  input: OverridePremiumAllocationInput,
): Promise<OverridePremiumAllocationResult> {
  const trimmedReason = (input.overrideReason ?? '').trim();
  if (trimmedReason.length === 0) {
    return {
      success: false,
      allocationId: input.allocationId,
      error: 'Override reason is required.',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    override_reason: trimmedReason,
    updated_at: new Date().toISOString(),
  };
  if (input.newTierId) patch.tier_id = input.newTierId;
  if (input.newBlockId) patch.block_id = input.newBlockId;
  if (input.newRoomId) patch.room_id = input.newRoomId;
  if (input.newBedId) patch.bed_id = input.newBedId;

  const { error } = await supabase
    .from('hostel_allocations')
    .update(patch)
    .eq('id', input.allocationId);

  if (error) {
    console.error('[premium-audit] overridePremiumAllocation error:', error);
    return {
      success: false,
      allocationId: input.allocationId,
      error: error.message || 'Override write rejected by database.',
    };
  }

  return { success: true, allocationId: input.allocationId };
}
