/**
 * Layer 3 — Behavioral Learning (DPDPA-gated).
 *
 * Per spec §3 Layer 3: confidence-thresholded override that fires only when:
 *  - User has opted in (preferences.layer3Consent === true)
 *  - At least 30 impressions exist for (user, page, role)
 *  - confidence(action_id) ≥ 0.7
 *
 * Phase 5 PR replaces the stub with the real evaluator that:
 *  1. Reads quick_action_taps for ctx.userId, ctx.page, ctx.role over last 30 days
 *  2. Aggregates by action_id, computes tap_rate
 *  3. Applies confidence ramp-up: confidence = tap_rate * min(1.0, impressions / 30)
 *  4. Returns the highest-confidence action_id ≥ 0.7 threshold
 *
 * Privacy contract: per-user data only — NEVER reads other users' taps.
 * Every query MUST be `WHERE user_id = auth.uid()`.
 *
 * This file is owned by the Phase 5 agent — other layers MUST NOT modify it.
 */

import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

export async function evaluateLayer3(ctx: ResolverContext): Promise<LayerResult> {
  // Phase 5 reads quick_action_taps + computes confidence.
  // Until then: even if consent is on, no inference is possible.
  if (!ctx.preferences.layer3Consent) {
    return { matched: false, reason: 'Layer 3 — user has not opted in' };
  }
  return { matched: false, reason: 'Layer 3 not yet implemented (Phase 5)' };
}
