// lib/services/notification/notification-trajectories-service.ts
//
// Aggregates daily-digest notifications into per-category trajectory cards
// for the /notifications "TRENDS" disposition section.
//
// Design rationale: cron-generated digests (dashboard:rescue, dashboard:anomaly,
// dashboard:approval, dashboard:hr_brief) re-fire daily with the same title
// pattern but a fresh count. Rendering them chronologically produces 5+ near-
// identical cards per category — the trend gets buried under repetition.
// This service collapses each category into a single trajectory card showing
// today's value + a 7-day sparkline + change-vs-baseline + breakdown chips.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TrajectoryPoint {
  /** ISO date (YYYY-MM-DD) */
  day: string;
  /** Total parsed from notification title; null if title couldn't be parsed */
  total: number | null;
  /** Original notification ID for click-through */
  notification_id: string;
}

export interface CategoryTrajectory {
  /** e.g. "dashboard:rescue" */
  category: string;
  /** Human-readable label, e.g. "Stale leads" */
  label: string;
  /** Most recent (today's) total value */
  current_total: number | null;
  /** Percent change vs first point in the series; null if can't compute */
  change_pct_7d: number | null;
  /** Direction emoji indicator: ↗ / ↘ / → */
  trend_arrow: '↗' | '↘' | '→';
  /** Sparkline points, oldest-to-newest */
  trajectory: TrajectoryPoint[];
  /** Sub-category breakdown parsed from latest notification body */
  breakdown: Record<string, number>;
  /** Click-through destination */
  action_url: string | null;
  /** Latest notification's ID (for mark-as-read on click) */
  latest_notification_id: string;
  /** Latest notification's user_notifications join row ID */
  latest_user_notification_id: string;
  /** ISO timestamp of latest digest */
  latest_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'dashboard:rescue': 'Stale leads',
  'dashboard:approval': 'Approvals pending',
  'dashboard:anomaly': 'Anomaly signals',
  'dashboard:hr_brief': 'HR brief'
};

// Title pattern: "Daily digest — 15402 stale lead(s)"
//                "Daily digest — 26 approval(s) pending"
//                "Daily digest — 291 anomaly signal(s)"
//                "HR brief — 15 active recruitment"
const TITLE_NUMBER_RE = /(?:Daily digest|HR brief)\s+—\s+([\d,]+)\s/i;

// Body pattern for breakdown:
//   "291 anomaly signal(s). untriaged_bugs: 257, unmarked_attendance: 34."
//   "26 approval(s) pending. recruitment: 19, service_requests: 7."
//   "15402 stale lead(s). Engineering and Technology: 6622, Pharmacy: 647, ..."
const BREAKDOWN_KV_RE = /([A-Za-z][A-Za-z _-]+?):\s*([\d,]+)/g;

function parseTitleNumber(title: string): number | null {
  const m = title.match(TITLE_NUMBER_RE);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''), 10);
}

function parseBreakdown(body: string): Record<string, number> {
  // Strip the leading sentence ("291 anomaly signal(s).") so we only
  // tokenize the breakdown clause.
  const clause = body.replace(/^[^.]*\.\s*/, '');
  const out: Record<string, number> = {};
  let m: RegExpExecArray | null;
  BREAKDOWN_KV_RE.lastIndex = 0;
  while ((m = BREAKDOWN_KV_RE.exec(clause)) !== null) {
    const key = m[1].trim();
    const value = parseInt(m[2].replace(/,/g, ''), 10);
    if (!isNaN(value)) out[key] = value;
  }
  return out;
}

function arrowFor(changePct: number | null): '↗' | '↘' | '→' {
  if (changePct === null || Math.abs(changePct) < 1) return '→';
  return changePct > 0 ? '↗' : '↘';
}

/**
 * Fetch the user's daily-digest notifications over the last `days` days,
 * group by category, and return a trajectory per category.
 *
 * Uses the cookie-scoped Supabase client passed in; the caller (API route)
 * is responsible for authentication.
 */
export async function getNotificationTrajectories(
  supabase: SupabaseClient,
  userId: string,
  days = 14
): Promise<CategoryTrajectory[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Pull all digest-flagged notifications for this user in the window.
  // We need the inner join to filter on the embedded notifications table.
  const { data, error } = await supabase
    .from('user_notifications')
    .select(
      `
      id,
      notification_id,
      created_at,
      read_at,
      notification:notifications!user_notifications_notification_id_fkey!inner(
        id,
        title,
        body,
        category,
        action_config,
        created_at
      )
    `
    )
    .eq('user_id', userId)
    .like('notification.category', 'dashboard:%')
    .filter('notification.action_config->>digest', 'eq', 'true')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  if (!data) return [];

  // Group rows by category, then by day (keep the latest row per category-day).
  type Row = {
    id: string;
    notification_id: string;
    created_at: string;
    read_at: string | null;
    notification: any;
  };
  const byCategoryDay = new Map<string, Map<string, Row>>();

  for (const row of data as unknown as Row[]) {
    const n = row.notification;
    if (!n) continue;
    const category: string = n.category;
    const day = (row.created_at || '').slice(0, 10);
    if (!day) continue;

    if (!byCategoryDay.has(category)) byCategoryDay.set(category, new Map());
    const dayMap = byCategoryDay.get(category)!;

    // Rows are sorted DESC by created_at, so the first row we see per day is
    // the latest. Skip duplicates from the same day.
    if (!dayMap.has(day)) dayMap.set(day, row);
  }

  const out: CategoryTrajectory[] = [];

  for (const [category, dayMap] of byCategoryDay.entries()) {
    // Sort days ascending (oldest -> newest) for sparkline orientation.
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    );

    const trajectory: TrajectoryPoint[] = sortedDays.map(([day, row]) => ({
      day,
      total: parseTitleNumber(row.notification.title || ''),
      notification_id: row.notification.id
    }));

    const valid = trajectory.filter((p) => p.total !== null) as Array<
      TrajectoryPoint & { total: number }
    >;
    const current = valid[valid.length - 1] ?? null;
    const baseline = valid[0] ?? null;

    let changePct: number | null = null;
    if (current && baseline && baseline.total > 0 && valid.length > 1) {
      changePct = ((current.total - baseline.total) / baseline.total) * 100;
    }

    // Latest row across all days (the most recent digest)
    const latestRow = sortedDays[sortedDays.length - 1][1];
    const latestNotification = latestRow.notification;

    out.push({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      current_total: current?.total ?? null,
      change_pct_7d: changePct,
      trend_arrow: arrowFor(changePct),
      trajectory,
      breakdown: parseBreakdown(latestNotification.body || ''),
      action_url: latestNotification.action_config?.url ?? null,
      latest_notification_id: latestNotification.id,
      latest_user_notification_id: latestRow.id,
      latest_at: latestRow.created_at
    });
  }

  // Sort categories by current total descending (largest signals first).
  out.sort((a, b) => (b.current_total ?? 0) - (a.current_total ?? 0));

  return out;
}
