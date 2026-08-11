// =====================================================================
// AI Pulse — Domain Starter learner notification cron.
// =====================================================================
// Once the generation cron has authored this cycle's copy-paste starter
// PACKS (app/api/cron/aipulse-domain-starter/route.ts — do NOT edit), this
// route fires ONE "your AI starter prompt is ready" bell notification per
// attending learner, deep-linking them to My Pulse where the prompt shows.
//
// DARK until the kill switch domain_starter_enabled flips true
// (ai_pulse_policies). Off → no learner impact.
//
// TARGETING: fn_ai_pulse_domain_starter_notify_targets(cycle) already returns
// ONE row per learner (GROUP BY profile_id) with their FINEST topic_label
// (a course label preferred over the programme). We defensively dedup on
// profile_id anyway.
//
// DELIVERY SHAPE (the bell-correct pattern — mirrors
// app/api/cron/ai-pulse-weekly-digest/route.ts):
//   The bell reads `user_notifications !inner notifications` filtered by
//   user_id (see lib/services/notification/notification-service.ts
//   getNotifications). A notifications row with targeting.user_ids alone
//   never surfaces. So for each recipient we insert:
//     1. one notifications row (live schema: created_by NOT NULL,
//        body NOT NULL, targeting JSONB NOT NULL, category, kind, title)
//     2. one user_notifications LINK row (notification_id + user_id)
//   created_by is the recipient themselves (per-user cron card, matching
//   friday-reflection + the weekly digest).
//
//     3. one web push to that learner's active devices, so the announcement
//        reaches the phone and not only the bell (2026-08-06).
//
// IDEMPOTENCY
//   notifications.idempotency_key = ai_pulse_domain_starter_notify:<cycleId>:<userId>.
//   Re-firing on the same cycle is a safe per-recipient no-op — for the phone
//   push as much as for the bell, because the push is only reached on the
//   sweep that actually inserts the rows. Load-bearing: this route sweeps
//   repeatedly within its window.
//
// AUTH
//   CRON_SECRET via Authorization: Bearer ... OR ?secret= — identical to
//   app/api/cron/aipulse-domain-starter/route.ts.
// Created: 2026-07-20.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import webpush from 'web-push';
import {
  cycleNotificationExpiresAt,
  type AiPulseCycleRow,
} from '@/lib/services/ai-pulse/cycle-window';

const ENABLED_KEY = 'domain_starter_enabled';
const MY_PULSE_URL = '/ai-pulse/my-pulse';
/** Cycles read so the cycle LENGTH can be measured, matching the weekly digest. */
const CYCLE_WINDOW = 8;

// Web push uses the SAME cron-usable mechanism as
// app/api/cron/sunday-wrap/route.ts: sign with VAPID here and post straight
// to the endpoint. Deliberately NOT the DB trigger path
// (trg_notify_push_on_queue_insert -> fn_trigger_push_send -> pg_net ->
// /api/dashboard/push-send): that function returns early unless
// app.push_send_endpoint + app.service_role_key are set as database settings,
// and neither is configured on this project, so it is a silent no-op.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:director@jkkn.ac.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

type Admin = ReturnType<typeof createServiceRoleClient>;

type NotifyTarget = {
  profile_id: string;
  topic_label: string | null;
};

type PushSubRow = {
  id: string;
  subscription: { endpoint: string; keys?: { p256dh: string; auth: string } } | null;
  failure_count: number | null;
};

// Fail-safe config read (mirrors the generation route's readPolicy).
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return (data as { value_jsonb?: unknown } | null)?.value_jsonb ?? null;
  } catch {
    return null;
  }
}

