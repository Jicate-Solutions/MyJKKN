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
 *
 * Phase 7 hardening (this file):
 *   - Anonymous-user early return — Layers 0/3/4 require auth; if userId is
 *     missing we skip them and only run Layer 1 (the safe-set static defaults).
 *   - Defensive log + audit row when EVERY layer including the L1 catch-all
 *     returned null. Spec guarantees this can't happen at runtime, so when it
 *     does happen, the admin Tab 6 audit log is the place to see it.
 *   - Fire-and-forget audit row on every resolve() call. The resolver path
 *     never awaits the write.
 */

import { recordResolveAudit } from './audit-log';
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
  ResolvedAction,
  TraceEntry,
} from './types';

/* ─────────────────────────────────────────────────────────────────
 * Priority order is canonical. Do not reorder.
 * Spec §2: explicit admin rules (L2) outrank inferred preference (L3);
 *          curated defaults (L1) outrank best-effort AI (L4).
 * ─────────────────────────────────────────────────────────────── */

const PRIORITY_ORDER: readonly Layer[] = [0, 2, 3, 1, 4];

/**
 * Layers that read user-scoped DB rows and therefore require auth.uid().
 * If the resolver runs without a userId (anonymous probe, test sandbox, etc.)
 * these layers are skipped — they would either error or fail closed anyway.
 */
const AUTH_REQUIRED_LAYERS: ReadonlySet<Layer> = new Set<Layer>([0, 3, 4]);

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
 * registry guarantees a global fallback. Phase 7 logs + audits this case
 * defensively so it surfaces in the admin Tab 6 audit log.
 *
 * Anonymous resolves (userId === '' or null-equivalent): Layers 0/3/4 are
 * skipped because they read user-scoped DB rows that would either error or
 * fail closed under RLS. Layer 1 still runs and provides a safe default.
 */
export async function resolve(ctx: ResolverContext): Promise<ResolveResult> {
  const trace: TraceEntry[] = [];
  const enabledFilter = ctx.enabledLayers.size === 0
    ? null
    : ctx.enabledLayers;

  // Anonymous-user gate. The string check covers both empty-string and
  // missing-userId cases — buildContext() always populates a string but
  // route handlers can pass through unauthenticated callers as ''.
  const isAnonymous = !ctx.userId || ctx.userId.trim().length === 0;

  for (const layer of PRIORITY_ORDER) {
    if (enabledFilter && !enabledFilter.has(layer)) {
      trace.push({ layer, result: 'skipped', reason: 'disabled by enabledLayers filter' });
      continue;
    }

    if (isAnonymous && AUTH_REQUIRED_LAYERS.has(layer)) {
      trace.push({
        layer,
        result: 'skipped',
        reason: 'unauthenticated — auth-required layer skipped',
      });
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
      const resolved: ResolvedAction = { ...result.action, firedLayer: layer, trace };
      // Fire-and-forget audit. Never awaited on the hot path.
      void recordResolveAudit({
        userId: isAnonymous ? null : ctx.userId,
        page: ctx.page,
        role: ctx.role,
        resolved,
        trace,
      });
      return resolved;
    } else {
      trace.push({ layer, result: 'no-match', reason: result.reason });
    }
  }

  // Catastrophic empty cascade — Layer 1 catch-all should have caught
  // everything. Log defensively and audit so the admin Tab 6 dashboard
  // surfaces it.
  console.warn(
    '[attention-bar/resolver] empty cascade — every layer returned null. ' +
      `userId=${isAnonymous ? '<anon>' : ctx.userId} page=${ctx.page} role=${ctx.role}. ` +
      'Verify Layer 1 catch-all (page="*", role="*") is registered in static-defaults.ts.',
  );
  void recordResolveAudit({
    userId: isAnonymous ? null : ctx.userId,
    page: ctx.page,
    role: ctx.role,
    resolved: null,
    trace,
  });
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
