/**
 * Client-safe variant of get-policy.ts — uses the BROWSER supabase client so
 * the call is safe to bundle into client components / TanStack hooks.
 *
 * Why this exists
 * ---------------
 * The original `lib/policies/get-policy.ts` imports `next/headers` (via
 * `lib/supabase/server.ts`) which Next.js 16 forbids in any module that ends
 * up in the client bundle. PR #617 added `getPolicyInt` to several services
 * (audit-discovery, analytics-engagement, etc.) that ARE bundled into client
 * components — webpack rejected the resulting bundle (caught 2026-04-29).
 *
 * Resolution semantics
 * --------------------
 * Identical RPC (`fn_get_policy` SECURITY DEFINER) — only the supabase client
 * differs. User-scoped lookups still work because the browser client carries
 * the auth cookie. Server callers should keep using `get-policy.ts`; client
 * callers should use this file.
 *
 * When to use which
 * -----------------
 *   - API routes / server actions / cron / RSC →  `@/lib/policies/get-policy`
 *   - Client components / TanStack hooks / client services →  this file
 *
 * Phase 1.5a (2026-04-29): canonical runtime-config substrate, client-side fork.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
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

const supabase = createClientSupabaseClient();

export async function getPolicy<T = unknown>(
  key: PolicyKey,
  scopeId?: string | null
): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('fn_get_policy', {
    p_key: key,
    p_scope_id: scopeId ?? null,
  });
  if (error) {
    console.error(`[get-policy-client] RPC failed for ${key}`, error);
    return null;
  }
  return data as T;
}

export async function getPolicyInt(
  key: PolicyKey,
  defaultValue: number,
  scopeId?: string | null
): Promise<number> {
  const v = await getPolicy<number>(key, scopeId);
  return typeof v === 'number' ? v : defaultValue;
}

export async function getPolicyString(
  key: PolicyKey,
  defaultValue: string,
  scopeId?: string | null
): Promise<string> {
  const v = await getPolicy<string>(key, scopeId);
  return typeof v === 'string' ? v : defaultValue;
}

export async function getPolicyBool(
  key: PolicyKey,
  defaultValue: boolean,
  scopeId?: string | null
): Promise<boolean> {
  const v = await getPolicy<boolean>(key, scopeId);
  return typeof v === 'boolean' ? v : defaultValue;
}

export async function getPolicyArray<T = string>(
  key: PolicyKey,
  defaultValue: T[],
  scopeId?: string | null
): Promise<T[]> {
  const v = await getPolicy<T[]>(key, scopeId);
  return Array.isArray(v) ? v : defaultValue;
}

// ============================================================================
// Dashboard Drill-Down helpers — client variant (B.1 substrate, 2026-05-04)
// ----------------------------------------------------------------------------
// Mirror of `lib/policies/get-policy.ts` drill-down section. Uses the browser
// supabase client (no `next/headers` import). Same fail-soft + 60s in-memory
// cache semantics. See server variant for full doc-comments.
//
// Why both: shared lib must ship server + client variants from day one
// (CLAUDE.md memory `feedback_shared_lib_must_ship_server_and_client_variants`).
// Group Dashboard is a client component, so B.2 will pull from this file.
// ============================================================================

type CacheEntry = { value: unknown; expiresAt: number };
const drilldownCacheClient = new Map<string, CacheEntry>();
const DRILLDOWN_CACHE_TTL_MS_CLIENT = 60_000;

function cacheKeyClient(key: DrilldownPolicyKey, scopeId?: string | null): string {
  return `${key}|${scopeId ?? ''}`;
}
function readCacheClient<T>(key: DrilldownPolicyKey, scopeId?: string | null): T | undefined {
  const ck = cacheKeyClient(key, scopeId);
  const entry = drilldownCacheClient.get(ck);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    drilldownCacheClient.delete(ck);
    return undefined;
  }
  return entry.value as T;
}
function writeCacheClient(key: DrilldownPolicyKey, scopeId: string | null | undefined, value: unknown): void {
  drilldownCacheClient.set(cacheKeyClient(key, scopeId), {
    value,
    expiresAt: Date.now() + DRILLDOWN_CACHE_TTL_MS_CLIENT,
  });
}

export function __clearDrilldownPolicyCacheClient(): void {
  drilldownCacheClient.clear();
}

async function rpcGetPolicyValueClient<T>(
  key: DrilldownPolicyKey,
  scopeId?: string | null
): Promise<T | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_get_policy', {
      p_key: key,
      p_scope_id: scopeId ?? null,
    });
    if (error) {
      console.warn(`[drilldown-policy-client] RPC failed for ${key}, using default`, error.message);
      return null;
    }
    return data as T;
  } catch (err) {
    console.warn(`[drilldown-policy-client] RPC threw for ${key}, using default`, err);
    return null;
  }
}

export async function getDashboardDrilldownDestination(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string> {
  const key = destinationKey(metric);
  const cached = readCacheClient<string>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<string>(key, scopeId);
  const out = typeof v === 'string' && v.length > 0 ? v : getDrilldownDefault<string>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}

export async function getDashboardDrilldownColumns(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string[]> {
  const key = columnsKey(metric);
  const cached = readCacheClient<string[]>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<string[]>(key, scopeId);
  const out = Array.isArray(v) ? (v as string[]) : getDrilldownDefault<string[]>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}

export async function getDashboardDrilldownActionButtons(
  metric: DrilldownMetric,
  role: DrilldownRole,
  scopeId?: string | null
): Promise<string[]> {
  const key = actionButtonsKey(metric, role);
  const cached = readCacheClient<string[]>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<string[]>(key, scopeId);
  const out = Array.isArray(v) ? (v as string[]) : getDrilldownDefault<string[]>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}

export async function getDashboardDrilldownEmptyStateCopy(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<string> {
  const key = emptyStateCopyKey(metric);
  const cached = readCacheClient<string>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<string>(key, scopeId);
  const out = typeof v === 'string' && v.length > 0 ? v : getDrilldownDefault<string>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}

export async function getDashboardDrilldownEnabled(
  metric: DrilldownMetric,
  scopeId?: string | null
): Promise<boolean> {
  const key = enabledKey(metric);
  const cached = readCacheClient<boolean>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<boolean>(key, scopeId);
  const out = typeof v === 'boolean' ? v : getDrilldownDefault<boolean>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}

export async function getDashboardDrilldownPerformanceBudgetMs(
  scopeId?: string | null
): Promise<number> {
  const key: DrilldownPolicyKey = 'dashboard.drilldown.performance_budget_ms';
  const cached = readCacheClient<number>(key, scopeId);
  if (cached !== undefined) return cached;
  const v = await rpcGetPolicyValueClient<number>(key, scopeId);
  const out = typeof v === 'number' ? v : getDrilldownDefault<number>(key);
  writeCacheClient(key, scopeId, out);
  return out;
}
