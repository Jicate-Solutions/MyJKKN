/**
 * Attention Bar resolver — priority cascade core.
 *
 * Spec §2 Architecture: priority order is 0 → 2 → 3 → 1 → 4. First match wins.
 *
 * Layer evaluators live in lib/attention-bar/layers/ — one file per layer so
 * each can be independently replaced as phases land:
 *   - Phase 3 → layers/layer-0.ts (Supabase Realtime urgent notifications)
 *   - Phase 4-main → layers/layer-2.ts (rules engine + state queries)
 *   - Phase 5 → layers/layer-3.ts (behavioral learning, DPDPA-gated)
 *   - Phase 6-main → layers/layer-4.ts (AI fallback, allowlisted, cached)
 *
 * This file is the orchestrator only. Per-layer logic does NOT belong here.
 */

import { evaluateLayer0 } from './layers/layer-0';
import { evaluateLayer1 } from './layers/layer-1';
import { evaluateLayer2 } from './layers/layer-2';
import { evaluateLayer3 } from './layers/layer-3';
import { evaluateLayer4 } from './layers/layer-4';
import type { LayerResult } from './layers/layer-result';
import type {
  Layer,
  ResolveResult,
  ResolverContext,
  TraceEntry,
} from './types';

/* ─────────────────────────────────────────────────────────────────
 * Priority order is canonical. Do not reorder.
 * Spec §2: explicit admin rules (L2) outrank inferred preference (L3);
 *          curated defaults (L1) outrank best-effort AI (L4).
 * ─────────────────────────────────────────────────────────────── */

const PRIORITY_ORDER: readonly Layer[] = [0, 2, 3, 1, 4];

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
