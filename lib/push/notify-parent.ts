/**
 * Parent Portal — Web Push sender (server).
 *
 * Writes a pp_notifications_log row (so the in-app Notifications center always
 * has the record) and pushes to every registered pp_devices subscription for the
 * parent. Reuses the SAME VAPID env + payload shape the shared service worker
 * (app/sw.ts) already understands — no changes to the app-wide SW.
 *
 * Dead subscriptions (404/410) are pruned. Sending degrades gracefully: if VAPID
 * isn't configured, the log row is still written and push is skipped.
 *
 * Node runtime only (service-role client + web-push).
 */
import * as webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:director@jkkn.ac.in';

let vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
  } catch (e) {
    console.error('[notify-parent] VAPID setup failed:', e);
  }
}

export interface NotifyParentInput {
  parentAccountId: string;
  institutionsId: string; // pp_notifications_log.institutions_id is NOT NULL
  title: string;
  body?: string;
  category?: string;
  actionUrl?: string;
  learnerProfileId?: string;
}

export interface NotifyParentResult {
  logged: boolean;
  sent: number;
  pruned: number;
}

export async function notifyParent(input: NotifyParentInput): Promise<NotifyParentResult> {
  const db = createServiceRoleClient();

  // 1. Always record it (the Notifications center reads this).
  const { data: logRow } = await db
    .from('pp_notifications_log')
    .insert({
      institutions_id: input.institutionsId,
      parent_account_id: input.parentAccountId,
      learner_profile_id: input.learnerProfileId ?? null,
      title: input.title,
      body: input.body ?? null,
      category: input.category ?? null,
      action_url: input.actionUrl ?? null,
      channels: ['push'],
    })
    .select('id')
    .single();

  const result: NotifyParentResult = { logged: !!logRow, sent: 0, pruned: 0 };
  if (!vapidReady) return result; // log written; push skipped until VAPID set

  // 2. Push to every device.
  const { data: devices } = await db
    .from('pp_devices')
    .select('id, endpoint, p256dh, auth')
    .eq('parent_account_id', input.parentAccountId);
  if (!devices?.length) return result;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? '',
    url: input.actionUrl || '/parent/notifications',
    data: { notification_id: logRow?.id, category: input.category },
  });

  const dead: string[] = [];
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          payload
        );
        result.sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(d.id); // gone — prune
      }
    })
  );

  if (dead.length) {
    await db.from('pp_devices').delete().in('id', dead);
    result.pruned = dead.length;
  }
  return result;
}
