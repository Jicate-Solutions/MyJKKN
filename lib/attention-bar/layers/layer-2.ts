/**
 * Layer 2 — State-aware Rules Engine (admin-configurable).
 *
 * Spec §3 Layer 2: reads quick_action_rules table, evaluates each rule's
 * when_clause against state-query results, returns first matching action by
 * priority DESC, created_at ASC.
 *
 * Flow:
 *  1. Bail early if `layer_2.enabled = false` (kill switch via quick_action_config).
 *  2. SELECT FROM quick_action_rules WHERE
 *       (page=ctx.page OR page='*')
 *       AND (role=ctx.role OR role='*')
 *       AND is_active=true
 *     ORDER BY priority DESC, created_at ASC.
 *  3. Aggregate the union of state_query keys mentioned in any candidate rule;
 *     fetch them once via fetchStateQueries() (parallel, ≤80ms wall-clock).
 *  4. For each rule (already in priority order):
 *       evaluateWhenClause(rule.when_clause, state, ctx) → boolean.
 *       If true: renderActionTemplate(rule.action_template, state, ruleId).
 *         If render succeeds → return matched.
 *         If render returns null (malformed template) → log + skip.
 *  5. If no rule matches → return matched=false.
 *
 * Cleanly disable-able: layer_2.enabled flag + per-resolver kill via
 * ctx.enabledLayers (handled by resolver, not here).
 *
 * Per-rule errors are caught and SKIPPED — never crash the resolver.
 */

import { renderActionTemplate } from '../action-template-renderer';
import { evaluateWhenClause, extractStateQueryKeys } from '../rule-evaluator';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchStateQueries, type StateQueryContext } from '../state-queries';
import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

interface RuleRow {
  id: string;
  rule_name: string;
  page: string;
  role: string;
  when_clause: unknown;
  action_template: unknown;
  priority: number;
  created_at: string;
  institution_id: string | null;
}

/* ─────────────────────────────────────────────────────────────────
 * Layer-2 enabled flag — cached for 60s to avoid hammering config table.
 * ─────────────────────────────────────────────────────────────── */

let _enabledCache: { value: boolean; fetchedAt: number } | null = null;
const ENABLED_TTL_MS = 60_000;

async function isLayer2Enabled(): Promise<boolean> {
  const now = Date.now();
  if (_enabledCache && now - _enabledCache.fetchedAt < ENABLED_TTL_MS) {
    return _enabledCache.value;
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('quick_action_config')
      .select('value')
      .eq('key', 'layer_2.enabled')
      .maybeSingle();
    if (error) throw error;
    // Default-enabled if the row is missing — Phase 4 ships with Layer 2 ON.
    const value = data?.value === false ? false : true;
    _enabledCache = { value, fetchedAt: now };
    return value;
  } catch (err) {
    console.warn(
      '[attention-bar/layer-2] failed to read layer_2.enabled, defaulting to true',
      err instanceof Error ? err.message : err,
    );
    return true;
  }
}

/** For tests — force re-read of the config flag on next call. */
export function _resetLayer2EnabledCache(): void {
  _enabledCache = null;
}

/* ─────────────────────────────────────────────────────────────────
 * Public evaluator
 * ─────────────────────────────────────────────────────────────── */

export async function evaluateLayer2(ctx: ResolverContext): Promise<LayerResult> {
  if (!(await isLayer2Enabled())) {
    return { matched: false, reason: 'Layer 2 disabled via quick_action_config' };
  }

  // 1. Load candidate rules — page+role match with wildcard fallback.
  let rules: RuleRow[];
  try {
    rules = await loadCandidateRules(ctx.page, ctx.role);
  } catch (err) {
    console.warn(
      '[attention-bar/layer-2] failed to load candidate rules',
      err instanceof Error ? err.message : err,
    );
    return { matched: false, reason: 'Layer 2 query failed' };
  }

  if (rules.length === 0) {
    return { matched: false, reason: 'No active Layer 2 rules for this page+role' };
  }

  // 2. Aggregate state-query keys across all candidate when_clauses.
  const allKeys = new Set<string>();
  for (const r of rules) {
    extractStateQueryKeys(r.when_clause).forEach((k) => allKeys.add(k));
  }

  // 3. Fetch all keys once in parallel.
  const sqCtx: StateQueryContext = {
    userId: ctx.userId,
    role: ctx.role,
    institutionId: typeof ctx.state.institutionId === 'string' ? ctx.state.institutionId : null,
  };

  // Merge fetched state with whatever the resolver pre-loaded.
  let fetchedState: Record<string, unknown> = {};
  if (allKeys.size > 0) {
    try {
      fetchedState = await fetchStateQueries(Array.from(allKeys), sqCtx);
    } catch (err) {
      console.warn(
        '[attention-bar/layer-2] state-queries fetch failed; continuing with empty state',
        err instanceof Error ? err.message : err,
      );
    }
  }
  const state: Record<string, unknown> = { ...ctx.state, ...fetchedState };

  // 4. Walk rules in priority order; first match wins.
  for (const rule of rules) {
    let matched = false;
    try {
      matched = evaluateWhenClause(rule.when_clause, { state });
    } catch (err) {
      console.warn(
        `[attention-bar/layer-2] when_clause evaluation threw for rule ${rule.id} (${rule.rule_name})`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    if (!matched) continue;

    const action = renderActionTemplate({
      template: rule.action_template,
      state,
      ruleId: rule.id,
    });
    if (!action) {
      // Malformed template — skip but log so admins can fix it.
      console.warn(
        `[attention-bar/layer-2] action_template render returned null for rule ${rule.id} (${rule.rule_name})`,
      );
      continue;
    }

    return {
      matched: true,
      action: { ...action, ruleId: rule.id },
    };
  }

  return { matched: false, reason: `No Layer 2 rule matched (${rules.length} candidates evaluated)` };
}

/* ─────────────────────────────────────────────────────────────────
 * Candidate rule loader
 * ─────────────────────────────────────────────────────────────── */

async function loadCandidateRules(page: string, role: string): Promise<RuleRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('quick_action_rules')
    .select('id, rule_name, page, role, when_clause, action_template, priority, created_at, institution_id')
    .eq('is_active', true)
    .or(`page.eq.${page},page.eq.*`)
    .or(`role.eq.${role},role.eq.*`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`quick_action_rules query failed: ${error.message}`);
  }
  return (data ?? []) as RuleRow[];
}
