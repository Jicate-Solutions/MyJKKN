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
// PERFORMANCE (2026-08-07)
//   This route used to do ~4 sequential round-trips PER LEARNER: an
//   idempotency SELECT, the notifications INSERT, the link INSERT, and a
//   push_subscriptions SELECT. On the 2026-08-06 cycle that was ~1,300
//   round-trips for 321 learners and the run took 87 s. Measured that night:
//   the 19:30 IST sweep delivered nothing, a hand-fired call failed once
//   before succeeding, and FIVE consecutive hourly sweeps then delivered 0
//   while 40 more learners had become eligible. Work now batches:
//     1 paged scan of existing keys · chunked bell INSERTs (200/chunk,
//     per-row retry only on a failed chunk) · chunked link INSERTs ·
//     ONE subscription read for the whole run · pushes at fixed concurrency.
//   Round-trips go from O(4n) to O(n/200) plus the push waves.
//
//   Exactly-once per learner per cycle is UNCHANGED and still enforced by the
//   UNIQUE index idx_notifications_idempotency — the pre-scan is only a fast
//   path. A racer that slips past it loses the insert and is counted skipped,
//   never pushed. Note that index is PARTIAL (WHERE idempotency_key IS NOT
//   NULL), which is why this uses insert-with-fallback rather than an upsert:
//   Postgres cannot infer a partial index as an ON CONFLICT arbiter.
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

const ENABLED_KEY = 'domain_starter_enabled';
const MY_PULSE_URL = '/ai-pulse/my-pulse';

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

// How many rows go in one insert, and how many pushes fly at once. Both are
// bounded so a 500-learner cycle cannot build one enormous request or open
// 500 simultaneous sockets.
const DB_CHUNK = 200;
const PUSH_CONCURRENCY = 24;
const PAGE = 1000; // PostgREST's default page; we page explicitly rather than
                   // trusting a single unbounded select (it truncates silently).

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every idempotency key already recorded for this cycle, paged so a large
 *  cohort is never silently truncated to the first page. */
async function alreadyNotifiedKeys(admin: Admin, cycleId: string): Promise<Set<string>> {
  const prefix = `ai_pulse_domain_starter_notify:${cycleId}:`;
  const keys = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('notifications')
      .select('idempotency_key')
      .like('idempotency_key', `${prefix}%`)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`idempotency scan failed: ${error.message}`);
    const rows = (data ?? []) as { idempotency_key: string | null }[];
    for (const r of rows) if (r.idempotency_key) keys.add(r.idempotency_key);
    if (rows.length < PAGE) break;
  }
  return keys;
}

// Best-effort phone delivery, called only for recipients whose bell rows were
// just committed. Never throws: a push problem must not cost a learner their
// in-app notification.
//
// Subscription hygiene follows app/api/dashboard/push-send/route.ts rather
// than sunday-wrap: only is_active rows are pushed (is_active=false is how
// app/api/dashboard/push-subscribe/route.ts records an UNSUBSCRIBE, so
// ignoring it would buzz people who opted out), and a dead endpoint is
// soft-deactivated instead of hard-deleted.
//
// Subscriptions are fetched ONCE for the whole run rather than per learner.
async function fetchActiveSubs(
  admin: Admin,
  userIds: string[],
): Promise<Map<string, PushSubRow[]>> {
  const byUser = new Map<string, PushSubRow[]>();
  if (!userIds.length) return byUser;
  for (const ids of chunk(userIds, DB_CHUNK)) {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, user_id, subscription, failure_count')
      .in('user_id', ids)
      .eq('is_active', true);
    if (error) continue; // push is best-effort; the bell already landed
    for (const row of (data ?? []) as (PushSubRow & { user_id: string })[]) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row);
      byUser.set(row.user_id, list);
    }
  }
  return byUser;
}

