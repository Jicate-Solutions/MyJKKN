/**
 * Layer 1 — Static Defaults (curated page × role registry).
 *
 * Per spec §3 Layer 1: every (page, role) pair must have an entry in
 * lib/attention-bar/static-defaults.ts. The safety net.
 *
 * This evaluator is intentionally simple — looks up via findStaticDefault
 * and returns the build()-produced action. The complexity lives in the
 * registry, not here.
 *
 * Director-tunable secondary emission (2026-04-29):
 *   When the global policy `attention_bar.layer1.return_secondary` is true,
 *   L1 ALSO returns the catch-all ('*'/'*') as a secondary match — so the
 *   split bar renders by default on every page even when no Layer 2 rule has
 *   been configured. Default false → unchanged single-hit behaviour.
 *
 *   Cache: 60s TTL, mirroring the layer-2.ts enabled-flag pattern.
 *   Skip conditions: catch-all not registered, OR catch-all entry IS the
 *   primary entry (page='*' AND role='*' resolved both), OR catch-all href
 *   equals primary href (would dedupe to nothing in the resolver anyway).
 */

import { POLICY_KEYS } from '@/lib/policies/keys';
import { getPolicyBool } from '@/lib/policies/get-policy';
import { findStaticDefault, STATIC_DEFAULTS } from '../static-defaults';
import type { ResolverContext, StaticDefault } from '../types';
import type { LayerResult } from './layer-result';

/* ─────────────────────────────────────────────────────────────────
 * Toggle cache — read at most once per 60s. Mirrors layer-2.ts.
 * ─────────────────────────────────────────────────────────────── */

let _returnSecondaryCache: { value: boolean; fetchedAt: number } | null = null;
const TOGGLE_TTL_MS = 60_000;

async function isReturnSecondaryEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_returnSecondaryCache && now - _returnSecondaryCache.fetchedAt < TOGGLE_TTL_MS) {
    return _returnSecondaryCache.value;
  }
  try {
    const value = await getPolicyBool(
      POLICY_KEYS.ATTENTION_BAR_L1_RETURN_SECONDARY,
      false,
    );
    _returnSecondaryCache = { value, fetchedAt: now };
    return value;
  } catch (err) {
    console.warn(
      '[attention-bar/layer-1] failed to read attention_bar.layer1.return_secondary policy, defaulting to false',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** For tests — force re-read of the policy on next call. */
export function _resetLayer1ReturnSecondaryCache(): void {
  _returnSecondaryCache = null;
}

/* ─────────────────────────────────────────────────────────────────
 * Helper: locate the catch-all directly. findStaticDefault('*', '*')
 * already does this via fallback chain, but spelling it out keeps the
 * intent explicit and bypasses any future specificity-rule changes.
 * ─────────────────────────────────────────────────────────────── */

function findCatchAllDefault(): StaticDefault | null {
  return STATIC_DEFAULTS.find(d => d.page === '*' && d.role === '*') ?? null;
}

/* ─────────────────────────────────────────────────────────────────
 * Public evaluator
 * ─────────────────────────────────────────────────────────────── */

export async function evaluateLayer1(ctx: ResolverContext): Promise<LayerResult> {
  const primary = findStaticDefault(ctx.page, ctx.role);
  if (!primary) return { matched: false, reason: 'No Layer 1 default registered' };

  const action = primary.build(ctx);

  // Director-tunable: optionally surface the catch-all as a secondary so the
  // split bar renders on every page by default. Read the policy through the
  // 60s cache to keep hot-path overhead negligible.
  if (await isReturnSecondaryEnabled()) {
    const catchAll = findCatchAllDefault();
    // Only emit a secondary when the catch-all is a DIFFERENT registry entry
    // than the primary (otherwise we'd be returning the same action twice).
    if (catchAll && (catchAll.page !== primary.page || catchAll.role !== primary.role)) {
      const secondary = catchAll.build(ctx);
      // Final dedup at the action level — if the catch-all happens to point at
      // the same href as the role-specific primary (config drift), drop it.
      if (secondary.href !== action.href) {
        return { matched: true, action, secondary };
      }
    }
  }

  return { matched: true, action };
}
