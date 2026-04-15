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

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_dashboard_queue_action', {
      p_user_notification_id: userNotificationId,
      p_action: action,
      p_note: note,
      p_delegate_to: delegateTo,
      p_snooze_minutes: snoozeMinutes,
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      console.error('[dashboard/queue-action] RPC error:', error);
      return;
    }

    console.log('[dashboard/queue-action] completed', {
      userNotificationId,
      action,
      result: data
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/i/[instId]', 'page');
  } catch (err) {
    console.error('[dashboard/queue-action] unexpected error:', err);
  }
}
