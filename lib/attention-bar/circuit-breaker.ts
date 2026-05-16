/**
 * Attention Bar — Layer 4 circuit-breaker.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * The circuit-breaker protects against runaway AI spend:
 *  - `isLayer4Enabled()` — fast read gate; resolver calls this before even
 *    attempting a cache lookup or LLM call.
 *  - `tripCircuitBreaker(reason)` — disables Layer 4 globally, records the
 *    reason + timestamp in config for the admin UI to surface.
 *  - `resetCircuitBreaker()` — re-enables Layer 4 (manual reset by super_admin).
 *  - `checkConsecutiveBudgetCapDays()` — counts how many consecutive UTC days
 *    the daily budget cap was hit. Phase 6 main calls this once per day;
 *    trips the breaker automatically at 5 consecutive cap days (spec §3 L4).
 *
 * All reads/writes use the service-role client (bypasses RLS — config is
 * system-managed, not user-owned).
 *
 * No LLM calls are made here.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { refreshConfig } from './cost-tracker';

// ─────────────────────────────────────────────────────────────────────────────
// Config keys used by this module
// ─────────────────────────────────────────────────────────────────────────────

const KEY_ENABLED = 'layer_4.enabled';
const KEY_LAST_BREAKER_TRIP = 'layer_4.last_breaker_trip';

// Consecutive cap-day trigger (spec §3 Layer 4).
const CONSECUTIVE_CAP_DAY_LIMIT = 5;

// ─────────────────────────────────────────────────────────────────────────────
// isLayer4Enabled
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if Layer 4 AI fallback is currently enabled.
 *
 * Called by the resolver before the cache lookup — a disabled Layer 4 should
 * never hit the cache table at all, so this must be fast.
 *
 * Reads directly from DB (no local TTL cache here) so a manual toggle from
 * the admin UI takes effect on the next resolve without a server restart.
 * The single-row read is ~1ms on local Supabase.
 */
export async function isLayer4Enabled(): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('quick_action_config')
    .select('value')
    .eq('key', KEY_ENABLED)
    .maybeSingle();

  if (error) {
    // Fail OPEN: if config is unreadable, allow the call and let cost-tracker
    // enforce the budget. The alternative (fail closed) would silently degrade
    // ALL users when Supabase has a transient hiccup.
    console.warn('[circuit-breaker] isLayer4Enabled read failed, defaulting to true:', error.message);
    return true;
  }

  // Row missing → treat as enabled (safe: config wasn't seeded yet).
  if (!data) return true;

  // Value is JSONB; it was seeded as `true` (boolean), but may be stored as
  // the JSON boolean. Handle both boolean and string representations.
  return data.value === true || data.value === 'true';
}

// ─────────────────────────────────────────────────────────────────────────────
// tripCircuitBreaker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disable Layer 4 globally and record the trip reason + timestamp.
 *
 * Sets two config rows atomically:
 *  1. `layer_4.enabled` → false
 *  2. `layer_4.last_breaker_trip` → { reason, at }
 *
 * The admin UI's Layer 4 tab surfaces the trip reason so the Director
 * understands why AI fallback stopped before hitting "Reset".
 *
 * Also calls `refreshConfig()` so the cost-tracker in-memory cache is
 * invalidated immediately — prevents a window where the tracker thinks
 * Layer 4 is on after the breaker trips.
 */
export async function tripCircuitBreaker(reason: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const upserts = [
    { key: KEY_ENABLED, value: false, updated_at: now },
    {
      key: KEY_LAST_BREAKER_TRIP,
      value: { reason, at: now },
      updated_at: now,
    },
  ];

  const { error } = await supabase
    .from('quick_action_config')
    .upsert(upserts, { onConflict: 'key' });

  if (error) {
    throw new Error(`[circuit-breaker] tripCircuitBreaker failed: ${error.message}`);
  }

  // Flush cost-tracker config cache so next call re-reads the disabled state.
  refreshConfig();
}

// ─────────────────────────────────────────────────────────────────────────────
// resetCircuitBreaker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-enable Layer 4 and clear the last-trip record.
 *
 * Intended to be called by a super_admin via the admin UI (Tab 5 kill-switch).
 * Does not check whether the budget has been adjusted — the Director is
 * responsible for the deliberate reset.
 */
