/**
 * Dashboard v2 — Leaderboard service (server fetch from materialized views)
 *
 * Reads from v_dashboard_sla_daily and v_dashboard_conversion_monthly
 * (populated Day 1 via fn_dashboard_metrics migrations).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.6
 * Refresh: SLA every 5 min (pg_cron phase 2), Conversion daily at midnight IST
 */

import { createClient } from '@/lib/supabase/server';

export type LeaderboardRow = {
  counselor_id: string;
  full_name: string | null;
  avatar_url: string | null;
  institution_id: string | null;
  institution_name: string | null;
  lead_count: number;
  rank_global: number;
  /** Daily SLA only */
  median_minutes_to_first_touch?: number | null;
  compliance_pct?: number | null;
  /** Monthly conversion only */
  converted_count?: number;
  conversion_pct?: number | null;
};

export type LeaderboardResult = {
  rows: LeaderboardRow[];
  total: number;
  empty_reason?: 'no_data' | 'not_enough_leads' | null;
};

export async function getSlaDailyLeaderboard(
  limit = 10,
  institutionId?: string | null
): Promise<LeaderboardResult> {
  const supabase = await createClient();
  let q = supabase
    .from('v_dashboard_sla_daily')
    .select(
      'counselor_id, full_name, avatar_url, institution_id, institution_name, lead_count, rank_global, median_minutes_to_first_touch, compliance_pct',
      { count: 'exact' }
    )
    .order('rank_global', { ascending: true })
    .limit(limit);

  if (institutionId) {
    q = q.eq('institution_id', institutionId);
  }

  const { data, error, count } = await q;
  if (error) {
    console.error('[dashboard/leaderboard] sla_daily error:', error);
    throw new Error(`v_dashboard_sla_daily select failed: ${error.message}`);
  }
  return {
    rows: (data ?? []) as LeaderboardRow[],
    total: count ?? 0,
    empty_reason: (data?.length ?? 0) === 0 ? 'not_enough_leads' : null
  };
}

export async function getConversionMonthlyLeaderboard(
  limit = 10,
  institutionId?: string | null
): Promise<LeaderboardResult> {
  const supabase = await createClient();
  let q = supabase
    .from('v_dashboard_conversion_monthly')
    .select(
      'counselor_id, full_name, avatar_url, institution_id, institution_name, lead_count, rank_global, converted_count, conversion_pct',
      { count: 'exact' }
    )
    .order('rank_global', { ascending: true })
    .limit(limit);

  if (institutionId) {
    q = q.eq('institution_id', institutionId);
  }

  const { data, error, count } = await q;
  if (error) {
    console.error('[dashboard/leaderboard] conversion_monthly error:', error);
    throw new Error(`v_dashboard_conversion_monthly select failed: ${error.message}`);
  }
  return {
    rows: (data ?? []) as LeaderboardRow[],
    total: count ?? 0,
    empty_reason: (data?.length ?? 0) === 0 ? 'not_enough_leads' : null
  };
}

/**
 * Initials from full_name for avatar fallback ("Priya Kumari" → "PK")
 */
export function initialsFromName(name: string | null): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Formats median minutes into "3m" / "1h 12m" / "4h"
 */
export function formatMinutes(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m - h * 60);
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
