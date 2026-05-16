/**
 * GET /api/attention-bar/admin/behavior/aggregate
 *
 * Tab 4 (Layer 3 — Behavior) anonymized aggregates only.
 * NEVER exposes individual user_ids. Only counts and distributions.
 *
 * Auth: super_admin OR attention_bar.audit.view
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
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
    // Consent rate (aggregate count only)
    const { data: consentRows } = await supabase
      .from('quick_action_user_consent')
      .select('layer_3_consent');

    let consentOn = 0;
    let consentOff = 0;
    for (const row of consentRows ?? []) {
      if (row.layer_3_consent) consentOn++;
      else consentOff++;
    }

    // Global action_id distribution from taps (layer 3 only, last 30 days)
    // IMPORTANT: We select action_id aggregates — NO user_id is returned
    const { data: tapRows } = await supabase
      .from('quick_action_taps')
      .select('action_id, event_type, fired_layer')
      .eq('fired_layer', 3)
      .eq('event_type', 'tap')
      .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const actionCounts: Record<string, number> = {};
    for (const row of tapRows ?? []) {
      actionCounts[row.action_id] = (actionCounts[row.action_id] ?? 0) + 1;
    }

    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action_id, count]) => ({ action_id, count }));

    // Confidence distribution histogram: bucket taps by implied confidence
    // We compute confidence buckets from impressions/taps per action_id globally
    const { data: impressionRows } = await supabase
      .from('quick_action_taps')
      .select('action_id, event_type')
      .eq('fired_layer', 3)
      .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const actionStats: Record<string, { impressions: number; taps: number }> = {};
    for (const row of impressionRows ?? []) {
      if (!actionStats[row.action_id]) {
        actionStats[row.action_id] = { impressions: 0, taps: 0 };
      }
      if (row.event_type === 'impression') actionStats[row.action_id].impressions++;
      if (row.event_type === 'tap') actionStats[row.action_id].taps++;
    }

    // Confidence histogram buckets: 0.0–0.2, 0.2–0.4, 0.4–0.6, 0.6–0.8, 0.8–1.0
    const confidenceBuckets = [0, 0, 0, 0, 0];
    for (const stats of Object.values(actionStats)) {
      if (stats.impressions < 1) continue;
      const confidence = Math.min(1.0, (stats.taps / stats.impressions) * Math.min(1.0, stats.impressions / 30));
      const bucket = Math.min(4, Math.floor(confidence * 5));
      confidenceBuckets[bucket]++;
    }

    const confidenceHistogram = [
      { label: '0.0–0.2', count: confidenceBuckets[0] },
      { label: '0.2–0.4', count: confidenceBuckets[1] },
      { label: '0.4–0.6', count: confidenceBuckets[2] },
      { label: '0.6–0.8', count: confidenceBuckets[3] },
      { label: '0.8–1.0', count: confidenceBuckets[4] },
    ];

    return NextResponse.json({
      consent: {
        on: consentOn,
        off: consentOff,
        total: consentOn + consentOff,
        rate: consentOn + consentOff > 0 ? consentOn / (consentOn + consentOff) : 0,
      },
      topActions,
      confidenceHistogram,
      // Privacy contract: no user_ids anywhere in this response
      privacyNote: 'Aggregate data only. No individual user data is exposed.',
    });
  } catch (err) {
    console.error('[attention-bar/admin/behavior/aggregate] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
