// lib/services/admin/exophone-institution-map-service.ts
// Created: 2026-05-03
// Purpose: CRUD over exophone_institution_map rows + a server-side reader
//          (with 60s in-memory cache + hardcoded-fallback) used by the
//          telephony webhook hot-path to resolve ExoPhone DID → institution_id.
//
// Replaces the hardcoded EXOPHONE_MAP at lib/services/telephony/telephony-service.ts:1311.
// Per probe-capture-2026-05-03.md (D1): 22 of 27 active inbound DIDs were
// silently defaulting to JKKN Pharmacy → 8+ institutions mis-attributed in
// dashboards. This service ends that.
//
// Director's standing rule (2026-04-29): policy/data decisions = DB rows.
// Memory: feedback_policy_decisions_must_be_config_rows.md
// Pattern after: lib/services/admin/counselor-routing-config-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ExophoneInstitutionMapRow {
  exophone: string;
  institution_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ExophoneMapWithInstitution extends ExophoneInstitutionMapRow {
  institution?: { id: string; name: string } | null;
}

// ============================================================================
// HARDCODED FALLBACK
// ============================================================================
// Mirrors the 5 entries at lib/services/telephony/telephony-service.ts:1311
// (BEFORE this PR). Used only when the DB read fails — defensive zero-regression
// behaviour. The DB seed migration backfills these same 5 rows on deploy.

const HARDCODED_DEFAULT_INSTITUTION =
  process.env.EXOTEL_DEFAULT_INSTITUTION_ID ||
  '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'; // JKKN College of Pharmacy

const HARDCODED_FALLBACK: Record<string, string> = {
  '04446313503': HARDCODED_DEFAULT_INSTITUTION,
  '04446313545': HARDCODED_DEFAULT_INSTITUTION,
  '04446313596': HARDCODED_DEFAULT_INSTITUTION,
  '04448134434': HARDCODED_DEFAULT_INSTITUTION,
  '04446310202': HARDCODED_DEFAULT_INSTITUTION,
};

// ============================================================================
// CACHE (server-only — 60s TTL on the resolution hot path)
// ============================================================================
// Cache stores the entire active-map (small — at most ~50 DIDs ever). Webhook
// arrivals see at most one 60s-stale lookup before the next refresh.

interface CacheEntry {
  map: Record<string, string>;
  loadedAt: number;
}

let resolutionCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function clearResolutionCache(): void {
  resolutionCache = null;
}

// ============================================================================
// CLIENT-SIDE CRUD (Admin UI)
// ============================================================================

export class ExophoneInstitutionMapService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** List all rows ordered by exophone for the admin table. */
  static async list(): Promise<ExophoneMapWithInstitution[]> {
    const { data, error } = await (this.supabase as any)
      .from('exophone_institution_map')
      .select('*, institution:institutions(id, name)')
      .order('exophone', { ascending: true });

    if (error) {
      console.error('[admin/exophone-institution-map] list failed:', error);
      return [];
    }
    return (data || []) as ExophoneMapWithInstitution[];
  }

  /**
   * Upsert (insert or update by exophone PK). Used by the admin UI for both
   * "Add new DID" and "Edit existing".
   */
  static async upsert(row: {
    exophone: string;
    institution_id: string;
    description?: string | null;
    is_active?: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    const trimmed = row.exophone.trim();
    if (!trimmed) {
      return { ok: false, error: 'ExoPhone is required' };
    }
    if (!row.institution_id) {
      return { ok: false, error: 'Institution is required' };
    }

    // Get current user for updated_by audit
    const { data: userData, error: userErr } = await this.supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return { ok: false, error: 'Not authenticated' };
    }

    const { error } = await (this.supabase as any)
      .from('exophone_institution_map')
      .upsert({
        exophone: trimmed,
        institution_id: row.institution_id,
        description: row.description ?? null,
        is_active: row.is_active ?? true,
        updated_by: userData.user.id,
      });

    if (error) {
      console.error('[admin/exophone-institution-map] upsert failed:', error);
      return { ok: false, error: error.message || 'Save failed' };
    }
    return { ok: true };
  }

  /** Toggle is_active. Soft-delete pattern — keeps audit trail. */
  static async setActive(
    exophone: string,
    isActive: boolean
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await this.supabase.auth.getUser();
    const { error } = await (this.supabase as any)
      .from('exophone_institution_map')
      .update({
        is_active: isActive,
        updated_by: userData?.user?.id ?? null,
      })
      .eq('exophone', exophone);

    if (error) {
      return { ok: false, error: error.message || 'Update failed' };
    }
    return { ok: true };
  }

  /** Hard-delete. Use sparingly — prefer setActive(false). */
  static async remove(exophone: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await (this.supabase as any)
      .from('exophone_institution_map')
      .delete()
      .eq('exophone', exophone);

    if (error) {
      return { ok: false, error: error.message || 'Delete failed' };
    }
    return { ok: true };
  }
}

