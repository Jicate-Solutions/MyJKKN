/**
 * State query registry.
 *
 * Layer 2 rules don't query the DB directly. They reference named state queries
 * (e.g., 'counselor.pending_leads', 'attendance.unmarked_periods_today') which
 * map to SECURITY DEFINER SQL functions registered in `quick_action_state_queries`.
 *
 * Phase 1 (this file) ships the type and an empty registry. Phase 4 (Layer 2
 * rules engine) populates it with the actual queries via DB seed + a small
 * server-side fetcher.
 *
 * Why this exists in Phase 1:
 *  - Resolver imports it; satisfying the contract now means Phase 4 plugs in
 *    without resolver changes.
 *  - The shape is part of the spec — codifying it locks the contract while
 *    the conversation is fresh.
 */

import type { StateQueryDescriptor } from './types';

/**
 * In-memory registry. Phase 4 will hydrate from `quick_action_state_queries`.
 * For Phase 1 we ship empty — Layer 2 is disabled by default behavior anyway
 * (no rules yet means nothing to evaluate).
 */
export const STATE_QUERIES: ReadonlyMap<string, StateQueryDescriptor> =
  new Map<string, StateQueryDescriptor>();

/**
 * Resolve a list of state-query keys into their result blobs.
 *
 * Phase 1 returns `{}`. Phase 4 calls each registered SQL function in parallel,
 * subject to per-key rate limits and an 80ms total budget.
 */
export async function fetchStateQueries(
  keys: readonly string[],
  _ctx: { userId: string; role: string },
): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  // Phase 4 will replace this stub with the real implementation.
  return {};
}
