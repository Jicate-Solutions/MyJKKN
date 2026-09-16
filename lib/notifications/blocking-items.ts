import type { UnacknowledgedNotification } from '@/types/notifications';

/**
 * One mapping for the blocking queue, shared by GET /api/notifications/pulse
 * (what the gate polls) and GET /api/notifications/acknowledge (its older
 * twin). Both used to derive deadline_at / is_overdue inline; now they call
 * this so the two can never drift.
 *
 * Rows come from get_blocking_items(p_user_id) (migration 20260916090200):
 *   kind 'ack'          — field names unchanged from get_unacknowledged_notifications
 *   kind 'answer'       — plus answer_options
 *   kind 'bug_feedback' — plus request_id / bug_id / display_id / snooze_count
 */
export const BUG_FEEDBACK_MAX_SNOOZES = 3;

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

    const deadlineMs = (item.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000;
    const deadlineAt = new Date(sentAt.getTime() + deadlineMs);

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
      is_overdue: now > deadlineAt,
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
