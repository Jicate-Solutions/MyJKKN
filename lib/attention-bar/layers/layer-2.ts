/**
 * Layer 2 — State-aware Rules Engine (admin-configurable).
 *
 * Per spec §3 Layer 2: reads quick_action_rules table, evaluates each rule's
 * when_clause against state-query results, returns first matching action by
 * priority DESC, created_at ASC.
 *
 * Phase 4-main PR replaces the stub with the real evaluator that:
 *  1. Queries quick_action_rules WHERE (page=ctx.page OR page='*')
 *     AND (role=ctx.role OR role='*') AND is_active=true
 *  2. Sorts by priority DESC, created_at ASC
 *  3. For each rule, calls fetchStateQueries() for the keys mentioned in when_clause
 *  4. Evaluates when_clause against the state blob
 *  5. Returns the first match's action_template (interpolating {state.*} placeholders)
 *
 * State queries are owned by Phase 4a (already shipped — see #556).
 *
 * This file is owned by the Phase 4-main agent — other layers MUST NOT modify it.
 */

import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

export async function evaluateLayer2(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 4-main reads quick_action_rules + evaluates when_clause against state.
  return { matched: false, reason: 'Layer 2 not yet implemented (Phase 4-main)' };
}
