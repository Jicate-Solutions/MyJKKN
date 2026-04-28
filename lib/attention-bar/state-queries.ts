/**
 * State query registry — runtime hydrator + parallel fetcher.
 *
 * Spec §3 Layer 2: Layer 2 rules don't query the DB directly. They reference
 * named queries registered in `quick_action_state_queries` (e.g.,
 * 'counselor.pending_leads', 'attendance.unmarked_periods_today'). Each maps to
 * a SECURITY DEFINER function in `02_functions.sql`.
 *
 * This module:
 *  1. Hydrates STATE_QUERIES from `quick_action_state_queries` at first use,
 *     caches for 60s. Module-level cache survives across requests in the same
 *     server runtime.
 *  2. fetchStateQueries(keys, ctx) calls each mapped fn in parallel via
 *     Supabase RPC, with per-key timeout (80ms) and a global wall-clock budget.
 *     Per-key failure is fail-soft — that key's slot is `null`, but other
 *     queries still succeed and Layer 2 continues.
 *
 * Why module-level cache (not per-request): the registry is global, changes
 * rarely (rule editors don't add state queries — that needs a code+SQL change),
 * and the alternative (re-reading the table on every resolve) wastes budget.
 *
 * Param shape per fn (locked at function definition time, see 02_functions.sql):
 *   counselor.pending_leads          → { p_user_id }
 *   attendance.unmarked_periods_today→ { p_user_id, p_institution_id? }
 *   billing.overdue_invoices         → { p_user_id, p_institution_id? }
 *   admission.leads.unassigned_count → { p_institution_id? }
 *   attendance.faculty_compliance_today → { p_user_id }
 *
 * The mapping is hardcoded here because the param-shape isn't in
 * `quick_action_state_queries` — adding a new state query is a code change in
 * THIS file plus a fn definition. That's by design (security-sensitive).
 */

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { StateQueryDescriptor } from './types';

/* ─────────────────────────────────────────────────────────────────
 * Registry cache (60s TTL)
 * ─────────────────────────────────────────────────────────────── */

let _registryCache: Map<string, StateQueryDescriptor> | null = null;
let _registryFetchedAt = 0;
const REGISTRY_TTL_MS = 60_000;

/** Force the next call to refetch the registry. Useful for tests. */
export function refreshStateQueriesRegistry(): void {
  _registryCache = null;
  _registryFetchedAt = 0;
}

async function getRegistry(): Promise<Map<string, StateQueryDescriptor>> {
  const now = Date.now();
  if (_registryCache && now - _registryFetchedAt < REGISTRY_TTL_MS) {
    return _registryCache;
  }
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('quick_action_state_queries')
      .select('query_key, description, sql_function_name, return_shape, rate_limit_per_minute')
      .eq('is_active', true);

    if (error) throw error;

    const map = new Map<string, StateQueryDescriptor>();
    for (const row of data ?? []) {
      map.set(row.query_key, {
        key: row.query_key,
        description: row.description ?? '',
        sqlFunctionName: row.sql_function_name,
        returnShape: row.return_shape ?? {},
        rateLimitPerMinute: row.rate_limit_per_minute ?? 30,
      });
    }
    _registryCache = map;
    _registryFetchedAt = now;
    return map;
  } catch (err) {
    console.warn(
      '[attention-bar/state-queries] registry fetch failed, using empty map',
      err instanceof Error ? err.message : err,
    );
    // Don't poison the cache with empty on transient failures — leave previous cache.
    return _registryCache ?? new Map();
  }
}

/**
 * Read-only handle on the registry. Async because the first call hydrates.
 * Phase-2 callers (resolver, debug API) use this.
 */
export async function getStateQueries(): Promise<ReadonlyMap<string, StateQueryDescriptor>> {
  return getRegistry();
}

/**
 * Backward-compatible export — Phase 1 / Phase 2 modules import a synchronous
 * Map. After hydration this returns the live cache; before hydration it's an
 * empty Map. Callers that need correctness on first request should await
 * `getStateQueries()` instead.
 */
