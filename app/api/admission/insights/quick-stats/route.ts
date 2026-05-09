export const dynamic = 'force-dynamic';

// app/api/admission/insights/quick-stats/route.ts
// Fast SQL-backed CRM stats for the AI Insights page.
//
// Returns instantly-actionable insights derived from `admission_leads` for the
// caller's institution. Used as an always-on layer alongside the slower
// Claude-generated insights, so the Insights page is never blank — even if the
// Claude API is down, rate-limited, or the institution has no Claude-generated
// insights cached.
//
// All counts are computed in a single CTE-shaped query for one DB roundtrip.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface QuickStat {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  metric_value: number;
  metric_label: string;
  action_label: string;
  action_url: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse institution ─────────────────────────────────────────────────────
  const institutionId = request.nextUrl.searchParams.get('institutionId');
  if (!institutionId) {
    return NextResponse.json({ error: 'institutionId is required' }, { status: 400 });
  }

  // ── Verify access ─────────────────────────────────────────────────────────
  const { data: hasAccess, error: accessError } = await supabase.rpc(
    'role_has_institution_access',
    { check_institution_id: institutionId }
  );
  if (accessError || !hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Compute stats (service-role bypasses RLS for clean count) ─────────────
  const serviceClient = createServiceRoleClient();
  const { data: leads, error: leadsError } = await serviceClient
    .from('admission_leads')
    .select('id, funnel_stage, is_hot_lead, last_contact_at, created_at, updated_at, counselor_id, source')
    .eq('institution_id', institutionId);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const all = leads || [];
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const terminal = ['lost', 'enrolled', 'declined', 'withdrew', 'expired', 'dormant'];
  const earlyStages = ['new', 'contacted', 'qualified'];
  const lateStages = ['offer_sent', 'offer_accepted', 'token_paid'];

  const active = all.filter(l => !terminal.includes(l.funnel_stage));

  const hotNoContact = active.filter(l => {
    if (!l.is_hot_lead) return false;
    const last = l.last_contact_at ? new Date(l.last_contact_at).getTime() : new Date(l.created_at).getTime();
    return now - last > threeDaysMs;
  }).length;

  const staleEarly = active.filter(l => {
    if (!earlyStages.includes(l.funnel_stage)) return false;
    return now - new Date(l.updated_at).getTime() > sevenDaysMs;
  }).length;

  const nearConversion = all.filter(l => lateStages.includes(l.funnel_stage)).length;
  const unassignedActive = active.filter(l => !l.counselor_id).length;
  const enrolled = all.filter(l => l.funnel_stage === 'enrolled').length;

  const newThisWeek = all.filter(l => now - new Date(l.created_at).getTime() <= sevenDaysMs).length;
  const newPriorWeek = all.filter(l => {
    const t = new Date(l.created_at).getTime();
    return now - t > sevenDaysMs && now - t <= fourteenDaysMs;
  }).length;
  const wowChange = newPriorWeek === 0 ? (newThisWeek > 0 ? 100 : 0) : Math.round(((newThisWeek - newPriorWeek) / newPriorWeek) * 100);

  // Top source (best-performing by enrolled count)
  const sourceTotals: Record<string, { total: number; enrolled: number }> = {};
  all.forEach(l => {
    const s = l.source || 'unknown';
    if (!sourceTotals[s]) sourceTotals[s] = { total: 0, enrolled: 0 };
    sourceTotals[s].total++;
    if (l.funnel_stage === 'enrolled') sourceTotals[s].enrolled++;
  });
  const sortedSources = Object.entries(sourceTotals)
    .filter(([, v]) => v.total >= 5)
    .map(([name, v]) => ({ name, total: v.total, enrolled: v.enrolled, rate: v.total > 0 ? v.enrolled / v.total : 0 }))
    .sort((a, b) => b.rate - a.rate);

  // ── Build stat cards ──────────────────────────────────────────────────────
  const stats: QuickStat[] = [];

  if (hotNoContact > 0) {
    stats.push({
      id: 'hot-no-contact',
      title: `${hotNoContact} hot lead${hotNoContact === 1 ? '' : 's'} need follow-up`,
      description: 'Hot leads with no contact in over 3 days. Each day of silence reduces conversion likelihood. Reach out today.',
      severity: 'critical',
      metric_value: hotNoContact,
      metric_label: 'Hot leads waiting',
      action_label: 'View hot leads',
      action_url: '/admission/leads?is_hot_lead=true&sort_by=last_contact_at&sort_order=asc',
    });
  }

  if (unassignedActive > 0) {
    stats.push({
      id: 'unassigned-active',
      title: `${unassignedActive} active lead${unassignedActive === 1 ? '' : 's'} unassigned`,
      description: 'Active leads without a counselor. Assign now to start the conversation before they go cold.',
      severity: unassignedActive > 20 ? 'critical' : 'high',
      metric_value: unassignedActive,
      metric_label: 'Unassigned active leads',
      action_label: 'Assign counselors',
      action_url: '/admission/leads?counselor_id=null',
    });
  }

  if (staleEarly > 0) {
    stats.push({
      id: 'stale-early-stage',
      title: `${staleEarly.toLocaleString()} leads stuck in early stages`,
      description: 'Leads in new/contacted/qualified with no activity in 7+ days. Consider re-engagement campaigns or reassignment.',
      severity: staleEarly > 100 ? 'high' : 'medium',
      metric_value: staleEarly,
      metric_label: 'Stale early-stage leads',
      action_label: 'Review stale leads',
      action_url: '/admission/leads?funnel_stage=new,contacted,qualified&sort_by=updated_at&sort_order=asc',
    });
  }

  if (nearConversion > 0) {
    stats.push({
      id: 'near-conversion',
      title: `${nearConversion} lead${nearConversion === 1 ? '' : 's'} near conversion`,
      description: 'Leads in offer/token-paid stages. Push hard — these are your highest-yield conversations this week.',
      severity: 'high',
      metric_value: nearConversion,
      metric_label: 'Near-conversion leads',
      action_label: 'View near-conversion',
      action_url: '/admission/leads?funnel_stage=offer_sent,offer_accepted,token_paid',
    });
  }

  if (newThisWeek > 0 || newPriorWeek > 0) {
    const direction = wowChange > 0 ? 'up' : wowChange < 0 ? 'down' : 'flat';
    const sign = wowChange > 0 ? '+' : '';
    stats.push({
      id: 'wow-trend',
      title: `${newThisWeek} new lead${newThisWeek === 1 ? '' : 's'} this week (${sign}${wowChange}% WoW)`,
      description:
        direction === 'up'
          ? 'Lead volume is growing week-over-week. Check which sources are driving the lift and double down.'
          : direction === 'down'
          ? 'Lead volume dropped week-over-week. Investigate which channels softened and consider re-activating campaigns.'
          : 'Lead volume holding steady week-over-week.',
      severity: direction === 'down' ? 'medium' : 'info',
      metric_value: newThisWeek,
      metric_label: 'New leads (last 7 days)',
      action_label: 'View by source',
      action_url: '/admission/leads?date_from=' + new Date(now - sevenDaysMs).toISOString().slice(0, 10),
    });
  }

  if (sortedSources.length > 0) {
    const top = sortedSources[0];
    if (top.rate > 0) {
      stats.push({
        id: 'top-source',
        title: `${top.name} converts at ${(top.rate * 100).toFixed(1)}%`,
        description: `Your highest-converting source so far (${top.enrolled}/${top.total} enrolled). Worth doubling spend or replicating the playbook.`,
        severity: 'info',
        metric_value: Number((top.rate * 100).toFixed(1)),
        metric_label: 'Top source conversion %',
        action_label: 'See source breakdown',
        action_url: `/admission/leads?source=${encodeURIComponent(top.name)}`,
      });
    }
  }

  // Always-on summary card so the page is never empty even for fresh institutions
  if (stats.length === 0) {
    stats.push({
      id: 'pipeline-summary',
      title: `${active.length} active leads in pipeline`,
      description:
        active.length === 0
          ? 'No active leads yet for this institution. Once leads start arriving, actionable insights will appear here.'
          : 'Pipeline is healthy — no urgent issues detected. AI Insights will surface deeper patterns shortly.',
      severity: 'info',
      metric_value: active.length,
      metric_label: 'Active leads',
      action_label: 'Open leads',
      action_url: '/admission/leads',
    });
  }

  return NextResponse.json({
    stats,
    summary: {
      total: all.length,
      active: active.length,
      enrolled,
      hot_no_contact: hotNoContact,
      stale_early: staleEarly,
      near_conversion: nearConversion,
      unassigned_active: unassignedActive,
      new_this_week: newThisWeek,
      new_prior_week: newPriorWeek,
      wow_change_pct: wowChange,
    },
    generated_at: new Date().toISOString(),
  });
}
