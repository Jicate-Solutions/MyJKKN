/**
 * GET /api/attention-bar/admin/metrics?range=24h|7d|30d
 *
 * Powers Tab 1 (Overview) and Tab 5 (Layer 4 AI).
 * Returns renders-by-layer, top-firing rules, AI cost, consent stats.
 *
 * Auth: super_admin OR attention_bar.audit.view permission.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Convert a range string to an ISO-8601 cutoff timestamp computed in JS.
 *
 * Why ISO and not a SQL `now() - interval '...'` string: Supabase JS
 * `.gte(column, value)` URL-encodes the value as a PostgREST filter literal.
 * PostgREST does not evaluate `now() - interval '24 hours'` server-side — it
 * tries to parse the string as a timestamptz literal and returns 400. The
 * route was emitting that 400 silently and the catch-all turned it into a
 * generic 500 → "Failed to load metrics" in the Tab 1 Overview UI.
 * Caught 2026-05-03; the bug had been latent since the metrics route shipped.
 */
function rangeToCutoffISO(range: string): string {
  const hours = range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : 24;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export async function GET(request: Request) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') ?? '24h';
  const cutoffISO = rangeToCutoffISO(range);

  // Permission check: super_admin or attention_bar.audit.view
  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.audit.view',
    });
    if (!hasPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    // Renders by layer
    const { data: rendersByLayer, error: rblError } = await supabase
      .from('quick_action_audit')
      .select('fired_layer')
      .gte('rendered_at', cutoffISO);

    if (rblError) throw rblError;

    const layerCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalRenders = 0;
    for (const row of rendersByLayer ?? []) {
      const l = row.fired_layer as number;
      layerCounts[l] = (layerCounts[l] ?? 0) + 1;
      totalRenders++;
    }

    // Top-firing rules (Layer 2 only)
    const { data: topRulesRaw, error: trError } = await supabase
      .from('quick_action_audit')
      .select('rule_id')
      .eq('fired_layer', 2)
      .gte('rendered_at', cutoffISO)
      .not('rule_id', 'is', null);

    if (trError) throw trError;

    const ruleCounts: Record<string, number> = {};
    for (const row of topRulesRaw ?? []) {
      if (row.rule_id) {
        ruleCounts[row.rule_id] = (ruleCounts[row.rule_id] ?? 0) + 1;
      }
    }

    const topRuleIds = Object.entries(ruleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ rule_id: id, count }));

    // Fetch rule names for the top rule IDs
    let topRules: { rule_id: string; rule_name: string; count: number }[] = [];
    if (topRuleIds.length > 0) {
      const { data: ruleNames } = await supabase
        .from('quick_action_rules')
        .select('id, rule_name')
        .in('id', topRuleIds.map(r => r.rule_id));

      const nameMap = new Map((ruleNames ?? []).map(r => [r.id, r.rule_name]));
      topRules = topRuleIds.map(r => ({
        rule_id: r.rule_id,
        rule_name: nameMap.get(r.rule_id) ?? 'Unknown Rule',
        count: r.count,
      }));
    }

    // AI cost metrics
    const { data: aiCacheRows } = await supabase
      .from('quick_action_ai_cache')
      .select('cost_usd, cached_at')
      .gte('cached_at', cutoffISO);

    let aiCostTotal = 0;
    let aiCacheHits = 0;
    let aiCacheMisses = 0;

    for (const row of aiCacheRows ?? []) {
      aiCostTotal += Number(row.cost_usd ?? 0);
    }

    // Cache hit rate: Layer 4 renders vs AI cache entries created
    const layer4Renders = layerCounts[4] ?? 0;
    const cacheEntries = (aiCacheRows ?? []).length;
    if (layer4Renders > 0) {
      aiCacheMisses = cacheEntries;
      aiCacheHits = Math.max(0, layer4Renders - cacheEntries);
    }

    // Consent stats (current snapshot, not time-ranged)
    const { data: consentRows } = await supabase
      .from('quick_action_user_consent')
      .select('layer_3_consent');

    let consentOn = 0;
    let consentOff = 0;
    for (const row of consentRows ?? []) {
      if (row.layer_3_consent) consentOn++;
      else consentOff++;
    }

    // Config: Layer 4 daily budget
    const { data: budgetConfig } = await supabase
      .from('quick_action_config')
      .select('value')
      .eq('key', 'layer_4.daily_budget_usd')
      .maybeSingle();

    const dailyBudgetUsd = budgetConfig?.value ?? 5;

    return NextResponse.json({
      range,
      totalRenders,
      rendersByLayer: layerCounts,
      topRules,
      ai: {
        costTotal: aiCostTotal,
        dailyBudgetUsd,
        cacheHits: aiCacheHits,
        cacheMisses: aiCacheMisses,
        hitRate: layer4Renders > 0 ? aiCacheHits / layer4Renders : 0,
      },
      consent: {
        on: consentOn,
        off: consentOff,
        total: consentOn + consentOff,
        rate: consentOn + consentOff > 0 ? consentOn / (consentOn + consentOff) : 0,
      },
    });
  } catch (err) {
    console.error('[attention-bar/admin/metrics] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
