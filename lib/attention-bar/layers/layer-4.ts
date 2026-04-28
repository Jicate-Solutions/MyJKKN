/**
 * Layer 4 — AI Fallback (allowlisted, cached, cost-bounded).
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * This is the most expensive layer. It only fires when L0/L2/L3/L1 all
 * return null — should be < 2 % of renders in steady state. The LLM is
 * asked to RANK an allowlist of pre-approved actions for the current
 * (page, role, recent_actions, time_of_day) context and pick exactly one.
 *
 * Algorithm:
 *   1. Bail early if circuit breaker has tripped.
 *   2. Build cache key (page × role × hour-bucket UTC).
 *   3. Cache hit? → record (cost=0, cache_hit=true) + return cached action.
 *   4. Build allowlist from Layer 1 + Layer 2 candidates for this (page, role).
 *   5. Budget gate — if blocked, fail closed (matched=false; resolver falls
 *      through to Layer 1).
 *   6. Call LLM with prompt cache enabled.
 *   7. Validate the returned action_id against the allowlist (defence in depth
 *      on top of the tool's enum schema).
 *   8. Compute USD cost from usage; persist to cache + audit.
 *   9. Auto-trip the circuit breaker if 5 consecutive cap days are detected.
 *
 * Failure modes (all fail OPEN — return matched=false; resolver falls through):
 *   - Anthropic API error (network, 4xx, 5xx, timeout)
 *   - Allowlist empty (no L1 default + no L2 rule for page×role)
 *   - LLM returns id not in allowlist (hallucination)
 *   - Budget cap exceeded
 *   - Circuit breaker tripped
 *
 * Privacy: we never write the prompt or response text to the audit table.
 * Only metadata (model, tokens, cost, action_id picked, cache_hit boolean).
 */

import { getCachedResponse, setCachedResponse, buildCacheKey } from '../ai-cache';
import {
  callLLM,
  type AllowlistEntry,
  type PickActionInput,
} from '../anthropic-client';
import {
  autoTripIfNeeded,
  isLayer4Enabled,
} from '../circuit-breaker';
import {
  computeCostUsd,
  PROJECTED_COST_USD,
  LAYER_4_MODEL,
} from '../cost-rates';
import {
  checkBudgetAvailable,
  recordLayer4Call,
} from '../cost-tracker';
import { toAllowlistEntry } from '../llm-prompt';
import { findStaticDefault } from '../static-defaults';
import type { ActionTemplate, ResolverContext, ResolvedAction } from '../types';
import type { LayerResult } from './layer-result';

// ─────────────────────────────────────────────────────────────────────────────
// Cached response shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What we persist into `quick_action_ai_cache.response`.
 *
 * Storing the full action template AS RENDERED means a cache hit doesn't
 * have to re-resolve the allowlist or re-validate — the cached row is
 * already a known-good action.
 */
interface CachedResponse {
  /** Full action template, ready to render. */
  action: ActionTemplate;
  /** Which allowlist entry the LLM originally picked (for traceability). */
  source_action_id: string;
  /** Free-text reason from the LLM (audit only). */
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the LLM allowlist for a given (page, role).
 *
 * v1 sources:
 *   - Layer 1 static defaults: the curated default for (page, role), plus
 *     the page-level wildcard default if it differs.
 *   - Layer 2 rules (Phase 4): NOT YET in this PR. The Phase 4 agent owns
 *     `quick_action_rules` and will plug rule action_templates into the
 *     allowlist by extending this function.
 *
 * v1 returns up to 3 entries. The Phase 4 agent should keep this bounded
 * (≤ 8) to keep prompt cost predictable.
 */
function buildAllowlist(ctx: ResolverContext): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];

  // Most specific Layer 1 default for (page, role).
  const exact = findStaticDefault(ctx.page, ctx.role);
  if (exact) {
    entries.push(
      toAllowlistEntry(
        exact.build(ctx),
        `Layer 1 static default for ${exact.role} on ${exact.page}`,
      ),
    );
  }

  // Page-level wildcard (role='*') — useful when the role-specific default
  // doesn't fit but the page has a generic action everyone can take.
  const pageWildcard = findStaticDefault(ctx.page, '*');
  if (
    pageWildcard &&
    !entries.some((e) => e.id === pageWildcard.build(ctx).id)
  ) {
    entries.push(
      toAllowlistEntry(
        pageWildcard.build(ctx),
        `Layer 1 page-level wildcard for ${pageWildcard.page}`,
      ),
    );
  }

  // Global catch-all — always present so the LLM has a "go home" option.
  const catchAll = findStaticDefault('*', '*');
  if (catchAll && !entries.some((e) => e.id === catchAll.build(ctx).id)) {
    entries.push(
      toAllowlistEntry(
        catchAll.build(ctx),
        'Layer 1 global catch-all',
      ),
    );
  }

  return entries;
}

