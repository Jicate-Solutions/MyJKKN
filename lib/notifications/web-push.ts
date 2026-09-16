/**
 * lib/notifications/web-push.ts
 *
 * The web-push delivery step of the admin "Send Notification" flow
 * (/notifications/admin/new → POST /api/notifications/send), lifted out of the
 * route so other server-side senders (CDC drive willingness, …) deliver push
 * through the SAME implementation instead of a copy.
 *
 * Contract is unchanged from the route:
 *   - VAPID keys missing → no-op (returns the empty result, never throws)
 *   - service-role client (push_subscriptions RLS is own-rows only)
 *   - opt-out gate via filterPushRecipients() BEFORE reading subscriptions
 *   - 410 / 404 from the push service → stale subscription row deleted
 *
 * Pair with lib/services/_shared/notifications/notify.ts (fanoutNotification)
 * for the bell/inbox rows; this file only sends push.
 */

import webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { filterPushRecipients } from '@/lib/push/opt-out';

// Configure web-push with VAPID keys (module-level, once per server process).
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export interface PushDeliveryDetail {
  user_id: string;
  email: string;
  role: string;
  status: 'delivered' | 'failed' | 'stale_removed';
  error?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  total_subscriptions: number;
  details: PushDeliveryDetail[];
}

/** The subset of a `notifications` row the push payload is built from. */
export interface PushNotificationSource {
  id: string;
  title: string;
  body?: string | null;
  icon?: string | null;
  url?: string | null;
  priority?: string | null;
  created_at?: string | null;
  requires_acknowledgment?: boolean | null;
  action_type?: string | null;
}

/** Strip HTML from a notification body for the plain-text push payload. */
export function pushPlainBody(body: string | null | undefined): string {
  return (body || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendWebPushNotifications(
  userIds: string[],
  notification: PushNotificationSource
): Promise<PushResult> {
  const emptyResult: PushResult = { sent: 0, failed: 0, total_subscriptions: 0, details: [] };

  try {
    // Check if VAPID keys are configured
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured - skipping push notifications');
      return emptyResult;
    }
    if (!userIds || userIds.length === 0) return emptyResult;

    // Use service role client to bypass RLS — the "push_subscriptions_own" policy
    // only allows users to read their OWN subscriptions, so an admin's auth context
    // would return 0 rows when querying other users' subscriptions.
    const serviceClient = createServiceRoleClient();

    // Drop anyone who switched push off before looking up any subscription.
    // is_active alone cannot carry that answer: unsubscribing destroys the
    // browser endpoint, so the next page load mints a NEW row that is
    // is_active=true and passes the filter below perfectly.
    const pushUserIds = await filterPushRecipients(serviceClient, userIds);
    if (pushUserIds.length === 0) {
      return emptyResult;
    }

    // Get push subscriptions for target users along with profile info.
    const { data: subscriptions, error: subError } = await serviceClient
      .from('push_subscriptions')
      .select('id, subscription, user_id, profiles!inner(email, role)')
      .in('user_id', pushUserIds)
      .eq('is_active', true);

    if (subError) {
      console.error('Error fetching push subscriptions:', subError);
      return emptyResult;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for target users');
      return emptyResult;
    }

    const plainBody = pushPlainBody(notification.body);

    const requiresAck = notification.requires_acknowledgment || false;
    const isAction = notification.action_type != null;
    const pushPayload = JSON.stringify({
      title: isAction
        ? `⚡ ACTION REQUIRED: ${notification.title}`
        : requiresAck
          ? `⚠️ ACKNOWLEDGE: ${notification.title}`
          : notification.title,
      body: isAction
        ? `${plainBody}\n\nTap to submit your response`
        : requiresAck
          ? `${plainBody}\n\nTap to acknowledge (mandatory)`
          : plainBody,
      icon: notification.icon || '/icons/icon-192x192.png',
      url: notification.url || '/notifications',
      requireInteraction: requiresAck,
      data: {
        notification_id: notification.id,
        priority: notification.priority,
        requires_acknowledgment: requiresAck,
        created_at: notification.created_at
      }
    });

    let sent = 0;
    let failed = 0;
    const details: PushDeliveryDetail[] = [];

    // Send push notifications in parallel
    const pushPromises = subscriptions.map(async (sub: any) => {
      const profile = sub.profiles || {};
      const email = profile.email || 'unknown';
      const role = profile.role || 'unknown';
      const endpointShort = sub.subscription?.endpoint
        ? sub.subscription.endpoint.slice(-20)
        : 'unknown';
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
        sent++;
        details.push({ user_id: sub.user_id, email, role, status: 'delivered' });
        console.log(
          `[Push OK] ${email} (${role}) endpoint=...${endpointShort}`
        );
      } catch (error: any) {
        failed++;
        const errorMsg = `${error.statusCode || 'N/A'}: ${error.message || 'unknown'}`;
        // Remove expired/invalid subscriptions (410 Gone or 404 Not Found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          details.push({ user_id: sub.user_id, email, role, status: 'stale_removed', error: errorMsg });
          console.log(
            `[Push CLEANUP] ${email} (${role}) — stale subscription removed (${error.statusCode})`
          );
          await serviceClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        } else {
          details.push({ user_id: sub.user_id, email, role, status: 'failed', error: errorMsg });
          console.error(
            `[Push FAIL] ${email} (${role}) endpoint=...${endpointShort} ${errorMsg}`
          );
        }
      }
    });

    await Promise.allSettled(pushPromises);
    // Single summary line with all results for easy log searching
    console.log(
      `[Push Summary] ${sent}/${subscriptions.length} delivered | ${details.map(d => `${d.email}:${d.status}`).join(', ')}`
    );

    return { sent, failed, total_subscriptions: subscriptions.length, details };
  } catch (error) {
    console.error('Error in sendWebPushNotifications:', error);
    return emptyResult;
  }
}
