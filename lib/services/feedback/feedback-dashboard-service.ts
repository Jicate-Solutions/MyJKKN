/**
 * FeedbackDashboardService — client-side read helpers for the /feedback admin dashboard.
 *
 * All queries run against the browser Supabase client (RLS-scoped). The
 * feedback_events SELECT policy is:
 *   is_super_admin() OR is_admin() OR user_has_permission('feedback.view')
 * so only admins / feedback.view holders get rows; everyone else gets an
 * empty array, which the page handles as a permission error.
 *
 * No service-role key is used here — this is a client service.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FeedbackEvent,
  FeedbackSource,
  AiSentiment,
  AiIntent,
} from '@/lib/types/feedback-spine';

const supabase = createClientSupabaseClient();

// ─── Shared filter shape ──────────────────────────────────────────────────────

export interface FeedbackFilters {
  source: FeedbackSource | 'all';
  hideSpam: boolean;
  institutionId?: string;
}

// ─── Summary / tile data ──────────────────────────────────────────────────────

export interface FeedbackSummary {
  total: number;
  bySentiment: Record<AiSentiment, number>;
  bySource: Record<FeedbackSource, number>;
}

export async function fetchFeedbackSummary(
  filters: FeedbackFilters,
): Promise<FeedbackSummary> {
  let query = supabase
    .from('feedback_events')
    .select('ai_sentiment, source, ai_intent');

  if (filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }
  if (filters.hideSpam) {
    query = query.or('ai_intent.neq.spam,ai_intent.is.null'); // keep NULL-intent (unclassified) rows; exclude only real spam
  }
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchFeedbackSummary: ${error.message}`);

  const bySentiment: Record<AiSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };
  const bySource: Record<FeedbackSource, number> = {
    ig_comment: 0,
    ig_dm: 0,
    session_feedback: 0,
    ai_pulse: 0,
    mess: 0,
    class_feedback: 0,
    parent: 0,
    scf_checkin: 0,
  };

  for (const row of data ?? []) {
    if (row.ai_sentiment && row.ai_sentiment in bySentiment) {
      bySentiment[row.ai_sentiment as AiSentiment]++;
    }
    if (row.source && row.source in bySource) {
      bySource[row.source as FeedbackSource]++;
    }
  }

  return {
    total: data?.length ?? 0,
    bySentiment,
    bySource,
  };
}

// ─── Sentiment over time ──────────────────────────────────────────────────────

export interface SentimentBucket {
  date: string; // 'YYYY-MM-DD'
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
}

export async function fetchSentimentOverTime(
  filters: FeedbackFilters,
  days = 30,
): Promise<SentimentBucket[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
    .from('feedback_events')
    .select('occurred_at, ai_sentiment')
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: true });

  if (filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }
  if (filters.hideSpam) {
    query = query.or('ai_intent.neq.spam,ai_intent.is.null'); // keep NULL-intent (unclassified) rows; exclude only real spam
  }
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchSentimentOverTime: ${error.message}`);

  // Bucket by day
  const bucketMap = new Map<string, SentimentBucket>();
  for (const row of data ?? []) {
    const day = (row.occurred_at as string).slice(0, 10);
    if (!bucketMap.has(day)) {
      bucketMap.set(day, { date: day, positive: 0, neutral: 0, negative: 0, mixed: 0 });
    }
    const bucket = bucketMap.get(day)!;
    const sent = row.ai_sentiment as AiSentiment | null;
    if (sent === 'positive') bucket.positive++;
    else if (sent === 'neutral') bucket.neutral++;
    else if (sent === 'negative') bucket.negative++;
    else if (sent === 'mixed') bucket.mixed++;
  }

  // Return only buckets that have data, sorted by date
  return Array.from(bucketMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

// ─── Top themes ───────────────────────────────────────────────────────────────

export interface TopicCount {
  topic: string;
  count: number;
}

export async function fetchTopTopics(
  filters: FeedbackFilters,
  limit = 12,
): Promise<TopicCount[]> {
  let query = supabase
    .from('feedback_events')
    .select('ai_topic')
    .not('ai_topic', 'is', null);

  if (filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }
  if (filters.hideSpam) {
    query = query.or('ai_intent.neq.spam,ai_intent.is.null'); // keep NULL-intent (unclassified) rows; exclude only real spam
  }
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchTopTopics: ${error.message}`);

  const countMap = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.ai_topic) {
      countMap.set(row.ai_topic, (countMap.get(row.ai_topic) ?? 0) + 1);
    }
  }

  return Array.from(countMap.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ─── Complaints needing reply ─────────────────────────────────────────────────

/** Internal sources listed first. */
const SOURCE_PRIORITY: Record<FeedbackSource, number> = {
  session_feedback: 0,
  class_feedback: 1,
  mess: 2,
  parent: 3,
  scf_checkin: 4,
  ai_pulse: 5,
  ig_dm: 6,
  ig_comment: 7,
};

export interface ComplaintRow {
  id: string;
  source: FeedbackSource;
  actor_ref: string | null;
  content: string | null;
  ai_topic: string | null;
  ai_sentiment: AiSentiment | null;
  ai_draft_reply: string | null;
  occurred_at: string;
}

export async function fetchComplaints(
  filters: FeedbackFilters,
): Promise<ComplaintRow[]> {
  let query = supabase
    .from('feedback_events')
    .select(
      'id, source, actor_ref, content, ai_topic, ai_sentiment, ai_draft_reply, occurred_at',
    )
    .in('ai_intent', ['complaint', 'question', 'request'])
    .neq('ai_intent', 'spam'); // never show spam in complaints, regardless of toggle

  if (filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  query = query.order('occurred_at', { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) throw new Error(`fetchComplaints: ${error.message}`);

  const rows = (data ?? []) as ComplaintRow[];

  // Sort internal voice (session_feedback) to the top
  return rows.sort(
    (a, b) =>
      (SOURCE_PRIORITY[a.source] ?? 99) - (SOURCE_PRIORITY[b.source] ?? 99),
  );
}

// ─── Concentration by post ────────────────────────────────────────────────────

export interface ConcentrationRow {
  source: FeedbackSource;
  target_ref: string | null;
  total: number;
  negative: number;
}

export async function fetchConcentrationByPost(
  filters: FeedbackFilters,
): Promise<ConcentrationRow[]> {
  let query = supabase
    .from('feedback_events')
    .select('source, target_ref, ai_sentiment');

  if (filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }
  if (filters.hideSpam) {
    query = query.or('ai_intent.neq.spam,ai_intent.is.null'); // keep NULL-intent (unclassified) rows; exclude only real spam
  }
  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchConcentrationByPost: ${error.message}`);

  const map = new Map<string, ConcentrationRow>();
  for (const row of data ?? []) {
    const key = `${row.source}::${row.target_ref ?? '(no target)'}`;
    if (!map.has(key)) {
      map.set(key, {
        source: row.source as FeedbackSource,
        target_ref: row.target_ref,
        total: 0,
        negative: 0,
      });
    }
    const entry = map.get(key)!;
    entry.total++;
    if (row.ai_sentiment === 'negative') entry.negative++;
  }

  return Array.from(map.values()).sort((a, b) => b.negative - a.negative);
}