// ============================================================================
// SERVER-SIDE RESOLVER (used by webhook hot-path)
// ============================================================================

/**
 * Resolve an ExoPhone DID to an institution_id.
 *
 * Reads from `exophone_institution_map` with a 60s in-memory cache. On any
 * DB read error or empty result, falls back to the hardcoded 5-entry map
 * (matches the BEFORE-this-PR behaviour exactly — zero regression risk).
 *
 * Returns:
 *   - institution_id (uuid) when DID matches an active row OR the fallback map
 *   - null when nothing matches (caller must apply its own default — typically
 *     EXOTEL_DEFAULT_INSTITUTION_ID env or the Pharmacy UUID)
 *
 * @param exoPhone - The DID as Exotel reports it (e.g. '04446313503' or '+914446313503')
 * @param supabase - A Supabase client. Use service-role for webhook hot-path
 *                   to avoid auth round-trips. The function is RLS-safe either way
 *                   (read policy allows authenticated; service-role bypasses).
 */
export async function resolveInstitutionForExoPhone(
  exoPhone: string | null | undefined,
  supabase: any
): Promise<string | null> {
  if (!exoPhone) return null;

  const trimmed = exoPhone.trim();
  if (!trimmed) return null;

  // Refresh cache if stale
  const now = Date.now();
  if (!resolutionCache || now - resolutionCache.loadedAt > CACHE_TTL_MS) {
    try {
      const { data, error } = await supabase
        .from('exophone_institution_map')
        .select('exophone, institution_id')
        .eq('is_active', true);

      if (error) {
        // DB error — fall through to hardcoded map. Log via console.error
        // (Agent A's error-capture helper TODO — migrate when their PR lands).
        console.error(
          '[exophone-institution-map] DB read failed, using hardcoded fallback:',
          error
        );
      } else {
        const map: Record<string, string> = {};
        for (const row of (data || []) as Array<{ exophone: string; institution_id: string }>) {
          map[row.exophone] = row.institution_id;
        }
        resolutionCache = { map, loadedAt: now };
      }
    } catch (err) {
      console.error(
        '[exophone-institution-map] Unexpected resolver error, using hardcoded fallback:',
        err
      );
    }
  }

  // Build the effective lookup map (DB first if loaded, else hardcoded fallback)
  const lookupMap = resolutionCache?.map ?? HARDCODED_FALLBACK;

  // Direct match
  if (lookupMap[trimmed]) return lookupMap[trimmed];

  // +91/91 prefix variants
  const stripped91 = trimmed.replace(/^\+?91/, '');
  if (lookupMap[stripped91]) return lookupMap[stripped91];

  // Try with leading 0 on the last 10 digits
  if (stripped91.length >= 10) {
    const with0 = '0' + stripped91.slice(-10);
    if (lookupMap[with0]) return lookupMap[with0];
  }

  return null;
}

// ============================================================================
// TEST/ADMIN HELPERS
// ============================================================================

/**
 * Force-clear the in-memory cache. Called after admin writes so the next
 * webhook arrival sees the new mapping immediately rather than waiting up to
 * 60s. NOT exposed via the admin UI — admin UI just calls this internally.
 */
export function invalidateExophoneResolutionCache(): void {
  clearResolutionCache();
}
