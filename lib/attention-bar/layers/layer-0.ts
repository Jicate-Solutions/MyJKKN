/**
 * Layer 0 — Urgent Notifications (real-time, Supabase Realtime).
 *
 * Per spec §3 Layer 0: listens to `notifications` table inserts where
 * severity='red' AND requires_acknowledgment=true AND target user matches
 * auth.uid(). Latency budget: 2 seconds end-to-end (insert → bar render).
 *
 * Phase 3 PR replaces the stub with the actual Realtime + DB-driven evaluator.
 * This file is owned by the Phase 3 agent — other layers MUST NOT modify it.
 */

import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

export async function evaluateLayer0(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 3 plugs in Supabase Realtime listener for severity=red notifications.
  return { matched: false, reason: 'Layer 0 not yet implemented (Phase 3)' };
}
