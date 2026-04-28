/**
 * Layer 4 — AI Fallback (allowlisted, cached, cost-bounded).
 *
 * Per spec §3 Layer 4: only fires when L0-L3 all return null. LLM ranks
 * available actions for (page, role, recent_actions, time_of_day). Cached
 * by page×role×hour. Daily $5 budget cap with circuit-breaker.
 *
 * Phase 6-main PR replaces the stub with the real evaluator that:
 *  1. Checks isLayer4Enabled() (from circuit-breaker.ts) — bail if false
 *  2. Builds cacheKey = `${page}|${role}|${hourBucket}`
 *  3. Checks getCachedResponse(cacheKey) — if hit, return that action
 *  4. Checks checkBudgetAvailable() — if blocked, return null
 *  5. Calls Claude Haiku with allowlist of registered Layer 1 + Layer 2
 *     candidates for this page×role
 *  6. Validates LLM response action_id is in allowlist (reject hallucinations)
 *  7. Caches via setCachedResponse + records cost via recordLayer4Call
 *  8. Returns the chosen action
 *
 * Cache + cost-tracker + circuit-breaker primitives ship in #555 (Phase 6a).
 *
 * This file is owned by the Phase 6-main agent — other layers MUST NOT modify it.
 */

import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

export async function evaluateLayer4(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 6-main wires Claude Haiku 4.5 with allowlist + cache + cost guardrails.
  return { matched: false, reason: 'Layer 4 not yet implemented (Phase 6-main)' };
}
