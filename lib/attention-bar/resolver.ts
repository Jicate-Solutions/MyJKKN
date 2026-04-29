/**
 * Attention Bar resolver — priority cascade core.
 *
 * Spec §2 Architecture: priority order is 0 → 2 → 3 → 1 → 4. First match wins
 * for `primary`; runner-up (distinct href) becomes `secondary`.
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
 *
 * Runner-up (secondary) logic — added 2026-04-28:
 *   - Cascade no longer short-circuits on first match. It collects ALL matching
 *     layers in priority order into a `hits` array.
 *   - L4 (AI fallback) is SKIPPED when any earlier layer already produced a hit
 *     because (a) L4 is the most expensive call and (b) a second L4 guess is
 *     unlikely to be meaningfully different from primary. L4 only runs when
 *     L0/L2/L3/L1 all produced zero hits.
 *   - primary  = hits[0]
 *   - secondary = first hit whose href !== primary.href (dedup by destination)
 *   - secondary = null when fewer than 2 distinct destinations match.
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
 * Resolve the Attention Bar action(s) for the given context.
 *
 * Walks the full priority cascade collecting ALL matching layers, then derives:
 *   - `primary`   — first hit (highest-priority layer that matched). Null only
 *                   on a catastrophic empty cascade.
 *   - `secondary` — first hit whose href differs from primary.href (runner-up
 *                   by destination). Null when fewer than 2 distinct hrefs matched.
 *   - `resolved`  — backcompat alias for `primary`. Audit + existing callers
 *                   continue to use this name.
 *
 * Dedup rule: by href only. Two actions from different layers pointing at the
 * same destination are treated as duplicates — secondary skips them and looks
 * further down the hit list.
 *
 * L4 skip optimisation: Layer 4 (AI fallback) is expensive. It is only invoked
 * when L0/L2/L3/L1 produced zero hits combined. When primary is already resolved
 * from an earlier layer, running L4 just to find a secondary is wasteful — L4's
 * output is unlikely to differ meaningfully from primary and it has its own
 * caching cost. This preserves current latency for the 99% case.
 *
 * Returns `{ primary: null, secondary: null, resolved: null }` only if every
 * layer including the catch-all '*'/'*' Layer 1 default failed — in practice
 * should never happen at runtime since the registry guarantees a global
 * fallback. Phase 7 logs + audits this case defensively so it surfaces in the
 * admin Tab 6 audit log.
 *
 * Anonymous resolves (userId === '' or null-equivalent): Layers 0/3/4 are
 * skipped because they read user-scoped DB rows that would either error or
 * fail closed under RLS. Layer 1 still runs and provides a safe default. In
 * the anonymous case L1 may produce multiple matches (page-specific + catch-all)
 * from which primary/secondary are derived normally.
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

  // Ordered list of (layer, action) pairs for every layer that matched.
  // Priority order is preserved — hits[0] is always the highest-priority hit.
  const hits: Array<{ layer: Layer; action: Omit<ResolvedAction, 'firedLayer' | 'trace'> }> = [];

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

    // L4 optimisation: Layer 4 (AI fallback) is the most expensive call.
    // Skip it entirely when earlier layers have already produced at least one
    // hit — L4 is only needed when the cascade is otherwise empty. This keeps
    // worst-case latency identical to Phase 7 for the common path.
    if (layer === 4 && hits.length > 0) {
      trace.push({
        layer,
        result: 'skipped',
        reason: 'L4 skipped — primary already resolved from earlier layer (latency optimisation)',
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
      // Self-referential suppression: an action whose destination IS the page
      // the user is already on adds no value — clicking it just reloads the
      // current view. Skip it from the hit list so neither primary nor
      // secondary surfaces a CTA pointing back to where the user already is.
      // Comparison is strict equality on the full href string (intentional —
      // `/dashboard` and `/dashboard?view=briefing` are different states of
      // the same path and the latter IS a useful navigation; we only suppress
      // exact matches).
      if (result.action.href === ctx.page) {
        trace.push({
          layer,
          result: 'skipped',
          reason: `self-referential — action.href === ctx.page (${ctx.page})`,
        });
      } else {
        trace.push({ layer, result: 'matched' });
        hits.push({ layer, action: result.action });
      }
    } else {
      trace.push({ layer, result: 'no-match', reason: result.reason });
    }
  }

  // ── Derive primary + secondary from the ordered hit list ──────────────────

  if (hits.length === 0) {
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
    return { primary: null, secondary: null, resolved: null };
  }

  const primaryHit = hits[0];
  const primary: ResolvedAction = { ...primaryHit.action, firedLayer: primaryHit.layer, trace };

  // Runner-up: first hit whose href is distinct from primary's href.
  // We do NOT deduplicate by id/label — destination (href) is the only signal
  // that matters for the split-bar UX. Two actions pointing at the same page
  // would show the user the same place twice, which is unhelpful.
  const secondaryHit = hits.find((h, i) => i > 0 && h.action.href !== primaryHit.action.href);
  const secondary: ResolvedAction | null = secondaryHit
    ? { ...secondaryHit.action, firedLayer: secondaryHit.layer, trace }
    : null;

  // Cascade-summary trace entry for Tab 6 audit visibility.
  trace.push({
    layer: primaryHit.layer,
    result: 'matched',
    reason: `cascade-summary: primary=L${primaryHit.layer} secondary=${secondary ? `L${secondaryHit!.layer}` : 'none'} total-hits=${hits.length}`,
  });

  // Fire-and-forget audit. Never awaited on the hot path.
  // `resolved` (= primary) is passed for backcompat; secondary is visible via
  // the cascade-summary trace entry above in Tab 6.
  void recordResolveAudit({
    userId: isAnonymous ? null : ctx.userId,
    page: ctx.page,
    role: ctx.role,
    resolved: primary,
    trace,
  });

  return { primary, secondary, resolved: primary };
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
