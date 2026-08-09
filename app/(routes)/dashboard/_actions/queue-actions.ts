/**
 * Dashboard v2 — Decision Queue Server Actions
 * All exports here are Server Actions (per Next.js 'use server' contract).
 *
 * Called from <form action={...}> in decision-queue-item.tsx.
 * Idempotency: each action carries an idempotency_key = `${user_notification_id}:${action}`
 * to survive double-submits (Round 4.15 decision).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.2, §7.2
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type QueueAction =
  | 'approve'
  | 'reject'
  | 'delegate'
  | 'snooze'
  | 'acknowledge'
  | 'false_alarm';

export type QueueActionResult = {
  ok: boolean;
  action?: QueueAction;
  idempotent?: boolean;
  acknowledged_at?: string;
  resumes_at?: string;
  delegated_to?: string;
  error?: string;
};

/**
 * Perform an inline action on a queue item via fn_dashboard_queue_action RPC.
 * Form submission → Server Action → RPC → revalidate dashboard path.
 */
export async function performQueueAction(formData: FormData): Promise<void> {
  const userNotificationId = String(formData.get('userNotificationId') ?? '');
  const action = String(formData.get('action') ?? '') as QueueAction;
  const note = (formData.get('note') as string) || null;
  const delegateTo = (formData.get('delegateTo') as string) || null;
  const snoozeMinutesRaw = formData.get('snoozeMinutes') as string | null;
  const snoozeMinutes = snoozeMinutesRaw ? parseInt(snoozeMinutesRaw, 10) : null;
  const idempotencyKey =
    (formData.get('idempotencyKey') as string) ||
    `${userNotificationId}:${action}`;

  if (!userNotificationId || !action) {
    console.warn('[dashboard/queue-action] missing params', {
      userNotificationId,
      action
    });
    return;
  }

  // 2026-08-09 — group dismissal.
  // The queue collapses repeated daily digest rows into one card, so a single
  // card can stand for N user_notification rows. fn_dashboard_queue_action
  // resolves exactly one row per call, so acting on the visible card used to
  // clear only the newest run and the next-oldest immediately took its place —
  // the card looked like it refused to go away. The optional
  // `userNotificationIds` field carries every row the card represents; we
  // apply the same action to each. Deliberately NOT solved by changing the
  // Postgres function: that is a production database change and is out of
  // scope here.
  //
  // Order matters: the visible row goes first so its outcome is what the
  // reader sees even if a later call fails. Sequential, not Promise.all — a
  // burst of concurrent writes against the same person's notification rows
  // buys nothing and risks lock contention. The list is bounded by the queue
  // page size (listQueueItems limit = 50).
  const groupRaw = String(formData.get('userNotificationIds') ?? '');
  const groupIds = groupRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const targets =
    groupIds.length > 0
      ? [userNotificationId, ...groupIds.filter((id) => id !== userNotificationId)]
      : [userNotificationId];

  try {
    const supabase = await createClient();
    let applied = 0;

    for (const target of targets) {
      // A grouped run needs a distinct key per row — reusing the visible
      // card's key would make every follow-up call look like a replay of the
      // first and be swallowed by the idempotency guard.
      const key =
        targets.length === 1 ? idempotencyKey : `${target}:${action}`;
      const { data, error } = await supabase.rpc('fn_dashboard_queue_action', {
        p_user_notification_id: target,
        p_action: action,
        p_note: note,
        p_delegate_to: delegateTo,
        p_snooze_minutes: snoozeMinutes,
        p_idempotency_key: key
      });

      if (error) {
        console.error('[dashboard/queue-action] RPC error:', {
          target,
          action,
          error
        });
        // First row failing is the one the reader acted on — stop and let the
        // page re-render unchanged rather than half-clearing the group.
        if (applied === 0) return;
        break;
      }

      applied += 1;
      console.log('[dashboard/queue-action] completed', {
        userNotificationId: target,
        action,
        result: data
      });
    }

    if (applied > 1) {
      console.log('[dashboard/queue-action] group applied', {
        action,
        requested: targets.length,
        applied
      });
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/i/[instId]', 'page');
  } catch (err) {
    console.error('[dashboard/queue-action] unexpected error:', err);
  }
}