export const STATE_QUERIES: ReadonlyMap<string, StateQueryDescriptor> = new Proxy(
  new Map<string, StateQueryDescriptor>(),
  {
    get(_target, prop) {
      const live = _registryCache ?? new Map<string, StateQueryDescriptor>();
      const v = live[prop as keyof Map<string, StateQueryDescriptor>];
      return typeof v === 'function' ? v.bind(live) : v;
    },
  },
) as unknown as ReadonlyMap<string, StateQueryDescriptor>;

/* ─────────────────────────────────────────────────────────────────
 * Parallel fetcher
 * ─────────────────────────────────────────────────────────────── */

export interface StateQueryContext {
  userId: string;
  role: string;
  /** Caller-supplied institution; resolver passes profiles.institution_id. */
  institutionId?: string | null;
}

/** Total wall-clock budget across all keys. */
const TOTAL_BUDGET_MS = 80;
/** Per-key timeout — failure cascades to null, not throw. */
const PER_KEY_TIMEOUT_MS = 80;

/**
 * Resolve a list of state-query keys into their result blobs.
 *
 * Returns an object keyed by query_key. Failed / timed-out queries map to
 * `null` so the rule evaluator can still see the key existed. The total
 * wall-clock is bounded to TOTAL_BUDGET_MS — anything still pending after
 * that resolves to null.
 *
 * Layer 2 must remain disable-able and fail-soft, so this function never
 * throws. It logs warnings on failure.
 */
export async function fetchStateQueries(
  keys: readonly string[],
  ctx: StateQueryContext,
): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};

  const registry = await getRegistry();
  const supabase = await createServerSupabaseClient();

  // Build the global wall-clock fence.
  const deadline = Promise.resolve().then(
    () => new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), TOTAL_BUDGET_MS)),
  );

  const out: Record<string, unknown> = {};

  await Promise.all(
    keys.map(async (key) => {
      const desc = registry.get(key);
      if (!desc) {
        out[key] = null;
        return;
      }

      const params = paramsFor(desc.sqlFunctionName, ctx);
      const fnPromise = supabase
        .rpc(desc.sqlFunctionName, params)
        .then((res) => (res.error ? { error: res.error.message } : res.data));

      const perKeyTimeout = new Promise<typeof TIMEOUT>((resolve) =>
        setTimeout(() => resolve(TIMEOUT), PER_KEY_TIMEOUT_MS),
      );

      try {
        const winner = await Promise.race([fnPromise, perKeyTimeout, deadline]);
        if (winner === TIMEOUT) {
          out[key] = null;
          console.warn(
            `[attention-bar/state-queries] timeout fetching '${key}' after ${PER_KEY_TIMEOUT_MS}ms`,
          );
          return;
        }
        if (winner && typeof winner === 'object' && 'error' in (winner as Record<string, unknown>)) {
          out[key] = null;
          console.warn(
            `[attention-bar/state-queries] error fetching '${key}':`,
            (winner as { error: string }).error,
          );
          return;
        }
        out[key] = winner ?? null;
      } catch (err) {
        out[key] = null;
        console.warn(
          `[attention-bar/state-queries] threw fetching '${key}':`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );

  return out;
}

/* ─────────────────────────────────────────────────────────────────
 * Param-shape mapping per function name.
 *
 * Hardcoded so the runtime never tries to invent params from a JSON shape it
 * can't validate. New SQL fns must be added here AND in 02_functions.sql.
 * ─────────────────────────────────────────────────────────────── */

function paramsFor(fnName: string, ctx: StateQueryContext): Record<string, unknown> {
  switch (fnName) {
    case 'fn_aqs_counselor_pending_leads':
      return { p_user_id: ctx.userId };
    case 'fn_aqs_attendance_unmarked_periods_today':
      return { p_user_id: ctx.userId, p_institution_id: ctx.institutionId ?? null };
    case 'fn_aqs_billing_overdue_invoices':
      return { p_user_id: ctx.userId, p_institution_id: ctx.institutionId ?? null };
    case 'fn_aqs_admission_leads_unassigned_count':
      return { p_institution_id: ctx.institutionId ?? null };
    case 'fn_aqs_attendance_faculty_compliance_today':
      return { p_user_id: ctx.userId };
    default:
      return {};
  }
}

const TIMEOUT: unique symbol = Symbol('state-query-timeout');
