import { createClient } from '@/lib/supabase/server';
import type { PolicyKey } from './keys';
import {
  type DrilldownMetric,
  type DrilldownRole,
  type DrilldownPolicyKey,
  destinationKey,
  columnsKey,
  actionButtonsKey,
  emptyStateCopyKey,
  enabledKey,
  getDrilldownDefault,
} from './dashboard-drilldown-keys';

/**
 * Read a policy value via fn_get_policy RPC.
 *
 * Resolution priority (server-side): user > institution > role > global.
 * Returns null on RPC error or missing policy. Callers should provide a
 * default via the type-safe helpers below.
 *
 * Phase 1.5a (2026-04-29): canonical runtime-config substrate.
 */
export async function getPolicy<T = unknown>(
  key: PolicyKey,
  scopeId?: string | null
): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy', {
    p_key: key,
    p_scope_id: scopeId ?? null,
  });
  if (error) {
    console.error(`[get-policy] RPC failed for ${key}`, error);
    return null;
  }
  return data as T;
}

/** Read an integer policy with default. */
export async function getPolicyInt(
  key: PolicyKey,
  defaultValue: number,
  scopeId?: string | null
): Promise<number> {
  const v = await getPolicy<number>(key, scopeId);
  return typeof v === 'number' ? v : defaultValue;
}

/** Read a string/enum policy with default. */
export async function getPolicyString(
  key: PolicyKey,
  defaultValue: string,
  scopeId?: string | null
): Promise<string> {
  const v = await getPolicy<string>(key, scopeId);
  return typeof v === 'string' ? v : defaultValue;
}

/** Read a boolean policy with default. */
export async function getPolicyBool(
  key: PolicyKey,
  defaultValue: boolean,
  scopeId?: string | null
): Promise<boolean> {
  const v = await getPolicy<boolean>(key, scopeId);
  return typeof v === 'boolean' ? v : defaultValue;
}

/** Read an array policy with default. */
export async function getPolicyArray<T = string>(
  key: PolicyKey,
  defaultValue: T[],
  scopeId?: string | null
): Promise<T[]> {
  const v = await getPolicy<T[]>(key, scopeId);
  return Array.isArray(v) ? v : defaultValue;
}

// ============================================================================
// Dashboard Drill-Down helpers (B.1 substrate, 2026-05-04)
// ----------------------------------------------------------------------------
// These mirror the surface above but are typed against `DrilldownPolicyKey`
// (not `PolicyKey`) — drill-down keys are dynamically generated from the
// metric × role grid in `dashboard-drilldown-keys.ts`, so listing each one in
// `POLICY_KEYS` would be 50+ entries with zero static-check value.
//
// Internally they call the same `fn_get_policy*` SECURITY DEFINER RPCs the
// rest of the policy substrate uses. Fail-soft: any RPC error returns the
// hardcoded code default so the dashboard never breaks because of a missing
// row or transient DB issue.
//
// 60s in-memory cache: keyed by `${key}|${scopeId ?? ''}`. Matches the
// pattern used by `/admin/nav-config` (Approach 4 substrate).
// ============================================================================

type CacheEntry = { value: unknown; expiresAt: number };
const drilldownCache = new Map<string, CacheEntry>();
const DRILLDOWN_CACHE_TTL_MS = 60_000;

function cacheKey(key: DrilldownPolicyKey, scopeId?: string | null): string {
  return `${key}|${scopeId ?? ''}`;
}
function readCache<T>(key: DrilldownPolicyKey, scopeId?: string | null): T | undefined {
  const ck = cacheKey(key, scopeId);
  const entry = drilldownCache.get(ck);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    drilldownCache.delete(ck);
    return undefined;
  }
  return entry.value as T;
}
function writeCache(key: DrilldownPolicyKey, scopeId: string | null | undefined, value: unknown): void {
  drilldownCache.set(cacheKey(key, scopeId), {
    value,
    expiresAt: Date.now() + DRILLDOWN_CACHE_TTL_MS,
  });
}

/**
 * Test-only: clear the drill-down policy cache. Not exported in production
 * builds; safe to call from server actions / cron / unit tests.
 */
export function __clearDrilldownPolicyCache(): void {
  drilldownCache.clear();
}

async function rpcGetPolicyValue<T>(key: DrilldownPolicyKey, scopeId?: string | null): Promise<T | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: key,
      p_scope_id: scopeId ?? null,
    });
    if (error) {
      console.warn(`[drilldown-policy] RPC failed for ${key}, using default`, error.message);
      return null;
    }
    return data as T;
  } catch (err) {
    console.warn(`[drilldown-policy] RPC threw for ${key}, using default`, err);
    return null;
  }
}

/** Drill-down destination URL (e.g., `/admission/leads?status=applied`). */
export async function getDashboardDrilldownDestination(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string> {
  const key = destinationKey(metric);
  const cached = readCache<string>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<string>(key, scopeId);
  const out = typeof v === 'string' && v.length > 0 ? v : getDrilldownDefault<string>(key);
  writeCache(key, scopeId, out);
  return out;
}

/** Columns to render in the drill-down destination list. */
export async function getDashboardDrilldownColumns(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string[]> {
  const key = columnsKey(metric);
  const cached = readCache<string[]>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<string[]>(key, scopeId);
  const out = Array.isArray(v) ? (v as string[]) : getDrilldownDefault<string[]>(key);
  writeCache(key, scopeId, out);
  return out;
}

/** Action button keys to render per row for a given role. */
export async function getDashboardDrilldownActionButtons(
  metric: DrilldownMetric,
  role: DrilldownRole,
  scopeId?: string | null
): Promise<string[]> {
  const key = actionButtonsKey(metric, role);
  const cached = readCache<string[]>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<string[]>(key, scopeId);
  const out = Array.isArray(v) ? (v as string[]) : getDrilldownDefault<string[]>(key);
  writeCache(key, scopeId, out);
  return out;
}

/** Empty-state copy for the drill-down destination when zero rows. */
export async function getDashboardDrilldownEmptyStateCopy(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string> {
  const key = emptyStateCopyKey(metric);
  const cached = readCache<string>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<string>(key, scopeId);
  const out = typeof v === 'string' && v.length > 0 ? v : getDrilldownDefault<string>(key);
  writeCache(key, scopeId, out);
  return out;
}

/** Whether this drill-down is enabled (toggleable kill-switch per metric). */
export async function getDashboardDrilldownEnabled(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<boolean> {
  const key = enabledKey(metric);
  const cached = readCache<boolean>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<boolean>(key, scopeId);
  const out = typeof v === 'boolean' ? v : getDrilldownDefault<boolean>(key);
  writeCache(key, scopeId, out);
  return out;
}

/** Performance budget (ms) — used for telemetry / dashboards. */
export async function getDashboardDrilldownPerformanceBudgetMs(
  scopeId?: string | null
): Promise<number> {
  const key: DrilldownPolicyKey = 'dashboard.drilldown.performance_budget_ms';
  const cached = readCache<number>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValue<number>(key, scopeId);
  const out = typeof v === 'number' ? v : getDrilldownDefault<number>(key);
  writeCache(key, scopeId, out);
  return out;
}
