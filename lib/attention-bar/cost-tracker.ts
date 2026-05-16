/**
 * Attention Bar — Layer 4 cost-tracking + budget enforcement.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * Cost guardrails:
 *  - $5/day hard cap across all users (configurable via quick_action_config).
 *  - 50 uncached LLM calls per user per day (configurable).
 *  - Both limits enforced BEFORE the LLM call; exceeded budget → cached answer.
 *
 * Config is read from `quick_action_config` at module load and cached for 60 s.
 * Call `refreshConfig()` to force an immediate re-read (useful in tests).
 *
 * All DB access uses the service-role client (system-managed data).
 * No LLM calls are made here — this module is a cost guardrail only.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration cache (60-second TTL)
// ─────────────────────────────────────────────────────────────────────────────

interface Layer4Config {
  dailyBudgetUsd: number;
  perUserDailyCalls: number;
  cacheTtlMinutes: number;
  enabled: boolean;
}

let _configCache: Layer4Config | null = null;
let _configFetchedAt = 0;
const CONFIG_TTL_MS = 60_000;

async function getConfig(): Promise<Layer4Config> {
  const now = Date.now();
  if (_configCache && now - _configFetchedAt < CONFIG_TTL_MS) {
    return _configCache;
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('quick_action_config')
    .select('key, value')
    .in('key', [
      'layer_4.daily_budget_usd',
      'layer_4.per_user_daily_calls',
      'layer_4.cache_ttl_minutes',
      'layer_4.enabled',
    ]);

  if (error) {
    // Fall back to safe defaults rather than hard-crashing if config is unavailable.
    console.warn('[cost-tracker] Failed to load config, using defaults:', error.message);
    return {
      dailyBudgetUsd: 5,
      perUserDailyCalls: 50,
      cacheTtlMinutes: 60,
      enabled: true,
    };
  }

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));

  _configCache = {
    dailyBudgetUsd: Number(map['layer_4.daily_budget_usd'] ?? 5),
    perUserDailyCalls: Number(map['layer_4.per_user_daily_calls'] ?? 50),
    cacheTtlMinutes: Number(map['layer_4.cache_ttl_minutes'] ?? 60),
    enabled: Boolean(map['layer_4.enabled'] ?? true),
  };
  _configFetchedAt = now;

  return _configCache;
}

/**
 * Flush the in-memory config cache. Next call to any tracker function will
 * re-read from the DB. Useful in tests and after circuit-breaker trips.
 */
