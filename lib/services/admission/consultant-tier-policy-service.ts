// lib/services/admission/consultant-tier-policy-service.ts
// ============================================================================
// Consultant Tier Policy Service — config-row substrate (2026-05-13)
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
// Zero deploys, zero PRs, zero developer round-trips for future tweaks.
//
// This service is the runtime reader + admin CRUD layer for the
// consultant_tier_policy table. It replaces the hardcoded tier ladder at
// lib/services/admission/consultant-service.ts:2496-2508. The actual
// consultant-service.ts rewrite that CALLS getTierForConversions() is a
// SEPARATE follow-up PR — this service ships as substrate alongside the
// migration and admin UI.
//
// Companion migration: supabase/migrations/20260513150001_create_consultant_tier_policy.sql
// Companion admin UI:  app/(routes)/admission/consultants/admin/tier-policy/page.tsx
//
// Cache: in-memory 60s TTL per (institutionId|null) scope. Director changes
// tier ladders rarely (minutes-to-hours, not sub-second). Per-process cache —
// each Vercel function instance has its own; eventual consistency is fine.
// Pattern mirrors lib/services/platform/ai-model-config-service.ts.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierScopeType = 'global' | 'institution';

export interface ConsultantTierPolicyRow {
  id: string;
  tier_name: string;
  scope_type: TierScopeType;
  scope_id: string | null;
  display_order: number;
  min_conversions: number;
  max_conversions: number | null;
  next_tier: string | null;
  badge_color: string | null;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ResolvedTier {
  current_tier: string;
  min_conversions: number;
  max_conversions: number | null;
  next_tier: string | null;
  leads_to_next: number | null;
  badge_color: string | null;
}

export interface UpsertTierInput {
  id?: string;
  tier_name?: string;
  scope_type?: TierScopeType;
  scope_id?: string | null;
  display_order?: number;
  min_conversions?: number;
  max_conversions?: number | null;
  next_tier?: string | null;
  badge_color?: string | null;
  is_active?: boolean;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const tierCache: Map<string, CacheEntry<ResolvedTier>> = new Map();
const listCache: Map<string, CacheEntry<ConsultantTierPolicyRow[]>> = new Map();

function tierCacheKey(conversions: number, institutionId: string | null): string {
  return `${institutionId ?? 'global'}::${conversions}`;
}

function listCacheKey(institutionId: string | null): string {
  return `list::${institutionId ?? 'global'}`;
}

function getCachedTier(key: string): ResolvedTier | null {
  const entry = tierCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tierCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedTier(key: string, value: ResolvedTier): void {
  tierCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedList(key: string): ConsultantTierPolicyRow[] | null {
  const entry = listCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    listCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedList(key: string, value: ConsultantTierPolicyRow[]): void {
  listCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate the in-memory tier cache. Called by upsertTier() after a write so
 * the next consumer call sees the new ladder immediately (instead of up to 60s).
 *
 * @param scope - optional scope key ('global' or an institutionId). When omitted,
 *                clears EVERYTHING (both tier and list caches).
 */
export function invalidateTierCache(scope?: string): void {
  if (!scope) {
    tierCache.clear();
    listCache.clear();
    return;
  }
  // Clear any tier entries that match the scope prefix.
  const prefix = `${scope}::`;
  for (const key of Array.from(tierCache.keys())) {
    if (key.startsWith(prefix)) tierCache.delete(key);
  }
  listCache.delete(`list::${scope}`);
}

// ---------------------------------------------------------------------------
// Public API — readers
// ---------------------------------------------------------------------------

/**
 * Resolve the tier for a consultant given their total_conversions count.
 * Institution-scoped override wins over global. Cached 60s.
 *
 * Falls back to hardcoded last-known defaults (mirroring consultant-service.ts:2496-2508)
 * when the Supabase read fails OR the table is missing — so the portal keeps
 * rendering tier badges even in degraded mode.
 */
export async function getTierForConversions(
  conversions: number,
  institutionId?: string | null,
): Promise<ResolvedTier> {
  const cacheKey = tierCacheKey(conversions, institutionId ?? null);
  const cached = getCachedTier(cacheKey);
  if (cached) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase.rpc(
      'fn_get_consultant_tier_for_conversions',
      {
        p_conversions: conversions,
        p_institution_id: institutionId ?? null,
      },
    );

    if (error) {
      console.error('[consultant-tier-policy] getTierForConversions error:', error);
      return getHardcodedFallback(conversions);
    }

    const rows = (data ?? []) as ResolvedTier[];
    if (rows.length === 0) {
      console.warn(
        `[consultant-tier-policy] No tier row matched conversions=${conversions}, using hardcoded fallback`,
      );
      return getHardcodedFallback(conversions);
    }

    const resolved = rows[0];
    setCachedTier(cacheKey, resolved);
    return resolved;
  } catch (err) {
    console.error('[consultant-tier-policy] getTierForConversions unexpected:', err);
    return getHardcodedFallback(conversions);
  }
}

/**
 * List tier policy rows. Returns global rows + (when institutionId is provided)
 * that institution's overrides, ordered by display_order. Cached 60s.
 *
 * Used by:
 *  - Admin UI data table (lists rows for super_admin to edit).
 *  - Read-side consumers that need the full ladder for rendering progress
 *    bars / next-tier hints.
 */
export async function listTiers(
  institutionId?: string | null,
): Promise<ConsultantTierPolicyRow[]> {
  const key = listCacheKey(institutionId ?? null);
  const cached = getCachedList(key);
  if (cached) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClientSupabaseClient() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('consultant_tier_policy')
      .select('*')
      .order('scope_type', { ascending: false }) // global first, then institution
      .order('display_order', { ascending: true });

    if (institutionId) {
      query = query.or(`scope_type.eq.global,scope_id.eq.${institutionId}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[consultant-tier-policy] listTiers error:', error);
      throw new Error(error.message || 'Failed to fetch consultant tier policies');
    }

    const rows = (data ?? []) as ConsultantTierPolicyRow[];
    setCachedList(key, rows);
    return rows;
  } catch (err) {
    console.error('[consultant-tier-policy] listTiers unexpected:', err);
    throw err;
  }
}

/**
 * Super-admin only: insert or update a tier policy row.
 *
 * - With `row.id` -> UPDATE that row.
 * - Without `row.id` -> INSERT a new row.
 *
 * RLS in the migration blocks non-super_admin writes; this fn surfaces the
 * Supabase error message verbatim so the UI can render PG constraint failures
 * (e.g. unique-index violation when two rows have the same tier_name + scope).
 *
 * Invalidates the in-memory cache for the affected scope on success.
 */
export async function upsertTier(
  row: UpsertTierInput,
  updatedBy: string,
): Promise<ConsultantTierPolicyRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // Normalize: global rows must have scope_id=null (CHECK constraint).
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  if (row.tier_name !== undefined) payload.tier_name = row.tier_name;
  if (row.scope_type !== undefined) payload.scope_type = row.scope_type;
  if (row.scope_id !== undefined) {
    payload.scope_id = row.scope_type === 'global' ? null : row.scope_id ?? null;
  }
  if (row.display_order !== undefined) payload.display_order = row.display_order;
  if (row.min_conversions !== undefined) payload.min_conversions = row.min_conversions;
  if (row.max_conversions !== undefined) payload.max_conversions = row.max_conversions;
  if (row.next_tier !== undefined) payload.next_tier = row.next_tier;
  if (row.badge_color !== undefined) payload.badge_color = row.badge_color;
  if (row.is_active !== undefined) payload.is_active = row.is_active;
  if (row.description !== undefined) payload.description = row.description;

  let result;
  if (row.id) {
    result = await supabase
      .from('consultant_tier_policy')
      .update(payload)
      .eq('id', row.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('consultant_tier_policy')
      .insert(payload)
      .select()
      .single();
  }

  const { data, error } = result;
  if (error) {
    console.error('[consultant-tier-policy] upsertTier error:', error);
    throw new Error(error.message || 'Failed to save consultant tier policy');
  }

  // Invalidate the cache for the affected scope so the next read sees fresh data.
  const scopeKey =
    (data as ConsultantTierPolicyRow).scope_type === 'global'
      ? 'global'
      : (data as ConsultantTierPolicyRow).scope_id ?? 'global';
  invalidateTierCache(scopeKey);

  return data as ConsultantTierPolicyRow;
}

/**
 * Hard delete by id. Frees up the (tier_name, scope, scope_id) slot
 * immediately. Invalidates all caches on success.
 */
export async function deleteTier(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { error } = await supabase
    .from('consultant_tier_policy')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[consultant-tier-policy] deleteTier error:', error);
    throw new Error(error.message || 'Failed to delete consultant tier policy');
  }

  // Clear everything — we don't know which scope the row belonged to without
  // reading it pre-delete.
  invalidateTierCache();
}

// ---------------------------------------------------------------------------
// Hardcoded fallbacks — last-known-good defaults mirroring the seed migration
// AND the existing hardcoded ladder at consultant-service.ts:2496-2508.
// Used only when Supabase is unreachable so consultant features keep working
// in degraded mode. Update if seed defaults change.
// ---------------------------------------------------------------------------

interface FallbackTier {
  tier_name: string;
  min_conversions: number;
  max_conversions: number | null;
  next_tier: string | null;
  badge_color: string;
}

const FALLBACK_LADDER: ReadonlyArray<FallbackTier> = [
  { tier_name: 'bronze',   min_conversions: 0,   max_conversions: 9,    next_tier: 'silver',   badge_color: '#CD7F32' },
  { tier_name: 'silver',   min_conversions: 10,  max_conversions: 24,   next_tier: 'gold',     badge_color: '#C0C0C0' },
  { tier_name: 'gold',     min_conversions: 25,  max_conversions: 49,   next_tier: 'platinum', badge_color: '#FFD700' },
  { tier_name: 'platinum', min_conversions: 50,  max_conversions: 99,   next_tier: 'diamond',  badge_color: '#E5E4E2' },
  { tier_name: 'diamond',  min_conversions: 100, max_conversions: null, next_tier: null,       badge_color: '#B9F2FF' },
];

/**
 * Exported for tests & for callers that explicitly want the offline default.
 * Mirrors the hardcoded ladder at consultant-service.ts:2496-2508 1:1.
 */
export function getHardcodedFallback(conversions: number): ResolvedTier {
  const safeConversions = Math.max(0, conversions | 0);
  const matched =
    FALLBACK_LADDER.find(
      (t) =>
        safeConversions >= t.min_conversions &&
        (t.max_conversions === null || safeConversions <= t.max_conversions),
    ) ?? FALLBACK_LADDER[0];

  let leadsToNext: number | null = null;
  if (matched.next_tier) {
    const nextTier = FALLBACK_LADDER.find((t) => t.tier_name === matched.next_tier);
    if (nextTier) {
      leadsToNext = Math.max(0, nextTier.min_conversions - safeConversions);
    }
  }

  return {
    current_tier: matched.tier_name,
    min_conversions: matched.min_conversions,
    max_conversions: matched.max_conversions,
    next_tier: matched.next_tier,
    leads_to_next: leadsToNext,
    badge_color: matched.badge_color,
  };
}