export async function resetCircuitBreaker(): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  // Re-enable.
  const { error: enableError } = await supabase
    .from('quick_action_config')
    .upsert(
      { key: KEY_ENABLED, value: true, updated_at: now },
      { onConflict: 'key' }
    );

  if (enableError) {
    throw new Error(`[circuit-breaker] resetCircuitBreaker (enable) failed: ${enableError.message}`);
  }

  // Remove the trip record so the admin UI shows "no active trip".
  const { error: clearError } = await supabase
    .from('quick_action_config')
    .delete()
    .eq('key', KEY_LAST_BREAKER_TRIP);

  if (clearError) {
    // Non-fatal: the row may not exist (already cleared or never set).
    console.warn('[circuit-breaker] resetCircuitBreaker: could not remove trip record:', clearError.message);
  }

  // Flush cost-tracker config cache.
  refreshConfig();
}

// ─────────────────────────────────────────────────────────────────────────────
// checkConsecutiveBudgetCapDays
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count how many consecutive UTC days (ending yesterday) the daily budget cap
 * was hit.
 *
 * Algorithm:
 *  1. Fetch the last N days of `quick_action_ai_cache` spend, grouped by
 *     UTC date (using `cached_at::date`).
 *  2. Walk backwards from yesterday; stop at the first day that did NOT hit
 *     the cap. The count of consecutive cap-days is returned.
 *
 * Phase 6 main calls this once per day (e.g., in the nightly cron that also
 * prunes the cache). If the return value >= CONSECUTIVE_CAP_DAY_LIMIT (5),
 * the caller should invoke `tripCircuitBreaker(reason)` automatically.
 *
 * Returns 0 if no cap was hit recently. Returns >= 1 if yesterday hit the cap.
 *
 * NOTE: This query looks at cache spend only. It is intentionally conservative:
 * if there is no `quick_action_ai_cache` data for a day (no Layer 4 calls),
 * that day is treated as $0 spend → NOT a cap day → streak resets.
 */
export async function checkConsecutiveBudgetCapDays(): Promise<number> {
  const supabase = createServiceRoleClient();

  // Read config for the budget limit.
  const { data: configData, error: configError } = await supabase
    .from('quick_action_config')
    .select('value')
    .eq('key', 'layer_4.daily_budget_usd')
    .maybeSingle();

  if (configError) {
    throw new Error(`[circuit-breaker] checkConsecutiveBudgetCapDays config read failed: ${configError.message}`);
  }

  const budgetUsd: number = configData ? Number(configData.value) : 5;

  // Look back up to CONSECUTIVE_CAP_DAY_LIMIT + 1 days (one extra to confirm
  // the streak broke before that window).
  const lookbackDays = CONSECUTIVE_CAP_DAY_LIMIT + 1;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  since.setUTCHours(0, 0, 0, 0);

  // Aggregate cost per UTC date. Supabase doesn't support GROUP BY in the
  // select builder directly, so we fetch the raw rows and aggregate in JS.
  // Row volume is bounded: at most ~50 cache rows/day × 6 days = ~300 rows.
  const { data: rows, error: rowsError } = await supabase
    .from('quick_action_ai_cache')
    .select('cached_at, cost_usd')
    .gte('cached_at', since.toISOString());

  if (rowsError) {
    throw new Error(`[circuit-breaker] checkConsecutiveBudgetCapDays rows failed: ${rowsError.message}`);
  }

  // Aggregate: date string → total cost.
  const costByDay: Record<string, number> = {};
  for (const row of rows ?? []) {
    const day = row.cached_at.slice(0, 10); // "YYYY-MM-DD"
    costByDay[day] = (costByDay[day] ?? 0) + Number(row.cost_usd);
  }

  // Walk backwards from yesterday, count consecutive cap days.
  let consecutiveDays = 0;
  const today = new Date();
  for (let i = 1; i <= CONSECUTIVE_CAP_DAY_LIMIT; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const spend = costByDay[dayStr] ?? 0;

    if (spend >= budgetUsd) {
      consecutiveDays++;
    } else {
      // Streak broken.
      break;
    }
  }

  return consecutiveDays;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-trip helper (called by Phase 6 main cron)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check consecutive cap days and auto-trip if the limit is reached.
 * Returns true if the breaker was tripped, false otherwise.
 *
 * Phase 6 main wires this into the nightly cron alongside cache pruning.
 */
export async function autoTripIfNeeded(): Promise<boolean> {
  const consecutiveDays = await checkConsecutiveBudgetCapDays();

  if (consecutiveDays >= CONSECUTIVE_CAP_DAY_LIMIT) {
    const reason =
      `Automatic trip: daily budget cap hit for ${consecutiveDays} consecutive days ` +
      `(limit: ${CONSECUTIVE_CAP_DAY_LIMIT}). Manual reset required via admin Layer 4 tab.`;
    await tripCircuitBreaker(reason);
    return true;
  }

  return false;
}
