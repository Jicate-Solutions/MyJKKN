// app/api/admission/lead-mood/route.ts
// GET — server-side aggregate for the Lead Mood Digest dashboard.
// Returns: { kpis, distribution, topConcerns, anxiousLeads }
//
// Auth: super_admin OR admission-global users only. The page uses client-side
// React Query hooks for real-time refresh, but this endpoint is provided so
// external schedulers (digests, alerts) can pull the same payload server-side.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function classifySentiment(
  sentiment: string | null,
  score: number | null,
): 'positive' | 'neutral' | 'negative' {
  const s = (sentiment || '').toLowerCase();
  if (['positive', 'happy', 'enthusiastic'].includes(s)) return 'positive';
  if (['negative', 'concerned', 'anxious', 'angry', 'frustrated'].includes(s)) return 'negative';
  if (s === 'neutral') return 'neutral';
  if (score != null) {
    if (score >= 0.6) return 'positive';
    if (score < 0.3) return 'negative';
  }
  return 'neutral';
}

function isConcerned(sentiment: string | null, score: number | null): boolean {
  const s = (sentiment || '').toLowerCase();
  if (['negative', 'concerned', 'anxious', 'angry', 'frustrated'].includes(s)) return true;
  if (score != null && score < 0.3) return true;
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') || undefined;

    // Permission gate: super_admin OR admission-global scope
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (!isSuperAdmin) {
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope)')
        .eq('user_id', user.id);

      const hasGlobalScope = (userRolesData || []).some(
        (ur: any) => ur.custom_roles?.institution_scope === 'all',
      );

      if (!hasGlobalScope) {
        if (institutionId && institutionId !== profile?.institution_id) {
          return NextResponse.json({ error: 'No access to this institution' }, { status: 403 });
        }
      }
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // -------------------------------------------------
    // 1. KPIs
    // -------------------------------------------------
    let totalQ = supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart);
    if (institutionId) totalQ = totalQ.eq('institution_id', institutionId);
    const { count: totalCallsToday } = await totalQ;

    let intelQ = supabase
      .from('admission_call_intelligence')
      .select(
        'id, sentiment, sentiment_score, institution_id, categories, admission_call_logs!inner(counselor_id, created_at)',
      )
      .gte('admission_call_logs.created_at', todayStart)
      .not('sentiment', 'is', null);
    if (institutionId) intelQ = intelQ.eq('institution_id', institutionId);
    const { data: analyzed } = await intelQ;

    type IntelRow = {
      id: string;
      sentiment: string | null;
      sentiment_score: number | null;
      institution_id: string | null;
      categories: string[] | null;
      admission_call_logs: { counselor_id: string | null; created_at: string } | null;
    };

    const rows = (analyzed || []) as IntelRow[];

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let concerned = 0;
    rows.forEach((r) => {
      const cls = classifySentiment(r.sentiment, r.sentiment_score);
      if (cls === 'positive') positive++;
      else if (cls === 'neutral') neutral++;
      else negative++;
      if (isConcerned(r.sentiment, r.sentiment_score)) concerned++;
    });

    const analyzedTotal = rows.length;
    const pct = (n: number) => (analyzedTotal > 0 ? Math.round((n / analyzedTotal) * 100) : 0);

    const kpis = {
      total_calls_today: totalCallsToday || 0,
      analyzed_today: analyzedTotal,
      positive_count: positive,
      neutral_count: neutral,
      negative_count: negative,
      concerned_count: concerned,
      positive_pct: pct(positive),
      neutral_pct: pct(neutral),
      negative_pct: pct(negative),
      concerned_pct: pct(concerned),
      computed_at: new Date().toISOString(),
    };

    // -------------------------------------------------
    // 2. Distribution by counselor
    // -------------------------------------------------
    const buckets = new Map<
      string,
      { positive: number; neutral: number; negative: number; total: number }
    >();
    rows.forEach((r) => {
      const key = r.admission_call_logs?.counselor_id || 'unassigned';
      const ex = buckets.get(key) || { positive: 0, neutral: 0, negative: 0, total: 0 };
      const cls = classifySentiment(r.sentiment, r.sentiment_score);
      if (cls === 'positive') ex.positive++;
      else if (cls === 'neutral') ex.neutral++;
      else ex.negative++;
      ex.total++;
      buckets.set(key, ex);
    });

    const counselorIds = Array.from(buckets.keys()).filter((id) => id !== 'unassigned');
    const nameMap = new Map<string, string>();
    if (counselorIds.length > 0) {
      const { data: counselors } = await supabase
        .from('admission_counselors')
        .select('user_id, name')
        .in('user_id', counselorIds);
      (counselors || []).forEach((c) => {
        if (c.user_id && c.name) nameMap.set(c.user_id, c.name);
      });
    }

    const distribution = Array.from(buckets.entries())
      .map(([id, c]) => ({
        bucket_id: id,
        bucket_name: id === 'unassigned' ? 'Unassigned' : nameMap.get(id) || id.slice(0, 8),
        positive: c.positive,
        neutral: c.neutral,
        negative: c.negative,
        total: c.total,
      }))
      .sort((a, b) => b.total - a.total);

    // -------------------------------------------------
    // 3. Top concerns (last 24h categories)
    // -------------------------------------------------
    const categoryCounts = new Map<string, number>();
    rows.forEach((r) => {
      (r.categories || []).forEach((cat) => {
        if (!cat) return;
        const key = cat.trim();
        if (!key) return;
        categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
      });
    });
    const topConcerns = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // -------------------------------------------------
    // 4. Anxious leads (recent N with negative sentiment)
    // -------------------------------------------------
    let anxiousQ = supabase
      .from('admission_call_intelligence')
      .select(
        `
        id,
        call_log_id,
        call_sid,
        sentiment,
        sentiment_score,
        summary,
        institution_id,
        admission_call_logs!inner (
          id,
          created_at,
          counselor_id,
          lead_id,
          to_number,
          admission_leads (
            id,
            full_name,
            first_name,
            phone
          )
        )
      `,
      )
      .or('sentiment.in.(negative,concerned,anxious,angry,frustrated),sentiment_score.lt.0.3')
      .order('id', { ascending: false })
      .limit(50);
    if (institutionId) anxiousQ = anxiousQ.eq('institution_id', institutionId);
    const { data: anxiousRaw } = await anxiousQ;

    type AnxiousJoined = {
      id: string;
      call_log_id: string;
      call_sid: string;
      sentiment: string | null;
      sentiment_score: number | null;
      summary: string | null;
      institution_id: string | null;
      admission_call_logs: {
        id: string;
        created_at: string;
        counselor_id: string | null;
        lead_id: string | null;
        to_number: string | null;
        admission_leads: {
          id: string;
          full_name: string | null;
          first_name: string | null;
          phone: string | null;
        } | null;
      } | null;
    };

    const anxiousRows = (anxiousRaw || []) as AnxiousJoined[];

    const anxiousCounselorIds = Array.from(
      new Set(
        anxiousRows.map((r) => r.admission_call_logs?.counselor_id).filter(Boolean) as string[],
      ),
    );
    const anxiousNameMap = new Map<string, string>(nameMap);
    const missing = anxiousCounselorIds.filter((id) => !anxiousNameMap.has(id));
    if (missing.length > 0) {
      const { data: more } = await supabase
        .from('admission_counselors')
        .select('user_id, name')
        .in('user_id', missing);
      (more || []).forEach((c) => {
        if (c.user_id && c.name) anxiousNameMap.set(c.user_id, c.name);
      });
    }

    const anxiousLeads = anxiousRows
      .filter((r) => r.admission_call_logs)
      .map((r) => {
        const log = r.admission_call_logs!;
        const lead = log.admission_leads || null;
        return {
          intelligence_id: r.id,
          call_log_id: r.call_log_id,
          call_sid: r.call_sid,
          lead_id: log.lead_id,
          lead_name: lead?.full_name || lead?.first_name || null,
          lead_phone: lead?.phone || log.to_number || null,
          counselor_id: log.counselor_id,
          counselor_name: log.counselor_id ? anxiousNameMap.get(log.counselor_id) || null : null,
          sentiment: r.sentiment,
          sentiment_score: r.sentiment_score,
          summary_excerpt: r.summary ? r.summary.slice(0, 100) : null,
          call_created_at: log.created_at,
          institution_id: r.institution_id,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.call_created_at).getTime() - new Date(a.call_created_at).getTime(),
      );

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        distribution,
        topConcerns,
        anxiousLeads,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', details: (err as Error).message },
      { status: 500 },
    );
  }
}
