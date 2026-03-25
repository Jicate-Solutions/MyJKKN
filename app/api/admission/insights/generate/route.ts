// app/api/admission/insights/generate/route.ts
// Generates AI-powered CRM insights using Claude claude-sonnet-4-5.
// Uses server-side service role client to bypass RLS for read/write.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import type { AdmissionLead, FunnelStage } from '@/types/admission';

// ── Anthropic client (initialised once at module level) ───────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type InsightType =
  | 'follow_up_reminder'
  | 'conversion_opportunity'
  | 'engagement_alert'
  | 'trend_insight'
  | 'anomaly_detection'
  | 'recommendation'
  | 'performance_insight';

type InsightPriority = 'critical' | 'high' | 'medium' | 'low';

type InsightAction =
  | 'contact_lead'
  | 'schedule_followup'
  | 'send_campaign'
  | 'assign_counselor'
  | 'review_leads'
  | 'update_strategy'
  | 'view_report'
  | 'no_action';

interface ClaudeInsight {
  type: InsightType;
  priority: InsightPriority;
  title: string;
  description: string;
  action_type: InsightAction;
  action_url?: string;
  metric_value?: number;
  metric_change?: number;
  metric_label?: string;
  related_lead_ids?: string[];
  expires_hours?: number;
  metadata?: Record<string, unknown>;
}

// ── Statistics builder ────────────────────────────────────────────────────────

function buildLeadStats(leads: AdmissionLead[]) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const terminalStages: FunnelStage[] = ['lost', 'enrolled', 'declined', 'withdrew', 'expired', 'dormant'];
  const lateStages: FunnelStage[] = ['offer_sent', 'offer_accepted', 'token_paid'];

  const activeLeads = leads.filter(l => !terminalStages.includes(l.funnel_stage));
  const enrolled = leads.filter(l => l.funnel_stage === 'enrolled').length;

  // Funnel distribution
  const funnelDist: Record<string, number> = {};
  leads.forEach(l => { funnelDist[l.funnel_stage] = (funnelDist[l.funnel_stage] || 0) + 1; });

  // Source performance
  const sourceStats: Record<string, { total: number; enrolled: number }> = {};
  leads.forEach(l => {
    const src = l.source || 'unknown';
    if (!sourceStats[src]) sourceStats[src] = { total: 0, enrolled: 0 };
    sourceStats[src].total++;
    if (l.funnel_stage === 'enrolled') sourceStats[src].enrolled++;
  });

  const hotLeadsNoContact = leads.filter(l => {
    if (!l.is_hot_lead || terminalStages.includes(l.funnel_stage)) return false;
    const last = l.last_contact_at ? new Date(l.last_contact_at) : new Date(l.created_at);
    return last < threeDaysAgo;
  });

  const staleLeads = activeLeads.filter(l => new Date(l.updated_at) < sevenDaysAgo);

  const nearConversion = leads.filter(l => lateStages.includes(l.funnel_stage));

  const unassigned = activeLeads.filter(l => !l.counselor_id);

  const overdueFollowups = activeLeads.filter(l => {
    const last = l.last_contact_at ? new Date(l.last_contact_at) : null;
    return !last || last < sevenDaysAgo;
  });

  const thisWeekLeads = leads.filter(l => new Date(l.created_at) >= sevenDaysAgo);
  const lastWeekLeads = leads.filter(l => {
    const d = new Date(l.created_at);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });

  const conversionRate = leads.length > 0 ? ((enrolled / leads.length) * 100).toFixed(1) : '0.0';

  return {
    total: leads.length,
    active: activeLeads.length,
    enrolled,
    conversionRate,
    funnelDist,
    sourceStats,
    hotLeadsNoContact: { count: hotLeadsNoContact.length, ids: hotLeadsNoContact.slice(0, 20).map(l => l.id) },
    staleLeads: { count: staleLeads.length, ids: staleLeads.slice(0, 20).map(l => l.id) },
    nearConversion: {
      count: nearConversion.length,
      ids: nearConversion.map(l => l.id),
      byStage: {
        offer_sent: nearConversion.filter(l => l.funnel_stage === 'offer_sent').length,
        offer_accepted: nearConversion.filter(l => l.funnel_stage === 'offer_accepted').length,
        token_paid: nearConversion.filter(l => l.funnel_stage === 'token_paid').length,
      },
    },
    unassigned: { count: unassigned.length, ids: unassigned.slice(0, 20).map(l => l.id) },
    overdueFollowups: { count: overdueFollowups.length, ids: overdueFollowups.slice(0, 20).map(l => l.id) },
    weeklyTrend: {
      thisWeek: thisWeekLeads.length,
      lastWeek: lastWeekLeads.length,
      changePercent: lastWeekLeads.length > 0
        ? (((thisWeekLeads.length - lastWeekLeads.length) / lastWeekLeads.length) * 100).toFixed(1)
        : thisWeekLeads.length > 0 ? '100.0' : '0.0',
    },
  };
}