// Best-effort phone delivery for ONE recipient, called only after that
// recipient's bell rows are already committed. Never throws: a push problem
// must not cost a learner their in-app notification.
//
// Subscription hygiene follows app/api/dashboard/push-send/route.ts rather
// than sunday-wrap: only is_active rows are pushed (is_active=false is how
// app/api/dashboard/push-subscribe/route.ts records an UNSUBSCRIBE, so
// ignoring it would buzz people who opted out), and a dead endpoint is
// soft-deactivated instead of hard-deleted.
async function sendStarterPush(
  admin: Admin,
  userId: string,
  payload: { title: string; body: string; url: string; icon: string; data: Record<string, unknown> },
): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return 0;

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, subscription, failure_count')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error || !subs?.length) return 0;

  const serialized = JSON.stringify(payload);
  let sent = 0;

  await Promise.allSettled(
    (subs as unknown as PushSubRow[]).map(async (row) => {
      const sub = row.subscription;
      if (!sub?.endpoint || !sub.keys) return;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, serialized);
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const now = new Date().toISOString();
        // 404/410 => the browser dropped this subscription for good.
        await admin
          .from('push_subscriptions')
          .update({
            ...(statusCode === 404 || statusCode === 410 ? { is_active: false } : {}),
            last_failed_at: now,
            failure_count: (row.failure_count ?? 0) + 1,
            updated_at: now,
          } as never)
          .eq('id', row.id);
      }
    }),
  );

  return sent;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  // Kill switch. DARK until an admin flips domain_starter_enabled = true.
  const enabled = (await readPolicy(admin, ENABLED_KEY)) === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, note: 'domain starter loop is off (dark)' });
  }

  // Resolve the cycle: ?cycle=<uuid> override, else the latest ai_pulse cycle.
  // A WINDOW (not one row) is read so the cycle's own length can be measured
  // from the spacing of its neighbours — see lib/services/ai-pulse/cycle-window.
  const { data: cyclesRaw } = await admin
    .from('startup_events')
    .select('id, demo_date, config')
    .eq('config->>kind', 'ai_pulse')
    .neq('status', 'cancelled')
    .order('demo_date', { ascending: false, nullsFirst: false })
    .limit(CYCLE_WINDOW);
  const cycleRows = ((cyclesRaw ?? []) as AiPulseCycleRow[]);

  let cycleId = request.nextUrl.searchParams.get('cycle');
  if (!cycleId) cycleId = cycleRows[0]?.id ?? null;
  if (!cycleId) {
    return NextResponse.json({ ok: true, enabled: true, cycle_id: null, notified: 0, skipped: 0, note: 'no ai_pulse cycle found' });
  }

  // The ?cycle= override can point outside the window (replaying an old cycle
  // by hand); fetch that one row so its TTL is still cycle-derived.
  let cycle = cycleRows.find((c) => c.id === cycleId) ?? null;
  if (!cycle) {
    const { data: one } = await admin
      .from('startup_events')
      .select('id, demo_date, config')
      .eq('id', cycleId)
      .maybeSingle();
    cycle = (one as AiPulseCycleRow | null) ?? null;
  }

  // TTL. Honoured by liveNotificationOrFilter() in the bell / inbox / rollup
  // read path; null (no usable demo_date) keeps today's never-expires
  // behaviour rather than guessing an hour count. The window always contains
  // the chosen cycle, so a hand-replayed old cycle still gets a successor.
  const cycleWindow: AiPulseCycleRow[] =
    cycle && !cycleRows.some((c) => c.id === cycle.id)
      ? [...cycleRows, cycle]
      : cycleRows;
  const expiresAt = cycleNotificationExpiresAt(cycle, cycleWindow);

  // Recipients: one row per attending learner with a generated starter.
  const { data: targets, error: targErr } = await admin.rpc(
    'fn_ai_pulse_domain_starter_notify_targets',
    { p_cycle_id: cycleId },
  );
  if (targErr) {
    console.error('[cron/aipulse-domain-starter-notify] targets failed:', targErr.message);
    return NextResponse.json({ ok: false, enabled: true, cycle_id: cycleId, error: targErr.message }, { status: 500 });
  }

  // Defensive dedup on profile_id (the fn already groups, but re-firing the
  // idempotency key is the real guard against double-notify).
  const byProfile = new Map<string, string | null>();
  for (const row of (targets as NotifyTarget[] | null) ?? []) {
    if (row?.profile_id && !byProfile.has(row.profile_id)) {
      byProfile.set(row.profile_id, row.topic_label ?? null);
    }
  }

  let notified = 0;
  let skipped = 0;
  let pushed = 0;
  const errors: string[] = [];

  for (const [userId, topicLabel] of byProfile) {
    const idempotency_key = `ai_pulse_domain_starter_notify:${cycleId}:${userId}`;

    // Idempotency check against the notifications table.
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempotency_key)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const label = (topicLabel ?? '').trim();
    const body = label
      ? `Your ready-to-use AI starter prompt for ${label} is ready. Open My Pulse to copy it and start building this week.`
      : 'Your ready-to-use AI starter prompt is ready. Open My Pulse to copy it and start building this week.';

    const { data: notification, error: notifErr } = await admin
      .from('notifications')
      .insert({
        title: 'Your AI starter prompt is ready',
        body,
        url: MY_PULSE_URL,
        icon: '/icons/icon-192x192.png',
        created_by: userId,
        targeting: { user_ids: [userId] },
        priority: 'normal',
        category: 'ai_pulse',
        // work_item keeps cron-emitted reminders out of the
        // /notifications/admin announcement surface (kind='announcement').
        kind: 'work_item',
        idempotency_key,
        // Derived from THIS cycle's end, never a literal — the starter prompt
        // this announces is superseded when the next cycle's prompt lands.
        expires_at: expiresAt,
        metadata: {
          source: 'ai_pulse_domain_starter_notify',
          cycle_id: cycleId,
          topic_label: label || null,
        },
      })
      .select('id')
      .single();

    if (notifErr || !notification) {
      errors.push(`${userId}: ${notifErr?.message ?? 'insert failed'}`);
      skipped++;
      continue;
    }

    // The bell reads `user_notifications !inner notifications` — the link
    // row is what surfaces the card.
    const { error: linkErr } = await admin
      .from('user_notifications')
      .insert({ notification_id: notification.id, user_id: userId });
    if (linkErr) {
      errors.push(`${userId} link: ${linkErr.message}`);
      skipped++;
      continue;
    }

    notified++;

    // Phone push. Deliberately AFTER the bell rows are committed and wrapped
    // so nothing here can prevent or undo them.
    //
    // IDEMPOTENCY — the guarantee is EXACTLY-ONCE PER LEARNER PER CYCLE,
    // which is what keeps an hourly sweep from buzzing anyone repeatedly.
    // This line is only reachable on the sweep that actually created the
    // notification: the idempotency_key lookup above `continue`s for anyone
    // already notified this cycle, and a concurrent racer that slips past
    // the lookup still fails the insert against the UNIQUE index
    // idx_notifications_idempotency and `continue`s at the notifErr guard.
    // Both exits happen before this point, so the push cannot double-fire.
    //
    // Note this is NOT "later sweeps send nothing" — a later sweep DOES push
    // learners whose starter was generated in the meantime. That is the
    // point of sweeping hourly. Those are first-time sends, never repeats.
    try {
      pushed += await sendStarterPush(admin, userId, {
        title: 'Your AI starter prompt is ready',
        body,
        url: MY_PULSE_URL,
        icon: '/icons/icon-192x192.png',
        data: {
          notification_id: notification.id,
          type: 'ai_pulse_domain_starter',
          cycle_id: cycleId,
        },
      });
    } catch (err) {
      errors.push(`${userId} push: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    cycle_id: cycleId,
    notified,
    skipped,
    pushed,
    ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
    elapsed_ms: Date.now() - started,
  });
}
