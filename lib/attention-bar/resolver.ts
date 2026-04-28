/**
 * Attention Bar resolver — priority cascade core.
 *
 * Spec §2 Architecture: priority order is 0 → 2 → 3 → 1 → 4. First match wins.
 *
 * Phase 1 ships only Layer 1 with stubs for Layers 0/2/3/4. The stubs return
 * `null` (no match) and emit `'skipped'` trace entries. Subsequent phases
 * replace each stub independently:
 *   - Phase 3 → Layer 0 (Supabase Realtime urgent notifications)
 *   - Phase 4 → Layer 2 (rules engine + state queries)
 *   - Phase 5 → Layer 3 (behavioral learning, DPDPA-gated)
 *   - Phase 6 → Layer 4 (AI fallback, allowlisted, cached)
 */

import { findStaticDefault } from './static-defaults';
import type {
  Layer,
  ResolveResult,
  ResolvedAction,
  ResolverContext,
  TraceEntry,
} from './types';

/* ─────────────────────────────────────────────────────────────────
 * Priority order is canonical. Do not reorder.
 * Spec §2: explicit admin rules (L2) outrank inferred preference (L3);
 *          curated defaults (L1) outrank best-effort AI (L4).
 * ─────────────────────────────────────────────────────────────── */

const PRIORITY_ORDER: readonly Layer[] = [0, 2, 3, 1, 4];

/* ─────────────────────────────────────────────────────────────────
 * Layer evaluators. Return ActionTemplate (without firedLayer/trace) on hit,
 * or null on no-match. Resolver wraps the result with bookkeeping.
 * ─────────────────────────────────────────────────────────────── */

type LayerResult =
  | { matched: true; action: Omit<ResolvedAction, 'firedLayer' | 'trace'> }
  | { matched: false; reason?: string };

async function evaluateLayer0(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 3 plugs in Supabase Realtime listener for severity=red notifications.
  return { matched: false, reason: 'Layer 0 not yet implemented (Phase 3)' };
}

async function evaluateLayer2(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 4 reads quick_action_rules + evaluates when_clause against state.
  return { matched: false, reason: 'Layer 2 not yet implemented (Phase 4)' };
}

async function evaluateLayer3(ctx: ResolverContext): Promise<LayerResult> {
  // Phase 5 reads quick_action_taps + computes confidence.
  // Until then: even if consent is on, no inference is possible.
  if (!ctx.preferences.layer3Consent) {
    return { matched: false, reason: 'Layer 3 — user has not opted in' };
  }
  return { matched: false, reason: 'Layer 3 not yet implemented (Phase 5)' };
}

async function evaluateLayer1(ctx: ResolverContext): Promise<LayerResult> {
  const def = findStaticDefault(ctx.page, ctx.role);
  if (!def) return { matched: false, reason: 'No Layer 1 default registered' };
  return { matched: true, action: def.build(ctx) };
}

async function evaluateLayer4(_ctx: ResolverContext): Promise<LayerResult> {
  // Phase 6 wires Claude Haiku 4.5 with allowlist + cache + cost guardrails.
  return { matched: false, reason: 'Layer 4 not yet implemented (Phase 6)' };
}

const LAYER_EVALUATORS: Record<Layer, (ctx: ResolverContext) => Promise<LayerResult>> = {
  0: evaluateLayer0,
  1: evaluateLayer1,
  2: evaluateLayer2,
  3: evaluateLayer3,
  4: evaluateLayer4,
};

/* ─────────────────────────────────────────────────────────────────
 * Public entry point.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Resolve the Attention Bar action for the given context.
 *
 * Walks the priority cascade. First layer to return a match wins. Disabled
 * layers (via `ctx.enabledLayers` or per-user toggles) are skipped with a
 * trace entry. Errors thrown inside a layer evaluator are caught and turn
 * into 'error' trace entries; resolution falls through.
 *
 * Returns null only if every layer including the catch-all '*'/'*' Layer 1
 * default failed — in practice should never happen at runtime since the
 * registry guarantees a global fallback.
 */
export async function resolve(ctx: ResolverContext): Promise<ResolveResult> {
  const trace: TraceEntry[] = [];
  const enabledFilter = ctx.enabledLayers.size === 0
    ? null
    : ctx.enabledLayers;

  for (const layer of PRIORITY_ORDER) {
    if (enabledFilter && !enabledFilter.has(layer)) {
      trace.push({ layer, result: 'skipped', reason: 'disabled by enabledLayers filter' });
      continue;
    }

    const evaluator = LAYER_EVALUATORS[layer];
    let result: LayerResult;
    try {
      result = await evaluator(ctx);
    } catch (err) {
      trace.push({
        layer,
        result: 'error',
        reason: err instanceof Error ? err.message : 'unknown error',
      });
      continue;
    }

    if (result.matched) {
      trace.push({ layer, result: 'matched' });
      return { ...result.action, firedLayer: layer, trace };
    } else {
      trace.push({ layer, result: 'no-match', reason: result.reason });
    }
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────
 * Test/debug helpers — exported for the verification API + future Test Sandbox.
 * ─────────────────────────────────────────────────────────────── */

/** Build a default ResolverContext for a given (userId, role, page). */
export function buildContext(input: {
  userId: string;
  role: string;
  page: string;
  state?: Record<string, unknown>;
  layer3Consent?: boolean;
  enabledLayers?: Layer[];
}): ResolverContext {
  return {
    userId: input.userId,
    role: input.role,
    page: input.page,
    state: input.state ?? {},
    preferences: {
      layer3Consent: input.layer3Consent ?? false,
      layer3OverrideTo: 'inherit',
    },
    enabledLayers: new Set(input.enabledLayers ?? []),
  };
}