export function refreshConfig(): void {
  _configCache = null;
  _configFetchedAt = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTC day boundaries
// ─────────────────────────────────────────────────────────────────────────────

/** ISO string for the start of today (UTC midnight). */
function todayStartUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// getDailyCostUsd
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sum the cost (in USD) of all Layer 4 AI cache entries written today.
 *
 * We measure spend via `quick_action_ai_cache.cost_usd` rows where
 * `cached_at >= todayStartUtc()`. This is the canonical cost ledger:
 *  - Every setCachedResponse call records cost_usd from the LLM response.
 *  - Cache hits for the same key do NOT incur additional cost.
 *  - The sum equals actual API spend for the UTC day.
 */
export async function getDailyCostUsd(): Promise<number> {
  const supabase = createServiceRoleClient();
  const start = todayStartUtc();

  const { data, error } = await supabase
    .from('quick_action_ai_cache')
    .select('cost_usd')
    .gte('cached_at', start);

  if (error) {
    throw new Error(`[cost-tracker] getDailyCostUsd failed: ${error.message}`);
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// getUserCallsToday
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count Layer 4 calls made by a given user today.
 *
 * Reads from `quick_action_audit` where:
 *  - `fired_layer = 4`
 *  - `user_id = userId`
 *  - `rendered_at >= todayStartUtc()`
 *
 * Counts ALL Layer 4 audit rows (cache hits + misses alike). The per-user
 * budget guards total AI-layer exposure, not just actual LLM calls. This is
 * also simpler and avoids complex JSONB PostgREST filter syntax. Phase 6 main
 * can tighten this to uncached-only if the spec requires it by filtering
 * `trace->>cache_hit != 'true'` in a raw RPC call.
 */
export async function getUserCallsToday(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const start = todayStartUtc();

  const { count, error } = await supabase
    .from('quick_action_audit')
    .select('*', { count: 'exact', head: true })
    .eq('fired_layer', 4)
    .eq('user_id', userId)
    .gte('rendered_at', start);

  if (error) {
    throw new Error(`[cost-tracker] getUserCallsToday failed: ${error.message || error.code || JSON.stringify(error)}`);
  }

  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// checkBudgetAvailable
// ─────────────────────────────────────────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Gate: can this user make a (potentially costly) uncached Layer 4 call?
 *
 * Checks in order:
 *  1. Daily budget ($5 default) — global across all users.
 *  2. Per-user daily call limit (50 default).
 *
 * `projectedCostUsd` is the estimated cost of the pending call (caller should
 * pass the per-call average for the model; e.g. ~$0.002 for Haiku 4.5).
 *
 * Returns `{ allowed: true }` if both checks pass.
 * Returns `{ allowed: false, reason: "..." }` if either cap is exceeded.
 *
 * Does NOT mutate any DB state — pure read-only check. Call `recordLayer4Call`
 * after the actual LLM call completes.
 */
export async function checkBudgetAvailable({
  userId,
  projectedCostUsd,
}: {
  userId: string;
  projectedCostUsd: number;
}): Promise<BudgetCheckResult> {
  const [config, dailyCost, userCalls] = await Promise.all([
    getConfig(),
    getDailyCostUsd(),
    getUserCallsToday(userId),
  ]);

  if (dailyCost + projectedCostUsd > config.dailyBudgetUsd) {
    return {
      allowed: false,
      reason: `Daily budget cap: $${config.dailyBudgetUsd.toFixed(2)} limit; ` +
        `$${dailyCost.toFixed(4)} spent + $${projectedCostUsd.toFixed(4)} projected = ` +
        `$${(dailyCost + projectedCostUsd).toFixed(4)} > cap`,
    };
  }

  if (userCalls >= config.perUserDailyCalls) {
    return {
      allowed: false,
      reason: `Per-user daily call limit: ${config.perUserDailyCalls} calls/day; ` +
        `user ${userId} has used ${userCalls}`,
    };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// recordLayer4Call
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordCallArgs {
  userId: string;
  page: string;
  role: string;
  /** Actual cost charged by the LLM provider for this call. 0 on cache hit. */
  costUsd: number;
  /** True when the response came from cache (no LLM charged). */
  cacheHit: boolean;
  /** Optional: rule_id or action_id for traceability. */
  actionId?: string;
}

/**
 * Append a Layer 4 audit row to `quick_action_audit`.
 *
 * The `trace` JSONB column stores cost + cache-hit metadata so that:
 *  - `getDailyCostUsd` can measure real spend.
 *  - `getUserCallsToday` can distinguish cache hits from actual LLM calls.
 *  - The audit log tab in the admin UI can surface cost per call.
 *
 * Throws on DB error. Caller should fire-and-forget in a try/catch if
 * audit failure must not break the user-facing resolve path.
 */
export async function recordLayer4Call({
  userId,
  page,
  role,
  costUsd,
  cacheHit,
  actionId,
}: RecordCallArgs): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('quick_action_audit')
    .insert({
      user_id: userId,
      page,
      role,
      fired_layer: 4,
      action_id: actionId ?? null,
      trace: {
        cache_hit: cacheHit,
        cost_usd: costUsd,
        recorded_at: new Date().toISOString(),
      },
    });

  if (error) {
    throw new Error(`[cost-tracker] recordLayer4Call failed: ${error.message}`);
  }
}