/**
 * Resolve a chosen allowlist id back to the full ActionTemplate.
 *
 * Re-derives from the same Layer 1 lookup used to build the allowlist.
 * Future Phase 4 will need to extend this to handle Layer 2 rule ids too.
 */
function resolveTemplateFromAllowlist(
  ctx: ResolverContext,
  allowlist: AllowlistEntry[],
  picked_id: string,
): ActionTemplate | null {
  // Verify the id is in the allowlist first — this is the hallucination check.
  if (!allowlist.some((e) => e.id === picked_id)) return null;

  // Re-build the L1 actions and find the match by id.
  const candidates: (ActionTemplate | null)[] = [
    findStaticDefault(ctx.page, ctx.role)?.build(ctx) ?? null,
    findStaticDefault(ctx.page, '*')?.build(ctx) ?? null,
    findStaticDefault('*', '*')?.build(ctx) ?? null,
  ];

  for (const c of candidates) {
    if (c && c.id === picked_id) return c;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent actions extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull a `recent_actions` list from `ctx.state` if Phase 4/5 populated it.
 *
 * Phase 1 always passes {} so we get []. That's fine — the LLM handles an
 * empty list gracefully.
 */
function extractRecentActions(ctx: ResolverContext): string[] {
  const raw = ctx.state.recent_actions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main evaluator
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateLayer4(ctx: ResolverContext): Promise<LayerResult> {
  // ── Step 1: kill switch ────────────────────────────────────────────────
  let enabled: boolean;
  try {
    enabled = await isLayer4Enabled();
  } catch (err) {
    return {
      matched: false,
      reason: `layer 4 disabled (config read failed: ${
        err instanceof Error ? err.message : 'unknown'
      })`,
    };
  }
  if (!enabled) return { matched: false, reason: 'layer 4 disabled' };

  // ── Step 2: cache key ─────────────────────────────────────────────────
  const cacheKey = buildCacheKey({ page: ctx.page, role: ctx.role });

  // ── Step 3: cache hit? ────────────────────────────────────────────────
  let cacheHitEntry: Awaited<ReturnType<typeof getCachedResponse>> = null;
  try {
    cacheHitEntry = await getCachedResponse(cacheKey);
  } catch (err) {
    // Cache read failure is non-fatal — proceed to rebuild from LLM.
    console.warn(
      '[attention-bar/layer-4] cache read failed, falling through to LLM:',
      err instanceof Error ? err.message : err,
    );
  }

  if (cacheHitEntry) {
    const cached = cacheHitEntry.response as CachedResponse | null;
    if (cached?.action) {
      // Audit the hit (cost=0).
      try {
        await recordLayer4Call({
          userId: ctx.userId,
          page: ctx.page,
          role: ctx.role,
          costUsd: 0,
          cacheHit: true,
          actionId: cached.action.id,
        });
      } catch (err) {
        // Audit failure must not block the user-facing render.
        console.warn(
          '[attention-bar/layer-4] cache-hit audit failed (non-fatal):',
          err instanceof Error ? err.message : err,
        );
      }

      return {
        matched: true,
        action: stripResolverFields(cached.action),
      };
    }
  }

  // ── Step 4: build allowlist ───────────────────────────────────────────
  const allowlist = buildAllowlist(ctx);
  if (allowlist.length === 0) {
    // No Layer 1 default registered — Layer 4 cannot pick a safe action.
    return { matched: false, reason: 'allowlist empty (no L1/L2 candidates)' };
  }

  // ── Step 5: budget gate ───────────────────────────────────────────────
  let budget;
  try {
    budget = await checkBudgetAvailable({
      userId: ctx.userId,
      projectedCostUsd: PROJECTED_COST_USD,
    });
  } catch (err) {
    // Fail closed on budget-read errors — better to skip Layer 4 than to
    // accidentally bypass the cap.
    return {
      matched: false,
      reason: `budget gate read failed: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    };
  }
  if (!budget.allowed) {
    return { matched: false, reason: budget.reason ?? 'budget exceeded' };
  }

  // ── Step 6: LLM call ──────────────────────────────────────────────────
  const promptInput: PickActionInput = {
    page: ctx.page,
    role: ctx.role,
    recentActions: extractRecentActions(ctx),
    timeOfDay: new Date().toISOString(),
    allowlist,
  };

  let llmResult;
  try {
    llmResult = await callLLM(promptInput);
  } catch (err) {
    // Audit the failed call so the cost dashboard still sees the attempt.
    try {
      await recordLayer4Call({
        userId: ctx.userId,
        page: ctx.page,
        role: ctx.role,
        costUsd: 0,
        cacheHit: false,
      });
    } catch {
      // Best effort; ignore.
    }
    return {
      matched: false,
      reason: `LLM call failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }

  // ── Step 7: validate against allowlist ────────────────────────────────
  const template = resolveTemplateFromAllowlist(ctx, allowlist, llmResult.action_id);
  if (!template) {
    console.warn(
      `[attention-bar/layer-4] LLM returned id not in allowlist: ${llmResult.action_id}. ` +
        `Allowlist ids: ${allowlist.map((e) => e.id).join(', ')}`,
    );
    // Still record the call (we paid for it).
    try {
      await recordLayer4Call({
        userId: ctx.userId,
        page: ctx.page,
        role: ctx.role,
        costUsd: computeCostUsd(llmResult.usage),
        cacheHit: false,
      });
    } catch {
      // Best effort.
    }
    return { matched: false, reason: 'LLM returned id not in allowlist (hallucinated)' };
  }

  // ── Step 8: persist to cache + audit ──────────────────────────────────
  const costUsd = computeCostUsd(llmResult.usage);
  const cachedPayload: CachedResponse = {
    action: template,
    source_action_id: llmResult.action_id,
    reason: llmResult.reason,
  };

  try {
    await setCachedResponse({
      cacheKey,
      response: cachedPayload,
      model: llmResult.model || LAYER_4_MODEL,
      costUsd,
      ttlMinutes: 60,
    });
  } catch (err) {
    // Cache write failure is non-fatal — we still return the action this time.
    console.warn(
      '[attention-bar/layer-4] cache write failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    await recordLayer4Call({
      userId: ctx.userId,
      page: ctx.page,
      role: ctx.role,
      costUsd,
      cacheHit: false,
      actionId: template.id,
    });
  } catch (err) {
    console.warn(
      '[attention-bar/layer-4] audit write failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  // ── Step 9: auto-trip if 5 consecutive cap days ───────────────────────
  // Best-effort, fire-and-forget — this is a once-a-call check; the daily
  // cron in Phase 7 will be the canonical trigger.
  void autoTripIfNeeded().catch((err) => {
    console.warn(
      '[attention-bar/layer-4] autoTripIfNeeded failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  });

  return {
    matched: true,
    action: stripResolverFields(template),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip resolver-managed fields from an ActionTemplate.
 *
 * The resolver wraps our return value with `firedLayer` and `trace`. Layer
 * evaluators must NOT pre-fill those (would be overwritten). This is a
 * type-narrowing helper — at runtime it just clones the template.
 */
function stripResolverFields(t: ActionTemplate): Omit<ResolvedAction, 'firedLayer' | 'trace'> {
  return {
    id: t.id,
    label: t.label,
    context: t.context,
    tone: t.tone,
    cta: t.cta,
    icon: t.icon,
    href: t.href,
  };
}
