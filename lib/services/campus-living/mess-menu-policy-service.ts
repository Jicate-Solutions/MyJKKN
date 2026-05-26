/**
 * Mess-Menu Policy Reader
 * ============================================================================
 *
 * Typed accessors for the 6 `mess.menu.*` rows seeded by PR 1
 * (20260630000000_mess_menu_pr1_schema_extensions.sql).
 *
 * Pattern: mirrors `lib/services/pde-policy-reader.ts` — each accessor calls
 * the right scalar `fn_get_policy_*` RPC with the seeded default baked in,
 * falls soft on RPC error so menu features keep rendering.
 *
 *   • mess.menu.edit_cutoff_minutes      (number,  default 120)
 *   • mess.menu.seed_size_default        (number,  default 48)
 *   • mess.menu.image_source             (string,  default 'photos')
 *   • mess.menu.source_locale            (string,  default 'ta')
 *   • mess.menu.tier_crossing_allowed    (boolean, default false)
 *   • mess.menu.fee_model                (string,  default 'bundled')
 *
 * Director D3 lock 2026-05-25: edit cutoff is the policy this module is most
 * frequently read for — `MessMenuService.upsertMenuCell` calls
 * `getEditCutoffMinutes()` on every cell edit.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export const MESS_MENU_POLICY_KEYS = {
  EDIT_CUTOFF_MINUTES: 'mess.menu.edit_cutoff_minutes',
  SEED_SIZE_DEFAULT: 'mess.menu.seed_size_default',
  IMAGE_SOURCE: 'mess.menu.image_source',
  SOURCE_LOCALE: 'mess.menu.source_locale',
  TIER_CROSSING_ALLOWED: 'mess.menu.tier_crossing_allowed',
  FEE_MODEL: 'mess.menu.fee_model',
} as const;

export type MessMenuImageSource = 'photos' | 'ai_generated' | 'none';
export type MessMenuSourceLocale = 'ta' | 'en';
export type MessMenuFeeModel = 'bundled' | 'per_meal' | 'per_day';

export interface MessMenuPolicySnapshot {
  editCutoffMinutes: number;
  seedSizeDefault: number;
  imageSource: MessMenuImageSource;
  sourceLocale: MessMenuSourceLocale;
  tierCrossingAllowed: boolean;
  feeModel: MessMenuFeeModel;
}

// ── Internal helpers ──────────────────────────────────────────────────────

async function readInt(key: string, fallback: number, institutionId?: string | null): Promise<number> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_int', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn('campus-living/mess-policy', `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return (data ?? fallback) as number;
  } catch (err) {
    logger.error('campus-living/mess-policy', `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

async function readText<T extends string>(
  key: string,
  fallback: T,
  institutionId?: string | null,
): Promise<T> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_text', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn('campus-living/mess-policy', `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return ((data as string | null) ?? fallback) as T;
  } catch (err) {
    logger.error('campus-living/mess-policy', `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

async function readBool(key: string, fallback: boolean, institutionId?: string | null): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_bool', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn('campus-living/mess-policy', `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return (data ?? fallback) as boolean;
  } catch (err) {
    logger.error('campus-living/mess-policy', `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

// ── Public accessors ──────────────────────────────────────────────────────

/** Minutes-before-meal-start at which the cell is frozen from edits. Default 120. */
export function getEditCutoffMinutes(institutionId?: string | null): Promise<number> {
  return readInt(MESS_MENU_POLICY_KEYS.EDIT_CUTOFF_MINUTES, 120, institutionId);
}

/** Chairperson's minimum-viable seed size for a new institution's weekly menu. Default 48. */
export function getSeedSizeDefault(institutionId?: string | null): Promise<number> {
  return readInt(MESS_MENU_POLICY_KEYS.SEED_SIZE_DEFAULT, 48, institutionId);
}

/** Where item-illustration images come from. Default 'photos'. */
export function getImageSource(institutionId?: string | null): Promise<MessMenuImageSource> {
  return readText<MessMenuImageSource>(MESS_MENU_POLICY_KEYS.IMAGE_SOURCE, 'photos', institutionId);
}

/** Source-authoritative locale for bilingual menu cells. Default 'ta'. */
export function getSourceLocale(institutionId?: string | null): Promise<MessMenuSourceLocale> {
  return readText<MessMenuSourceLocale>(MESS_MENU_POLICY_KEYS.SOURCE_LOCALE, 'ta', institutionId);
}

/** Whether a resident may eat at a tier other than their assigned hostel tier. Default false. */
export function getTierCrossingAllowed(institutionId?: string | null): Promise<boolean> {
  return readBool(MESS_MENU_POLICY_KEYS.TIER_CROSSING_ALLOWED, false, institutionId);
}

/** Monthly fee structure. Default 'bundled' (single per-month per-tier price). */
export function getFeeModel(institutionId?: string | null): Promise<MessMenuFeeModel> {
  return readText<MessMenuFeeModel>(MESS_MENU_POLICY_KEYS.FEE_MODEL, 'bundled', institutionId);
}

/**
 * Update one of the 6 mess.menu.* policies at global scope.
 * Writes directly to `platform_policies.value`. Simple direct-publish (no
 * draft/publish workflow on these policies — Director D2 lock kept this
 * lean; if it needs to grow, swap in `wave3-policy-editor-service` API).
 *
 * Returns the updated value (as raw JSON) so caller can hydrate the cache.
 */
export async function updateMessMenuPolicy(
  policyKey: typeof MESS_MENU_POLICY_KEYS[keyof typeof MESS_MENU_POLICY_KEYS],
  newValue: number | string | boolean,
): Promise<void> {
  const supabase = createClientSupabaseClient();
  const { error } = await supabase
    .from('platform_policies')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ value: newValue as any, updated_at: new Date().toISOString() })
    .eq('policy_key', policyKey)
    .eq('scope_type', 'global')
    .is('scope_id', null);

  if (error) {
    logger.error('campus-living/mess-policy', `Failed to update ${policyKey}`, error);
    throw error;
  }
}

/**
 * One-shot snapshot of all 6 policies — used by the admin policies page so
 * the UI can render every row in a single render pass.
 */
export async function getMessMenuPolicySnapshot(
  institutionId?: string | null,
): Promise<MessMenuPolicySnapshot> {
  const [editCutoffMinutes, seedSizeDefault, imageSource, sourceLocale, tierCrossingAllowed, feeModel] =
    await Promise.all([
      getEditCutoffMinutes(institutionId),
      getSeedSizeDefault(institutionId),
      getImageSource(institutionId),
      getSourceLocale(institutionId),
      getTierCrossingAllowed(institutionId),
      getFeeModel(institutionId),
    ]);

  return {
    editCutoffMinutes,
    seedSizeDefault,
    imageSource,
    sourceLocale,
    tierCrossingAllowed,
    feeModel,
  };
}
