// lib/services/admission/lead-mood-service.ts
// Lead Mood Digest Service — surfaces aggregate sentiment of today's admission calls
// from admission_call_intelligence rows populated by the analyze cron (PR #776).
//
// Empirical motivation (2026-05-08): the analyze cron just deployed; will populate
// admission_call_intelligence.sentiment / sentiment_score / categories / summary
// every 15 min for ~50 calls/run. Director needs a single page showing the mood
// of today's leads + drilldown to anxious leads. Page must render an empty state
// gracefully because at the moment of ship, ZERO calls have been analyzed yet.

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface MoodKPIs {
  total_calls_today: number;
  analyzed_today: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  concerned_count: number; // catch-all for anxious / concerned / negative score < 0.3
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  concerned_pct: number;
  computed_at: string;
}

export interface MoodDistribution {
  bucket_id: string;       // counselor user_id OR institution_id depending on group_by
  bucket_name: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface TopConcern {
  category: string;
  count: number;
}

export interface AnxiousLeadRow {
  intelligence_id: string;
  call_log_id: string;
  call_sid: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  counselor_id: string | null;
  counselor_name: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  summary_excerpt: string | null;
  call_created_at: string;
  institution_id: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function classifySentiment(sentiment: string | null, score: number | null): 'positive' | 'neutral' | 'negative' {
  const s = (sentiment || '').toLowerCase();
  if (['positive', 'happy', 'enthusiastic'].includes(s)) return 'positive';
  if (['negative', 'concerned', 'anxious', 'angry', 'frustrated'].includes(s)) return 'negative';
  if (s === 'neutral') return 'neutral';
  // Fall back to score if sentiment string is unrecognized or null
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

// ============================================================================
// SERVICE
// ============================================================================

export class LeadMoodService {
  /**
   * KPI strip — total calls today, analyzed count, sentiment distribution.
   * Returns zeros gracefully when nothing has been analyzed yet.
   */
  static async getTodayKPIs(institutionId?: string): Promise<MoodKPIs> {
    const supabase = createClientSupabaseClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Total calls today (denominator)
    let totalQuery = supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart);
    if (institutionId) totalQuery = totalQuery.eq('institution_id', institutionId);
    const { count: totalCallsToday } = await totalQuery;

    // Analyzed intelligence rows whose underlying call was created today
    // We join via call_log_id → admission_call_logs.created_at
    let intelQuery = supabase
      .from('admission_call_intelligence')
      .select('id, sentiment, sentiment_score, admission_call_logs!inner(created_at)')
      .gte('admission_call_logs.created_at', todayStart)
      .not('sentiment', 'is', null);
    if (institutionId) intelQuery = intelQuery.eq('institution_id', institutionId);
    const { data: analyzed } = await intelQuery;

    const rows = (analyzed || []) as Array<{
      id: string;
      sentiment: string | null;
      sentiment_score: number | null;
    }>;

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

    return {
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
  }

  /**
   * Mood distribution stacked-bar data, grouped by counselor or institution.
   * Returns empty array when nothing analyzed.
   */
  static async getMoodDistribution(
    groupBy: 'counselor' | 'institution' = 'counselor',
    institutionId?: string,
  ): Promise<MoodDistribution[]> {
    const supabase = createClientSupabaseClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Pull intelligence rows joined with call logs (for counselor_id + created_at filter)
    let q = supabase
      .from('admission_call_intelligence')
      .select(
        'id, sentiment, sentiment_score, institution_id, admission_call_logs!inner(counselor_id, created_at)',
      )
      .gte('admission_call_logs.created_at', todayStart)
      .not('sentiment', 'is', null);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data: rows } = await q;

    const flat = (rows || []) as Array<{
      id: string;
      sentiment: string | null;
      sentiment_score: number | null;
      institution_id: string | null;
      admission_call_logs: { counselor_id: string | null; created_at: string } | null;
    }>;

    if (flat.length === 0) return [];

    // Aggregate per bucket
    const buckets = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
    flat.forEach((r) => {
      const bucketKey =
        groupBy === 'counselor'
          ? r.admission_call_logs?.counselor_id || 'unassigned'
          : r.institution_id || 'unknown';
      const existing = buckets.get(bucketKey) || { positive: 0, neutral: 0, negative: 0, total: 0 };
      const cls = classifySentiment(r.sentiment, r.sentiment_score);
      if (cls === 'positive') existing.positive++;
      else if (cls === 'neutral') existing.neutral++;
      else existing.negative++;
      existing.total++;
      buckets.set(bucketKey, existing);
    });

    // Resolve display names
    const bucketIds = Array.from(buckets.keys()).filter((id) => id !== 'unassigned' && id !== 'unknown');
    const nameMap = new Map<string, string>();
    if (bucketIds.length > 0) {
      if (groupBy === 'counselor') {
        const { data: counselors } = await supabase
          .from('admission_counselors')
          .select('user_id, name')
          .in('user_id', bucketIds);
        (counselors || []).forEach((c) => {
          if (c.user_id && c.name) nameMap.set(c.user_id, c.name);
        });
      } else {
        const { data: institutions } = await supabase
          .from('institutions')
          .select('id, name')
          .in('id', bucketIds);
        (institutions || []).forEach((i) => {
          if (i.id && i.name) nameMap.set(i.id, i.name);
        });
      }
    }

    return Array.from(buckets.entries())
      .map(([bucketId, counts]) => ({
        bucket_id: bucketId,
        bucket_name:
          bucketId === 'unassigned'
            ? 'Unassigned'
            : bucketId === 'unknown'
              ? 'Unknown'
              : nameMap.get(bucketId) || bucketId.slice(0, 8),
        positive: counts.positive,
        neutral: counts.neutral,
        negative: counts.negative,
        total: counts.total,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Top concern categories aggregated from `categories` array column over the last N days.
   */
  static async getTopConcerns(days = 1, institutionId?: string): Promise<TopConcern[]> {
    const supabase = createClientSupabaseClient();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from('admission_call_intelligence')
      .select('categories, admission_call_logs!inner(created_at)')
      .gte('admission_call_logs.created_at', cutoff)
      .not('categories', 'is', null);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data } = await q;

    const flat = (data || []) as Array<{ categories: string[] | null }>;
    if (flat.length === 0) return [];

    const counts = new Map<string, number>();
    flat.forEach((r) => {
      (r.categories || []).forEach((cat) => {
        if (!cat) return;
        const key = cat.trim();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Anxious leads — most-recent analyzed call had negative sentiment OR score < 0.3.
   * Sorted by call recency desc.
   */
  static async getAnxiousLeads(limit = 50, institutionId?: string): Promise<AnxiousLeadRow[]> {
    const supabase = createClientSupabaseClient();

    // Pull recent intelligence rows with negative-leaning sentiment, joined with call log + lead
    let q = supabase
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
      .limit(limit);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data } = await q;

    type Joined = {
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
        admission_leads: { id: string; full_name: string | null; first_name: string | null; phone: string | null } | null;
      } | null;
    };

    const rows = (data || []) as Joined[];
    if (rows.length === 0) return [];

    // Resolve counselor names
    const counselorIds = Array.from(
      new Set(
        rows
          .map((r) => r.admission_call_logs?.counselor_id)
          .filter(Boolean) as string[],
      ),
    );
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

    return rows
      .filter((r) => r.admission_call_logs) // drop orphaned (shouldn't happen given !inner)
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
          counselor_name: log.counselor_id ? nameMap.get(log.counselor_id) || null : null,
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
  }
}

// ============================================================================
// REACT QUERY HOOKS
// ============================================================================

import { useQuery } from '@tanstack/react-query';

export const leadMoodKeys = {
  all: ['lead-mood'] as const,
  kpis: (institutionId?: string) => [...leadMoodKeys.all, 'kpis', institutionId] as const,
  distribution: (groupBy: string, institutionId?: string) =>
    [...leadMoodKeys.all, 'distribution', groupBy, institutionId] as const,
  topConcerns: (days: number, institutionId?: string) =>
    [...leadMoodKeys.all, 'top-concerns', days, institutionId] as const,
  anxiousLeads: (limit: number, institutionId?: string) =>
    [...leadMoodKeys.all, 'anxious-leads', limit, institutionId] as const,
};

const REFRESH_MS = 30_000;

export function useTodayMoodKPIs(institutionId?: string) {
  return useQuery({
    queryKey: leadMoodKeys.kpis(institutionId),
    queryFn: () => LeadMoodService.getTodayKPIs(institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useMoodDistributionByCounselor(institutionId?: string) {
  return useQuery({
    queryKey: leadMoodKeys.distribution('counselor', institutionId),
    queryFn: () => LeadMoodService.getMoodDistribution('counselor', institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useMoodDistributionByInstitution(institutionId?: string) {
  return useQuery({
    queryKey: leadMoodKeys.distribution('institution', institutionId),
    queryFn: () => LeadMoodService.getMoodDistribution('institution', institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useTopConcerns(days = 1, institutionId?: string) {
  return useQuery({
    queryKey: leadMoodKeys.topConcerns(days, institutionId),
    queryFn: () => LeadMoodService.getTopConcerns(days, institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useAnxiousLeads(limit = 50, institutionId?: string) {
  return useQuery({
    queryKey: leadMoodKeys.anxiousLeads(limit, institutionId),
    queryFn: () => LeadMoodService.getAnxiousLeads(limit, institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}
