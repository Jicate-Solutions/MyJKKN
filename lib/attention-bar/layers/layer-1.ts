/**
 * Layer 1 — Static Defaults (curated page × role registry).
 *
 * Per spec §3 Layer 1: every (page, role) pair must have an entry in
 * lib/attention-bar/static-defaults.ts. The safety net.
 *
 * This evaluator is intentionally simple — looks up via findStaticDefault
 * and returns the build()-produced action. The complexity lives in the
 * registry, not here.
 */

import { findStaticDefault } from '../static-defaults';
import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

export async function evaluateLayer1(ctx: ResolverContext): Promise<LayerResult> {
  const def = findStaticDefault(ctx.page, ctx.role);
  if (!def) return { matched: false, reason: 'No Layer 1 default registered' };
  return { matched: true, action: def.build(ctx) };
}