async function pushOne(admin: Admin, row: PushSubRow, serialized: string): Promise<number> {
  const sub = row.subscription;
  if (!sub?.endpoint || !sub.keys) return 0;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, serialized);
    return 1;
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
    return 0;
  }
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
  let cycleId = request.nextUrl.searchParams.get('cycle');
  if (!cycleId) {
    const { data: cyc } = await admin
      .from('startup_events')
      .select('id, demo_date')
      .eq('config->>kind', 'ai_pulse')
      .neq('status', 'cancelled')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    cycleId = (cyc as { id?: string } | null)?.id ?? null;
  }
  if (!cycleId) {
    return NextResponse.json({ ok: true, enabled: true, cycle_id: null, notified: 0, skipped: 0, note: 'no ai_pulse cycle found' });
  }

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

  const errors: string[] = [];
  let notified = 0;
  let skipped = 0;
  let pushed = 0;

  const bodyFor = (topicLabel: string | null) => {
    const label = (topicLabel ?? '').trim();
    return label
      ? `Your ready-to-use AI starter prompt for ${label} is ready. Open My Pulse to copy it and start building this week.`
      : 'Your ready-to-use AI starter prompt is ready. Open My Pulse to copy it and start building this week.';
  };
  const rowFor = (userId: string, topicLabel: string | null) => ({
    title: 'Your AI starter prompt is ready',
    body: bodyFor(topicLabel),
    url: MY_PULSE_URL,
    icon: '/icons/icon-192x192.png',
    created_by: userId,
    targeting: { user_ids: [userId] },
    priority: 'normal',
    category: 'ai_pulse',
    // work_item keeps cron-emitted reminders out of the
    // /notifications/admin announcement surface (kind='announcement').
    kind: 'work_item',
    idempotency_key: `ai_pulse_domain_starter_notify:${cycleId}:${userId}`,
    metadata: {
      source: 'ai_pulse_domain_starter_notify',
      cycle_id: cycleId,
      topic_label: (topicLabel ?? '').trim() || null,
    },
  });

  // ── 1. Who has already been told, in ONE paged scan rather than one
  //       SELECT per learner. This is the idempotency guard's fast path.
  let seen: Set<string>;
  try {
    seen = await alreadyNotifiedKeys(admin, cycleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/aipulse-domain-starter-notify]', msg);
    return NextResponse.json({ ok: false, enabled: true, cycle_id: cycleId, error: msg }, { status: 500 });
  }

  const pending: { userId: string; topicLabel: string | null }[] = [];
  for (const [userId, topicLabel] of byProfile) {
    if (seen.has(`ai_pulse_domain_starter_notify:${cycleId}:${userId}`)) skipped++;
    else pending.push({ userId, topicLabel });
  }

  // ── 2. Insert the bell rows in chunks. A chunk that fails as a batch is
  //       retried row by row, so ONE bad row (or a concurrent racer losing on
  //       the UNIQUE index idx_notifications_idempotency) cannot cost the
  //       other 199 their notification. Exactly-once per learner per cycle is
  //       still enforced by that index, not by the pre-scan above.
  const created: { id: string; userId: string; topicLabel: string | null }[] = [];
  for (const group of chunk(pending, DB_CHUNK)) {
    const { data, error } = await admin
      .from('notifications')
      .insert(group.map((p) => rowFor(p.userId, p.topicLabel)))
      .select('id, idempotency_key');
    if (!error && data) {
      const byKey = new Map(
        (data as { id: string; idempotency_key: string }[]).map((r) => [r.idempotency_key, r.id]),
      );
      for (const p of group) {
        const id = byKey.get(`ai_pulse_domain_starter_notify:${cycleId}:${p.userId}`);
        if (id) created.push({ id, userId: p.userId, topicLabel: p.topicLabel });
        else skipped++;
      }
      continue;
    }
    for (const p of group) {
      const { data: one, error: oneErr } = await admin
        .from('notifications')
        .insert(rowFor(p.userId, p.topicLabel))
        .select('id')
        .single();
      if (oneErr || !one) {
        // A duplicate here is the racer case and is CORRECT, not a failure.
        if (!/duplicate|unique/i.test(oneErr?.message ?? '')) {
          errors.push(`${p.userId}: ${oneErr?.message ?? 'insert failed'}`);
        }
        skipped++;
        continue;
      }
      created.push({ id: (one as { id: string }).id, userId: p.userId, topicLabel: p.topicLabel });
    }
  }

  // ── 3. Link rows in chunks. The bell reads
  //       `user_notifications !inner notifications`, so this row is what
  //       actually surfaces the card.
  const linked = new Set<string>();
  for (const group of chunk(created, DB_CHUNK)) {
    const { error } = await admin
      .from('user_notifications')
      .insert(group.map((c) => ({ notification_id: c.id, user_id: c.userId })));
    if (!error) {
      for (const c of group) linked.add(c.id);
      continue;
    }
    for (const c of group) {
      const { error: oneErr } = await admin
        .from('user_notifications')
        .insert({ notification_id: c.id, user_id: c.userId });
      if (oneErr) errors.push(`${c.userId} link: ${oneErr.message}`);
      else linked.add(c.id);
    }
  }
  notified = linked.size;

  // ── 4. Phone push, AFTER the bell rows are committed and only for the
  //       recipients this run actually created — so an hourly sweep buzzes
  //       nobody twice. Subscriptions are fetched once, then sent with
  //       bounded concurrency instead of one round-trip per learner.
  const deliverable = created.filter((c) => linked.has(c.id));
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && deliverable.length) {
    const subsByUser = await fetchActiveSubs(admin, deliverable.map((c) => c.userId));
    const jobs: (() => Promise<number>)[] = [];
    for (const c of deliverable) {
      const subs = subsByUser.get(c.userId);
      if (!subs?.length) continue;
      const serialized = JSON.stringify({
        title: 'Your AI starter prompt is ready',
        body: bodyFor(c.topicLabel),
        url: MY_PULSE_URL,
        icon: '/icons/icon-192x192.png',
        data: { notification_id: c.id, type: 'ai_pulse_domain_starter', cycle_id: cycleId },
      });
      for (const s of subs) jobs.push(() => pushOne(admin, s, serialized));
    }
    for (const wave of chunk(jobs, PUSH_CONCURRENCY)) {
      const results = await Promise.allSettled(wave.map((j) => j()));
      for (const r of results) if (r.status === 'fulfilled') pushed += r.value;
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
