/**
 * Dashboard v2 — Push send endpoint
 *
 * POST /api/dashboard/push-send
 * Body: { userNotificationId: string }
 *
 * Auth: service-role bearer token OR authenticated session.
 *  - Service-role bearer = `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (used by DB trigger via pg_net)
 *  - Session auth = cookie-based (for manual admin re-send)
 *
 * Flow:
 *  1. Load user_notification + joined notification.
 *  2. Fetch active push_subscriptions for that user.
 *  3. For each, sendNotification() via web-push.
 *  4. On 404/410 Gone → mark is_active=false + increment failure_count.
 *  5. Return { sent, failed, deactivated }.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.4, §6.2, decision Round 3.12
 */

import { NextRequest, NextResponse } from 'next/server';
import * as webpush from 'web-push';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Configure web-push with VAPID details once on module load.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:director@jkkn.ac.in';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.error('[push-send] VAPID setup failed:', e);
  }
}

type SendOutcome = {
  sent: number;
  failed: number;
  deactivated: number;
  errors: Array<{ endpoint: string; statusCode?: number; message: string }>;
};

interface PushSubRow {
  id: string;
  subscription: {
    endpoint: string;
    keys?: { p256dh: string; auth: string };
  };
  failure_count: number | null;
}

interface NotifRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  priority: string | null;
  category: string | null;
}

export async function POST(req: NextRequest) {
  try {
    // VAPID config guard — without keys we cannot sign anything.
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { ok: false, error: 'vapid_not_configured' },
        { status: 500 }
      );
    }

    // --- Auth: service-role bearer OR authenticated session ---
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isServiceRoleCaller =
      !!serviceRoleKey &&
      !!bearerToken &&
      bearerToken === serviceRoleKey;

    let supabase;
    if (isServiceRoleCaller) {
      supabase = createServiceRoleClient();
    } else {
      supabase = await createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { ok: false, error: 'not_authenticated' },
          { status: 401 }
        );
      }
    }

    // --- Parse body ---
    const body = await req.json().catch(() => ({}));
    const userNotificationId = body?.userNotificationId as string | undefined;

    if (!userNotificationId || typeof userNotificationId !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'missing_userNotificationId' },
        { status: 400 }
      );
    }

    // --- Load user_notification → notification ---
    const { data: un, error: unErr } = await supabase
      .from('user_notifications')
      .select('id, user_id, notification_id')
      .eq('id', userNotificationId)
      .maybeSingle();

    if (unErr) {
      console.error('[push-send] user_notifications lookup error:', unErr);
      return NextResponse.json(
        { ok: false, error: 'user_notifications_lookup_failed' },
        { status: 500 }
      );
    }
    if (!un) {
      return NextResponse.json(
        { ok: false, error: 'user_notification_not_found', userNotificationId },
        { status: 404 }
      );
    }

    const { data: notifRaw, error: notifErr } = await supabase
      .from('notifications')
      .select('id, title, body, url, priority, category')
      .eq('id', un.notification_id)
      .maybeSingle();

    const notif = notifRaw as NotifRow | null;

    if (notifErr || !notif) {
      console.error('[push-send] notifications lookup error:', notifErr);
      return NextResponse.json(
        { ok: false, error: 'notification_not_found' },
        { status: 404 }
      );
    }

    // --- Fetch active subscriptions for that user ---
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, subscription, failure_count')
      .eq('user_id', un.user_id)
      .eq('is_active', true);

    if (subsErr) {
      console.error('[push-send] push_subscriptions lookup error:', subsErr);
      return NextResponse.json(
        { ok: false, error: 'push_subs_lookup_failed' },
        { status: 500 }
      );
    }

    const subscriptions = (subs ?? []) as unknown as PushSubRow[];

    if (subscriptions.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        failed: 0,
        deactivated: 0,
        reason: 'no_active_subscriptions'
      });
    }

    // --- Build payload ---
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body,
      url: notif.url || '/dashboard',
      tag: 'dashboard-queue',
      priority: notif.priority || 'normal',
      userNotificationId
    });

    const outcome: SendOutcome = {
      sent: 0,
      failed: 0,
      deactivated: 0,
      errors: []
    };

    // --- Fire pushes in parallel (subs are independent) ---
    await Promise.all(
      subscriptions.map(async (row) => {
        const sub = row.subscription;
        if (!sub || !sub.endpoint || !sub.keys) {
          outcome.failed += 1;
          outcome.errors.push({
            endpoint: sub?.endpoint || '(unknown)',
            message: 'subscription_malformed'
          });
          return;
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            payload
          );
          outcome.sent += 1;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          const message =
            err instanceof Error ? err.message : String(err);

          outcome.failed += 1;
          outcome.errors.push({
            endpoint: sub.endpoint,
            statusCode,
            message
          });

          // 404 Not Found or 410 Gone → subscription expired. Soft-delete.
          if (statusCode === 404 || statusCode === 410) {
            const { error: updErr } = await supabase
              .from('push_subscriptions')
              .update({
                is_active: false,
                last_failed_at: new Date().toISOString(),
                failure_count: (row.failure_count ?? 0) + 1,
                updated_at: new Date().toISOString()
              } as never)
              .eq('id', row.id);

            if (!updErr) outcome.deactivated += 1;
            else
              console.error(
                '[push-send] failed to deactivate stale subscription:',
                updErr
              );
          } else {
            // Non-terminal error — just bump failure_count.
            await supabase
              .from('push_subscriptions')
              .update({
                last_failed_at: new Date().toISOString(),
                failure_count: (row.failure_count ?? 0) + 1,
                updated_at: new Date().toISOString()
              } as never)
              .eq('id', row.id);
          }
        }
      })
    );

    return NextResponse.json({
      ok: true,
      sent: outcome.sent,
      failed: outcome.failed,
      deactivated: outcome.deactivated,
      errors: outcome.errors.length > 0 ? outcome.errors : undefined
    });
  } catch (err) {
    console.error('[push-send] unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
