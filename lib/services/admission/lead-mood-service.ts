// lib/services/admission/lead-mood-service.ts
// Lead Mood Digest Service — surfaces aggregate sentiment of today's
// counselor voice memos.
//
// 2026-05-09 DATA-SOURCE SWAP (Build #4 voice-memo backend):
//   Previously read from `admission_call_intelligence` (Exotel ExoVoice
//   pipeline) — that table is empty because the auto-transcribe feature
//   flag was off and historical 3,229 calls were never analyzed.
//
//   Director's Path A pivots the sentiment-capture mechanism: counselors
//   record 30-second English voice memos after each call, OpenAI Whisper
//   transcribes (English-forced + language guardrail), GPT-4o-mini
//   extracts sentiment + summary + categories. All written to memo_*
//   columns ON `admission_call_logs` itself — no join required.
//
//   This file now reads admission_call_logs.memo_sentiment / memo_summary /
//   memo_categories / memo_analyze_status. UI hooks (PR #779) consume the
//   same return shapes (MoodKPIs, MoodDistribution, TopConcern,
//   AnxiousLeadRow) — no UI change needed.
//
//   Filter: only `memo_analyze_status = 'completed'` rows count.
//   Rejected non-English memos are excluded from aggregation but still
//   counted in `total_calls_today`.

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
  intelligence_id: string;   // kept for UI compat — now equals call_log_id
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
  if (['negative', 'concerned', 'anxious', 'angry', 'frustrated', 'hostile'].includes(s)) return 'negative';
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
  if (['negative', 'concerned', 'anxious', 'angry', 'frustrated', 'hostile'].includes(s)) return true;
  if (score != null && score < 0.3) return true;
  return false;
}

// ============================================================================
// SERVICE
// ============================================================================

export class LeadMoodService {
  /**
   * KPI strip — total calls today, analyzed memo count, sentiment distribution.
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

    // Analyzed memo rows from call_logs created today.
    // Only memo_analyze_status='completed' counts toward sentiment buckets;
    // 'rejected_non_english' and other statuses don't poison the metric.
    let memoQuery = supabase
      .from('admission_call_logs')
      .select('id, memo_sentiment, memo_sentiment_score')
      .gte('created_at', todayStart)
      .eq('memo_analyze_status', 'completed')
      .not('memo_sentiment', 'is', null);
    if (institutionId) memoQuery = memoQuery.eq('institution_id', institutionId);
    const { data: analyzed } = await memoQuery;

    const rows = (analyzed || []) as Array<{
      id: string;
      memo_sentiment: string | null;
      memo_sentiment_score: number | null;
    }>;

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let concerned = 0;
    rows.forEach((r) => {
      const cls = classifySentiment(r.memo_sentiment, r.memo_sentiment_score);
      if (cls === 'positive') positive++;
      else if (cls === 'neutral') neutral++;
      else negative++;
      if (isConcerned(r.memo_sentiment, r.memo_sentiment_score)) concerned++;
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

    let q = supabase
      .from('admission_call_logs')
      .select('id, memo_sentiment, memo_sentiment_score, institution_id, counselor_id')
      .gte('created_at', todayStart)
      .eq('memo_analyze_status', 'completed')
      .not('memo_sentiment', 'is', null);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data: rows } = await q;

    const flat = (rows || []) as Array<{
      id: string;
      memo_sentiment: string | null;
      memo_sentiment_score: number | null;
      institution_id: string | null;
      counselor_id: string | null;
    }>;

    if (flat.length === 0) return [];

    // Aggregate per bucket
    const buckets = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
    flat.forEach((r) => {
      const bucketKey =
        groupBy === 'counselor'
          ? r.counselor_id || 'unassigned'
          : r.institution_id || 'unknown';
      const existing = buckets.get(bucketKey) || { positive: 0, neutral: 0, negative: 0, total: 0 };
      const cls = classifySentiment(r.memo_sentiment, r.memo_sentiment_score);
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
   * Top concern categories aggregated from `memo_categories` array column over the last N days.
   */
  static async getTopConcerns(days = 1, institutionId?: string): Promise<TopConcern[]> {
    const supabase = createClientSupabaseClient();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from('admission_call_logs')
      .select('memo_categories')
      .gte('created_at', cutoff)
      .eq('memo_analyze_status', 'completed')
      .not('memo_categories', 'is', null);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data } = await q;

    const flat = (data || []) as Array<{ memo_categories: string[] | null }>;
    if (flat.length === 0) return [];

    const counts = new Map<string, number>();
    flat.forEach((r) => {
      (r.memo_categories || []).forEach((cat) => {
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
   * Anxious leads — most-recent analyzed memo had negative sentiment OR score < 0.3.
   * Sorted by call recency desc.
   */
  static async getAnxiousLeads(limit = 50, institutionId?: string): Promise<AnxiousLeadRow[]> {
    const supabase = createClientSupabaseClient();

    // Pull recent call_logs with completed memos and negative-leaning sentiment.
    let q = supabase
      .from('admission_call_logs')
      .select(
        `
        id,
        call_sid,
        memo_sentiment,
        memo_sentiment_score,
        memo_summary,
        institution_id,
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
      `,
      )
      .eq('memo_analyze_status', 'completed')
      .or(
        'memo_sentiment.in.(negative,concerned,anxious,angry,frustrated,hostile),memo_sentiment_score.lt.0.3',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data } = await q;

    type Joined = {
      id: string;
      call_sid: string;
      memo_sentiment: string | null;
      memo_sentiment_score: number | null;
      memo_summary: string | null;
      institution_id: string | null;
      created_at: string;
      counselor_id: string | null;
      lead_id: string | null;
      to_number: string | null;
      admission_leads:
        | { id: string; full_name: string | null; first_name: string | null; phone: string | null }
        | null;
    };

    const rows = (data || []) as Joined[];
    if (rows.length === 0) return [];

    // Resolve counselor names
    const counselorIds = Array.from(
      new Set(rows.map((r) => r.counselor_id).filter(Boolean) as string[]),
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
      .map((r) => {
        const lead = r.admission_leads || null;
        return {
          intelligence_id: r.id, // alias call_log_id for UI compatibility
          call_log_id: r.id,
          call_sid: r.call_sid,
          lead_id: r.lead_id,
          lead_name: lead?.full_name || lead?.first_name || null,
          lead_phone: lead?.phone || r.to_number || null,
          counselor_id: r.counselor_id,
          counselor_name: r.counselor_id ? nameMap.get(r.counselor_id) || null : null,
          sentiment: r.memo_sentiment,
          sentiment_score: r.memo_sentiment_score,
          summary_excerpt: r.memo_summary ? r.memo_summary.slice(0, 100) : null,
          call_created_at: r.created_at,
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
