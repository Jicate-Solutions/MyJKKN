import type { UnacknowledgedNotification } from '@/types/notifications';

/**
 * One mapping for the blocking queue, shared by GET /api/notifications/pulse
 * (what the gate polls) and GET /api/notifications/acknowledge (its older
 * twin). Both used to derive deadline_at / is_overdue inline; now they call
 * this so the two can never drift.
 *
 * Rows come from get_blocking_items(p_user_id) (migration 20261227090200):
 *   kind 'ack'          — field names unchanged from get_unacknowledged_notifications
 *   kind 'answer'       — plus answer_options
 *   kind 'bug_feedback' — plus request_id / bug_id / display_id / snooze_count
 */
export const BUG_FEEDBACK_MAX_SNOOZES = 3;

/**
 * Codes that mean "this deploy is ahead of its migrations", not "the database
 * is broken" (blind-critic gap 4, 2026-09-18).
 *
 * The ship wave merges code and applies migrations in separate rounds, so for
 * a window of minutes to hours the built app calls get_blocking_items against
 * a database that has never heard of it. Postgres answers 42883
 * (undefined_function), or 42703 (undefined_column) when only part of
 * migration A is there; PostgREST answers PGRST202/PGRST204 from its schema
 * cache without reaching Postgres at all.
 *
 * Before this, each of those became an HTTP 500 from
 * /api/notifications/pulse — which the gate polls on every signed-in page
 * every 60 s — so the whole app would have shown the gate's error state until
 * the migrations landed.
 */
const MISSING_SCHEMA_CODES = new Set(['42883', '42703', 'PGRST202', 'PGRST204']);

export function isMissingBlockingSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && MISSING_SCHEMA_CODES.has(e.code)) return true;
  // PostgREST does not always set `code`; its message names the missing object.
  const message = typeof e.message === 'string' ? e.message : '';
  return /could not find the function|schema cache|does not exist/i.test(message);
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type BlockingItemsResult =
  | { items: UnacknowledgedNotification[]; degraded: boolean; error: null }
  | { items: null; degraded: false; error: any };

/**
 * The one read of the blocking queue, shared by the pulse route and the older
 * acknowledge route. On a missing-schema error it degrades instead of failing:
 * first to get_unacknowledged_notifications, which predates this PR, so
 * mandatory acknowledgments keep blocking while the two new kinds simply do
 * not appear; and if that is gone too, to an empty queue. Both steps warn.
 *
 * Any other error comes back untouched — a real fault still answers 500.
 */
export async function fetchBlockingItems(
  client: RpcClient,
  userId: string,
  now: Date = new Date()
): Promise<BlockingItemsResult> {
  const { data, error } = await client.rpc('get_blocking_items', { p_user_id: userId });
  if (!error) return { items: mapBlockingItems(data, now), degraded: false, error: null };
  if (!isMissingBlockingSchema(error)) return { items: null, degraded: false, error };

  console.warn(
    '[notifications] get_blocking_items is not on this database yet (migrations pending); ' +
      'falling back to get_unacknowledged_notifications.',
    { code: error?.code, message: error?.message }
  );

  const fallback = await client.rpc('get_unacknowledged_notifications', { p_user_id: userId });
  if (fallback.error) {
    // Only a MISSING fallback is an empty queue. A permission error or a timeout
    // on the fallback is a real fault and must still answer 500 — otherwise
    // mandatory notices could silently stop blocking (critic round 2).
    if (!isMissingBlockingSchema(fallback.error)) {
      return { items: null, degraded: true, error: fallback.error };
    }
    console.warn(
      '[notifications] get_unacknowledged_notifications is unavailable too; serving no blocking items.',
      { code: fallback.error?.code, message: fallback.error?.message }
    );
    return { items: [], degraded: true, error: null };
  }
  return { items: mapBlockingItems(fallback.data, now), degraded: true, error: null };
}

export function mapBlockingItems(
  rows: any[] | null | undefined,
  now: Date = new Date()
): UnacknowledgedNotification[] {
  return (rows || []).map((item: any) => {
    const kind: UnacknowledgedNotification['kind'] =
      item.kind === 'answer' || item.kind === 'bug_feedback' ? item.kind : 'ack';
    const sentAt = new Date(item.sent_at || item.created_at);

    if (kind === 'bug_feedback') {
      // Ruling 3: the question stays open until expires_at (fix live + 60 d).
      // It is never "overdue" — a reporter is asked, not chased.
      const snoozeCount = Number(item.snooze_count ?? 0);
      return {
        kind,
        id: item.id,
        notification_id: item.notification_id,
        title: item.title,
        body: item.body,
        priority: item.priority || 'normal',
        category: item.category,
        url: item.url,
        created_by_name: item.created_by_name || 'MyJKKN bug fixes',
        sent_at: item.sent_at || item.created_at,
        deadline_at: item.expires_at,
        is_overdue: false,
        metadata: item.metadata,
        request_id: item.request_id,
        bug_id: item.bug_id,
        display_id: item.display_id,
        snooze_count: snoozeCount,
        can_snooze: snoozeCount < BUG_FEEDBACK_MAX_SNOOZES
      };
    }

    // A must-answer notice (kind 'answer') has no acknowledgment deadline unless
    // the sender set one; its only clock is expires_at (deep review #9). Without
    // this it inherited the 4-hour ack default and every answer item rendered
    // OVERDUE four hours after send.
    const hasAckClock = kind === 'ack' || item.acknowledgment_deadline_hours != null;
    const deadlineAt = hasAckClock
      ? new Date(sentAt.getTime() + (item.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000)
      : item.expires_at
        ? new Date(item.expires_at)
        : new Date(sentAt.getTime() + 4 * 60 * 60 * 1000); // display only: never overdue (below)
    const isOverdue = hasAckClock || item.expires_at ? now > deadlineAt : false;

    const base: UnacknowledgedNotification = {
      kind,
      id: item.id,
      notification_id: item.notification_id,
      title: item.title,
      body: item.body,
      priority: item.priority,
      category: item.category,
      url: item.url,
      created_by_name: item.created_by_name || 'System',
      sent_at: item.sent_at || item.created_at,
      deadline_at: deadlineAt.toISOString(),
      is_overdue: isOverdue,
      metadata: item.metadata
    };
    if (kind === 'answer') {
      base.answer_options = Array.isArray(item.answer_options)
        ? item.answer_options.map((o: unknown) => String(o))
        : [];
    }
    return base;
  });
}

/**
 * The notification detail page lists who read a notice. For a must-answer
 * notice a super admin also needs to see which option each person picked
 * (critic round 2, DM-3). `answers` are the notification_answers rows for
 * that notice; every reader row gains `answer` (null when they have not
 * answered), nothing else about the analytics payload changes.
 */
export function attachAnswersToReaders<T extends { recent_readers?: any[] | null }>(
  analytics: T,
  answers: Array<{ user_id: string; answer: string }> | null | undefined
): T {
  if (!analytics || !Array.isArray(analytics.recent_readers)) return analytics;
  const byUser = new Map((answers || []).map((a) => [String(a.user_id), a.answer]));
  return {
    ...analytics,
    recent_readers: analytics.recent_readers.map((r: any) => ({
      ...r,
      answer: byUser.get(String(r.user_id)) ?? null
    }))
  };
}

