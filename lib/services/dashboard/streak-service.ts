/**
 * Dashboard v2 — Streak + Activity Feed RPCs
 *
 * Wraps fn_dashboard_streak() and fn_dashboard_activity_feed() RPCs
 * deployed via migration add_fn_dashboard_streak_and_activity_feed.
 *
 * Spec: §4.3 (streak badge) + §4.4 (team activity feed)
 */

import { createClient } from '@/lib/supabase/server';

export interface StreakData {
  current_streak: number;
  best_streak: number;
  today_status: 'on_track' | 'broken';
  today_compliance_pct: number;
}

export interface ActivityFeedItem {
  actor_name: string;
  avatar_url: string | null;
  action_summary: string;
  created_at: string;
  category: string;
}

/**
 * Fetch SLA streak for the current user (counselor = personal, director = JKKN-wide).
 */
export async function getStreak(): Promise<StreakData> {
  const FALLBACK: StreakData = {
    current_streak: 0,
    best_streak: 0,
    today_status: 'on_track',
    today_compliance_pct: 100
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_dashboard_streak');
    if (error) {
      console.error('[dashboard/streak] RPC error:', error.message);
      return FALLBACK;
    }
    return (data as StreakData) ?? FALLBACK;
  } catch (err) {
    console.error('[dashboard/streak] unexpected error:', err);
    return FALLBACK;
  }
}

/**
 * Fetch recent team activity (acknowledged notifications with actor details).
 */
export async function getActivityFeed(limit = 10): Promise<ActivityFeedItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_dashboard_activity_feed', {
      p_limit: limit
    });
    if (error) {
      console.error('[dashboard/activity-feed] RPC error:', error.message);
      return [];
    }
    return (data as ActivityFeedItem[]) ?? [];
  } catch (err) {
    console.error('[dashboard/activity-feed] unexpected error:', err);
    return [];
  }
}
