// ============================================================================
// Premium Room Phase 1 — Hostel Tier Service
// ============================================================================
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
// Migration: supabase/migrations/20260516131800_create_hostel_tier_policy.sql
// Companion admin UI: app/(routes)/campus-living/premium/tier-policy/page.tsx
//
// CRUD against hostel_tier_policy. Mirrors the consultant_tier_policy
// service pattern (PR #874) with the cardinal difference being:
//   - hostel_tier_policy.institution_id replaces consultant's
//     (scope_type, scope_id) — premium room is always institution-scoped or
//     global (no role/user scope).
//   - tier_features jsonb array replaces conversion thresholds.
//
// Cache: in-memory 60s TTL per institutionId scope. Director changes are
// rare (minutes-to-hours, not sub-second). Pattern mirrors
// consultant-tier-policy-service.ts.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HostelTierPolicy,
  UpsertHostelTierInput,
  TierFeatureKey,
} from '@/types/campus-living/premium';

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const listCache: Map<string, CacheEntry<HostelTierPolicy[]>> = new Map();

function listCacheKey(institutionId: string | null): string {
  return `list::${institutionId ?? 'global'}`;
}

function getCachedList(key: string): HostelTierPolicy[] | null {
  const entry = listCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    listCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedList(key: string, value: HostelTierPolicy[]): void {
  listCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate the in-memory tier cache. Called by upsertTier() / deleteTier()
 * after a write so the next consumer call sees the new ladder immediately.
 */
export function invalidateHostelTierCache(scope?: string): void {
  if (!scope) {
    listCache.clear();
    return;
  }
  listCache.delete(`list::${scope}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List tier policy rows. Returns global rows + (when institutionId provided)
 * that institution's overrides. Ordered by sort_order. Cached 60s.
 */
export async function listHostelTiers(
  institutionId?: string | null,
): Promise<HostelTierPolicy[]> {
  const key = listCacheKey(institutionId ?? null);
  const cached = getCachedList(key);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('hostel_tier_policy')
    .select('*')
    .order('sort_order', { ascending: true });

  if (institutionId) {
    query = query.or(`institution_id.is.null,institution_id.eq.${institutionId}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[hostel-tier-service] listHostelTiers error:', error);
    throw new Error(error.message || 'Failed to fetch hostel tier policy rows');
  }

  const rows = (data ?? []) as HostelTierPolicy[];
  setCachedList(key, rows);
  return rows;
}

/**
 * Fetch a single tier policy row by id. Bypasses the list cache (small reads).
 */
export async function getHostelTier(id: string): Promise<HostelTierPolicy | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('hostel_tier_policy')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[hostel-tier-service] getHostelTier error:', error);
    throw new Error(error.message || 'Failed to fetch hostel tier policy');
  }
  return (data ?? null) as HostelTierPolicy | null;
}

/**
 * Super-admin / chief_warden write: insert or update a tier policy row.
 * RLS in the migration enforces the role check. Service-layer simply forwards
 * the Supabase error verbatim so the UI can render constraint failures.
 *
 * Invalidates the in-memory list cache for the affected scope on success.
 */
export async function upsertHostelTier(
  row: UpsertHostelTierInput,
  updatedBy: string,
): Promise<HostelTierPolicy> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  if (row.institution_id !== undefined) payload.institution_id = row.institution_id;
  if (row.tier_key !== undefined) payload.tier_key = row.tier_key;
  if (row.tier_display_name !== undefined) payload.tier_display_name = row.tier_display_name;
  if (row.fee_uplift_percentage_default !== undefined)
    payload.fee_uplift_percentage_default = row.fee_uplift_percentage_default;
  if (row.tier_features !== undefined) payload.tier_features = row.tier_features;
  if (row.is_active !== undefined) payload.is_active = row.is_active;
  if (row.sort_order !== undefined) payload.sort_order = row.sort_order;
  if (row.description !== undefined) payload.description = row.description;

  let result;
  if (row.id) {
    result = await supabase
      .from('hostel_tier_policy')
      .update(payload)
      .eq('id', row.id)
      .select()
      .single();
  } else {
    payload.created_by = updatedBy;
    result = await supabase
      .from('hostel_tier_policy')
      .insert(payload)
      .select()
      .single();
  }

  const { data, error } = result;
  if (error) {
    console.error('[hostel-tier-service] upsertHostelTier error:', error);
    throw new Error(error.message || 'Failed to save hostel tier policy');
  }

  // Invalidate cache for the affected scope.
  const persisted = data as HostelTierPolicy;
  const scopeKey = persisted.institution_id ?? 'global';
  invalidateHostelTierCache(scopeKey);

  return persisted;
}

/**
 * Hard delete by id. RLS gates this to super_admin / admin only.
 * Clears the entire list cache because we don't know which scope the row
 * belonged to without a pre-delete read.
 */
export async function deleteHostelTier(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { error } = await supabase
    .from('hostel_tier_policy')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[hostel-tier-service] deleteHostelTier error:', error);
    throw new Error(error.message || 'Failed to delete hostel tier policy');
  }

  invalidateHostelTierCache();
}

/**
 * Seed per-institution default rows by cloning the global rows. Used when
 * a chief warden first opens the tier-policy admin UI for their institution
 * and there are no per-institution rows yet — the UI prompts "create
 * institution-specific overrides from the global defaults?" and calls this.
 *
 * Idempotent: if any row already exists for the institution_id, returns the
 * existing rows without overwriting.
 */
export async function seedInstitutionTierDefaults(
  institutionId: string,
  createdBy: string,
): Promise<HostelTierPolicy[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // Check if any rows exist already
  const { data: existing, error: existingErr } = await supabase
    .from('hostel_tier_policy')
    .select('*')
    .eq('institution_id', institutionId);

  if (existingErr) {
    throw new Error(existingErr.message || 'Failed to check existing tier rows');
  }
  if ((existing ?? []).length > 0) {
    invalidateHostelTierCache(institutionId);
    return existing as HostelTierPolicy[];
  }

  // Read global defaults
  const { data: globals, error: globalsErr } = await supabase
    .from('hostel_tier_policy')
    .select('*')
    .is('institution_id', null)
    .order('sort_order', { ascending: true });

  if (globalsErr) {
    throw new Error(globalsErr.message || 'Failed to load global tier defaults');
  }
  if (!globals || globals.length === 0) {
    throw new Error('No global hostel_tier_policy defaults exist. Seed migration may be missing.');
  }

  // Insert clones
  const payload = (globals as HostelTierPolicy[]).map((g) => ({
    institution_id: institutionId,
    tier_key: g.tier_key,
    tier_display_name: g.tier_display_name,
    fee_uplift_percentage_default: g.fee_uplift_percentage_default,
    tier_features: g.tier_features,
    is_active: g.is_active,
    sort_order: g.sort_order,
    description: g.description,
    created_by: createdBy,
    updated_by: createdBy,
  }));

  const { data, error } = await supabase
    .from('hostel_tier_policy')
    .insert(payload)
    .select();

  if (error) {
    console.error('[hostel-tier-service] seedInstitutionTierDefaults error:', error);
    throw new Error(error.message || 'Failed to seed institution tier defaults');
  }

  invalidateHostelTierCache(institutionId);
  return (data ?? []) as HostelTierPolicy[];
}

/**
 * Convenience predicate — does this tier grant a given feature?
 * Used by UI to gate affordances (e.g. show roommate-invite button).
 */
export function tierGrantsFeature(
  tier: Pick<HostelTierPolicy, 'tier_features'>,
  featureKey: TierFeatureKey,
): boolean {
  return tier.tier_features.includes(featureKey);
}