// ── Claude prompt ─────────────────────────────────────────────────────────────

function buildPrompt(stats: ReturnType<typeof buildLeadStats>): string {
  return `You are an expert admissions CRM strategist. Analyze this lead pipeline data and generate 5-8 high-impact, actionable insights.

## Lead Pipeline Data
- Total Leads: ${stats.total} | Active: ${stats.active} | Enrolled: ${stats.enrolled}
- Conversion Rate: ${stats.conversionRate}%

## Critical Signals
- Hot leads with no contact in 3+ days: ${stats.hotLeadsNoContact.count}
- Stale active leads (no update in 7+ days): ${stats.staleLeads.count}
- Leads near conversion (offer stage): ${stats.nearConversion.count} (offer_sent: ${stats.nearConversion.byStage.offer_sent}, offer_accepted: ${stats.nearConversion.byStage.offer_accepted}, token_paid: ${stats.nearConversion.byStage.token_paid})
- Unassigned active leads: ${stats.unassigned.count}
- Overdue follow-ups (7+ days no contact): ${stats.overdueFollowups.count}

## Weekly Trend
- This week: ${stats.weeklyTrend.thisWeek} leads | Last week: ${stats.weeklyTrend.lastWeek} | Change: ${stats.weeklyTrend.changePercent}%

## Funnel Stage Distribution
${Object.entries(stats.funnelDist).map(([s, c]) => `- ${s}: ${c}`).join('\n')}

## Lead Source Performance (sources with 3+ leads)
${Object.entries(stats.sourceStats)
  .filter(([, s]) => s.total >= 3)
  .map(([src, s]) => `- ${src}: ${s.total} total, ${s.enrolled} enrolled (${s.total > 0 ? ((s.enrolled / s.total) * 100).toFixed(1) : 0}% conv.)`)
  .join('\n') || '- No source data available'}

## Lead ID Reference
- Hot leads needing contact: ${JSON.stringify(stats.hotLeadsNoContact.ids)}
- Stale leads: ${JSON.stringify(stats.staleLeads.ids)}
- Near conversion: ${JSON.stringify(stats.nearConversion.ids)}
- Unassigned: ${JSON.stringify(stats.unassigned.ids)}
- Overdue follow-ups: ${JSON.stringify(stats.overdueFollowups.ids)}

Return a JSON object (no markdown, no text outside the JSON):

{
  "insights": [
    {
      "type": "follow_up_reminder|conversion_opportunity|engagement_alert|trend_insight|anomaly_detection|recommendation|performance_insight",
      "priority": "critical|high|medium|low",
      "title": "Short specific title (max 60 chars)",
      "description": "Actionable description with numbers (max 200 chars)",
      "action_type": "contact_lead|schedule_followup|send_campaign|assign_counselor|review_leads|update_strategy|view_report|no_action",
      "action_url": "/admission/leads?...",
      "metric_value": 42,
      "metric_change": -15.5,
      "metric_label": "Metric name",
      "related_lead_ids": ["uuid1", "uuid2"],
      "expires_hours": 24,
      "metadata": {}
    }
  ]
}

Rules:
- Only include related_lead_ids from the Lead ID Reference section
- expires_hours: 24 for critical/time-sensitive, 72 for general insights, omit for evergreen
- Skip an insight type if its count is 0 (e.g. skip hotLeads insight if hotLeadsNoContact.count is 0)
- Generate 5-8 insights covering different aspects of the pipeline`;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function insightToRow(insight: ClaudeInsight, institutionId: string): Record<string, unknown> {
  return {
    institution_id: institutionId,
    insight_type: insight.type,
    title: insight.title,
    description: insight.description,
    severity: insight.priority,
    data: {
      action_url: insight.action_url,
      action_data: {},
      related_lead_ids: insight.related_lead_ids || [],
      related_counselor_ids: [],
      metric_value: insight.metric_value,
      metric_change: insight.metric_change,
      metric_label: insight.metric_label,
      metadata: insight.metadata || {},
    },
    actions: insight.action_type !== 'no_action'
      ? [{ type: insight.action_type, url: insight.action_url }]
      : [],
    is_dismissed: false,
    expires_at: insight.expires_hours
      ? new Date(Date.now() + insight.expires_hours * 60 * 60 * 1000).toISOString()
      : undefined,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[insights/generate] Request received');

  // ── Step 1: Check API key is configured ───────────────────────────────────
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[insights/generate] CLAUDE_API_KEY or ANTHROPIC_API_KEY is not set in .env');
    return NextResponse.json({ error: 'AI service not configured. Set CLAUDE_API_KEY in .env' }, { status: 500 });
  }
  console.log('[insights/generate] ✓ API key present');

  // ── Step 2: Authenticate user ─────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    console.error('[insights/generate] Auth failed:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized — please log in and try again' }, { status: 401 });
  }
  console.log('[insights/generate] ✓ Auth OK, user:', user.email);

  // ── Step 3: Parse body ────────────────────────────────────────────────────
  let institutionId: string;
  try {
    const body = await request.json();
    institutionId = body.institutionId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!institutionId) {
    return NextResponse.json({ error: 'institutionId is required' }, { status: 400 });
  }
  console.log('[insights/generate] ✓ Institution ID:', institutionId);

  // ── Step 4: Fetch lead data (service role bypasses RLS) ───────────────────
  let serviceClient: ReturnType<typeof createServiceRoleClient>;
  try {
    serviceClient = createServiceRoleClient();
  } catch (e) {
    console.error('[insights/generate] Failed to create service role client:', e);
    return NextResponse.json({ error: 'Database configuration error' }, { status: 500 });
  }

  const { data: leads, error: leadsError } = await serviceClient
    .from('admission_leads')
    .select('*')
    .eq('institution_id', institutionId);

  if (leadsError) {
    console.error('[insights/generate] DB error fetching leads:', leadsError.message);
    return NextResponse.json({ error: `Failed to fetch lead data: ${leadsError.message}` }, { status: 500 });
  }
  console.log('[insights/generate] ✓ Fetched', leads?.length ?? 0, 'leads');

  const allLeads = (leads || []) as AdmissionLead[];
  const stats = buildLeadStats(allLeads);
  console.log('[insights/generate] Stats:', {
    total: stats.total,
    active: stats.active,
    hotLeads: stats.hotLeadsNoContact.count,
    stale: stats.staleLeads.count,
    nearConversion: stats.nearConversion.count,
  });

  // ── Step 5: Call Claude claude-sonnet-4-5 ────────────────────────────────────
  let claudeInsights: ClaudeInsight[] = [];
  try {
    console.log('[insights/generate] Calling Claude API (claude-sonnet-4-5)...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(stats) }],
    });

    const textBlock = response.content.find(c => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    console.log('[insights/generate] ✓ Claude responded, parsing JSON...');

    // Strip any markdown fences Claude might add
    let raw = textBlock.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    const parsed = JSON.parse(raw);
    claudeInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
    console.log('[insights/generate] ✓ Parsed', claudeInsights.length, 'insights from Claude');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[insights/generate] Claude API error:', msg);
    return NextResponse.json({ error: `Claude API failed: ${msg}` }, { status: 500 });
  }

  if (claudeInsights.length === 0) {
    console.warn('[insights/generate] Claude returned 0 insights — returning empty');
    return NextResponse.json({ insights: [] });
  }

  // ── Step 6: Delete old non-dismissed insights ─────────────────────────────
  const { error: deleteError } = await serviceClient
    .from('admission_ai_insights')
    .delete()
    .eq('institution_id', institutionId)
    .eq('is_dismissed', false);

  if (deleteError) {
    console.error('[insights/generate] Non-fatal: error deleting old insights:', deleteError.message);
    // Non-fatal — continue
  } else {
    console.log('[insights/generate] ✓ Old insights cleared');
  }

  // ── Step 7: Insert new insights ───────────────────────────────────────────
  const rows = claudeInsights.map(i => insightToRow(i, institutionId));
  const { data: inserted, error: insertError } = await serviceClient
    .from('admission_ai_insights')
    .insert(rows)
    .select();

  if (insertError) {
    console.error('[insights/generate] DB error inserting insights:', insertError.message);
    return NextResponse.json({ error: `Failed to store insights: ${insertError.message}` }, { status: 500 });
  }

  console.log('[insights/generate] ✓ Inserted', inserted?.length ?? 0, 'insights');
  return NextResponse.json({ insights: inserted || [] });
}
