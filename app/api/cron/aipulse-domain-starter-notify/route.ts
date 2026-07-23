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
// IDEMPOTENCY
//   notifications.idempotency_key = ai_pulse_domain_starter_notify:<cycleId>:<userId>.
//   Re-firing on the same cycle is a safe per-recipient no-op.
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

const ENABLED_KEY = 'domain_starter_enabled';
const MY_PULSE_URL = '/ai-pulse/my-pulse';

type Admin = ReturnType<typeof createServiceRoleClient>;

type NotifyTarget = {
  profile_id: string;
  topic_label: string | null;
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

  let notified = 0;
  let skipped = 0;
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
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    cycle_id: cycleId,
    notified,
    skipped,
    ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
    elapsed_ms: Date.now() - started,
  });
}
