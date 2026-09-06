/**
 * Hostel Allocation Policy Reader / Writer
 * ============================================================================
 *
 * Typed accessors for the 7 `hostel.premium.*` + `hostel.premium_plus.*` rows
 * in platform_policies. These already exist in production (seeded by the
 * earlier Premium-Room Phase 1 substrate) — this module surfaces them as a
 * snapshot for the /admin/hostel/allocation-rules editor and lets Director
 * update them without a redeploy.
 *
 * Pattern mirror: `lib/services/campus-living/mess-menu-policy-service.ts`.
 * RPCs used: fn_get_policy_int, fn_get_policy_bool, fn_get_policy_text,
 *           fn_get_policy_json (all confirmed live 2026-05-26).
 *
 *   • hostel.premium.eligibility                       (object)
 *   • hostel.premium.hold_window_minutes               (number, default 15)
 *   • hostel.premium.invite_max_retries                (number, default 1)
 *   • hostel.premium.invite_window_hours               (number, default 48)
 *   • hostel.premium.payment_mode                      (string, default 'atomic')
 *   • hostel.premium.quota_per_block_default_percent   (number, default 0)
 *   • hostel.premium_plus.late_returns_per_month       (number, default 2)
 *
 * Director D-locks 2026-05-26:
 *   – Direct-publish on save (no draft workflow on these policies).
 *   – English consequences are mandatory at the UI layer; this service does
 *     not interpret values, only reads/writes them.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Policy keys ──────────────────────────────────────────────────────────────

export const HOSTEL_ALLOCATION_POLICY_KEYS = {
  ELIGIBILITY: 'hostel.premium.eligibility',
  HOLD_WINDOW_MINUTES: 'hostel.premium.hold_window_minutes',
  INVITE_MAX_RETRIES: 'hostel.premium.invite_max_retries',
  INVITE_WINDOW_HOURS: 'hostel.premium.invite_window_hours',
  PAYMENT_MODE: 'hostel.premium.payment_mode',
  QUOTA_PER_BLOCK_DEFAULT_PERCENT: 'hostel.premium.quota_per_block_default_percent',
  LATE_RETURNS_PER_MONTH: 'hostel.premium_plus.late_returns_per_month',
} as const;

export type HostelAllocationPolicyKey =
  typeof HOSTEL_ALLOCATION_POLICY_KEYS[keyof typeof HOSTEL_ALLOCATION_POLICY_KEYS];

export type HostelPremiumPaymentMode = 'atomic' | 'hold_24h' | 'pay_at_intake';

export interface HostelPremiumEligibility {
  require_fees_clear?: boolean;
  // Future keys may include: min_cgpa, batch_allow_list, institution_allow_list.
  // The page renders only the keys it knows; unknown keys are preserved
  // round-trip via the raw-JSON edit fallback.
  [k: string]: unknown;
}

export interface HostelAllocationPolicySnapshot {
  eligibility: HostelPremiumEligibility;
  holdWindowMinutes: number;
  inviteMaxRetries: number;
  inviteWindowHours: number;
  paymentMode: HostelPremiumPaymentMode;
  quotaPerBlockDefaultPercent: number;
  lateReturnsPerMonth: number;
}

// Default values used when an RPC fails — these mirror current production
// values (verified 2026-05-26 via SELECT against platform_policies).
const DEFAULTS = {
  eligibility: { require_fees_clear: true } as HostelPremiumEligibility,
  holdWindowMinutes: 15,
  inviteMaxRetries: 1,
  inviteWindowHours: 48,
  paymentMode: 'atomic' as HostelPremiumPaymentMode,
  quotaPerBlockDefaultPercent: 0,
  lateReturnsPerMonth: 2,
};

// ── Internal helpers (mirror mess-menu-policy-service shape) ─────────────────

async function readInt(
  key: string,
  fallback: number,
  institutionId?: string | null,
): Promise<number> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_int', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn('hostel/allocation-policy', `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return (data ?? fallback) as number;
  } catch (err) {
    logger.error('hostel/allocation-policy', `Unexpected error reading ${key}`, err);
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
      logger.warn('hostel/allocation-policy', `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return ((data as string | null) ?? fallback) as T;
  } catch (err) {
    logger.error('hostel/allocation-policy', `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

async function readJson<T>(
  key: string,
  fallback: T,
  institutionId?: string | null,
): Promise<T> {
  try {
    const supabase = createClientSupabaseClient();
    // fn_get_policy_json exists in production (verified 2026-05-26 via pg_proc)
    // but is absent from the generated supabase types. Cast to bypass the
    // narrow RPC name union until `types/supabase.ts` is regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_get_policy_json', {
      p_key: key,
      p_default: fallback as unknown,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn('hostel/allocation-policy', `RPC failed for ${key}, using default`, error);
      return fallback;
    }
    return ((data as T | null) ?? fallback);
  } catch (err) {
    logger.error('hostel/allocation-policy', `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

// ── Public read accessors ────────────────────────────────────────────────────

export function getPremiumEligibility(
  institutionId?: string | null,
): Promise<HostelPremiumEligibility> {
  return readJson<HostelPremiumEligibility>(
    HOSTEL_ALLOCATION_POLICY_KEYS.ELIGIBILITY,
    DEFAULTS.eligibility,
    institutionId,
  );
}

export function getHoldWindowMinutes(institutionId?: string | null): Promise<number> {
  return readInt(
    HOSTEL_ALLOCATION_POLICY_KEYS.HOLD_WINDOW_MINUTES,
    DEFAULTS.holdWindowMinutes,
    institutionId,
  );
}

export function getInviteMaxRetries(institutionId?: string | null): Promise<number> {
  return readInt(
    HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_MAX_RETRIES,
    DEFAULTS.inviteMaxRetries,
    institutionId,
  );
}

export function getInviteWindowHours(institutionId?: string | null): Promise<number> {
  return readInt(
    HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_WINDOW_HOURS,
    DEFAULTS.inviteWindowHours,
    institutionId,
  );
}

export function getPaymentMode(
  institutionId?: string | null,
): Promise<HostelPremiumPaymentMode> {
  return readText<HostelPremiumPaymentMode>(
    HOSTEL_ALLOCATION_POLICY_KEYS.PAYMENT_MODE,
    DEFAULTS.paymentMode,
    institutionId,
  );
}

export function getQuotaPerBlockDefaultPercent(
  institutionId?: string | null,
): Promise<number> {
  return readInt(
    HOSTEL_ALLOCATION_POLICY_KEYS.QUOTA_PER_BLOCK_DEFAULT_PERCENT,
    DEFAULTS.quotaPerBlockDefaultPercent,
    institutionId,
  );
}

export function getLateReturnsPerMonth(institutionId?: string | null): Promise<number> {
  return readInt(
    HOSTEL_ALLOCATION_POLICY_KEYS.LATE_RETURNS_PER_MONTH,
    DEFAULTS.lateReturnsPerMonth,
    institutionId,
  );
}

// ── Snapshot (used by the admin page) ────────────────────────────────────────

export async function getAllocationPolicySnapshot(
  institutionId?: string | null,
): Promise<HostelAllocationPolicySnapshot> {
  const [
    eligibility,
    holdWindowMinutes,
    inviteMaxRetries,
    inviteWindowHours,
    paymentMode,
    quotaPerBlockDefaultPercent,
    lateReturnsPerMonth,
  ] = await Promise.all([
    getPremiumEligibility(institutionId),
    getHoldWindowMinutes(institutionId),
    getInviteMaxRetries(institutionId),
    getInviteWindowHours(institutionId),
    getPaymentMode(institutionId),
    getQuotaPerBlockDefaultPercent(institutionId),
    getLateReturnsPerMonth(institutionId),
  ]);

  return {
    eligibility,
    holdWindowMinutes,
    inviteMaxRetries,
    inviteWindowHours,
    paymentMode,
    quotaPerBlockDefaultPercent,
    lateReturnsPerMonth,
  };
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Update one of the 7 hostel.premium* policies at global scope.
 * Writes directly to `platform_policies.value`. No draft workflow (D2 lock,
 * mirroring the mess-menu pattern). RLS on platform_policies gates which
 * roles may invoke this — the admin page is wrapped in <SuperAdminOnly />
 * for defence-in-depth.
 */
export async function updateAllocationPolicy(
  policyKey: HostelAllocationPolicyKey,
  newValue: number | string | boolean | Record<string, unknown>,
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
    logger.error('hostel/allocation-policy', `Failed to update ${policyKey}`, error);
    throw error;
  }
}
