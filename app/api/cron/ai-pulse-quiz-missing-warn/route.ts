// =====================================================================
// AI Pulse — warn when a cycle is approaching with no quiz authored
// =====================================================================
// WHY THIS EXISTS
//   On 2026-09-17 the AI Pulse session ran with 437 people in attendance and
//   ZERO quiz submissions. The two cycles before it had 198 and 195. Nothing
//   had broken: no quiz was ever authored for that cycle, and not one surface
//   anywhere said so. Read off production the same night:
//
//     2026-09-17  config keys = {ai_pulse, kind}          <- no quiz
//     2026-09-10  config keys = {ai_pulse, kind, quiz}    5 questions
//     2026-09-03  config keys = {ai_pulse, kind, quiz}    5 questions
//
//   It had happened before and gone equally unremarked — 2026-08-27,
//   2026-07-02 and 2026-06-25 also carry no quiz key to this day. A quiz is
//   authored roughly a week ahead when it is authored at all, so there is
//   always a window in which a human could still act. This route turns that
//   window into a signal instead of a silence.
//
// WHERE THE QUIZ ACTUALLY LIVES
//   A cycle is a startup_events row with config->>kind = 'ai_pulse'. The quiz
//   is a SIBLING of the ai_pulse key at the TOP level of that same config —
//   config->'quiz', NOT config->'ai_pulse'->'quiz'. The editor at
//   app/(routes)/ai-pulse/admin/quiz/[cycle] read-modify-writes it there via
//   QuizService.saveQuiz. Getting that path wrong is the one way this whole
//   check passes silently forever, so it is pinned in
//   lib/services/ai-pulse/quiz-missing-warn.ts and asserted against the real
//   production shapes in __tests__/lib/ai-pulse/quiz-missing-warn.test.ts.
//
// THE CHECK
//   Any non-cancelled ai_pulse cycle whose demo_date falls between TODAY (IST)
//   and TODAY + quiz_missing_warning_days, and whose config has no 'quiz' key
//   or a quiz with zero questions, is flagged.
//
// WHO HEARS ABOUT IT
//   The people who can fix it: every holder of a role granting
//   aiPulse:quiz.author (the ai_pulse_champion role — Champion, Co-Champion
//   and two others on production today). If that set ever comes back empty the
//   warning falls back to the super admins, and if THAT is empty too the run
//   answers 500 rather than 200 — a guard that flags a cycle with nobody to
//   tell is the same silence one layer up.
//
//   Delivery follows app/api/cron/aipulse-domain-starter-notify: a bell row
//   (notifications + a user_notifications link row, which is what the bell
//   actually reads) plus a web push, so it reaches a phone and not only a tab
//   nobody has open.
//
// RE-NUDGING, AND WHY THE KEY CARRIES A DATE
//   idempotency_key = ai_pulse_quiz_missing_warn:<cycleId>:<IST date>. One
//   warning per cycle per day, so the reminder repeats each morning while the
//   gap is open and stops the moment a quiz is authored. A once-ever key would
//   have fired on the Monday and then let Thursday arrive in silence — the
//   exact failure being fixed.
//
// AUTH
//   CRON_SECRET via Authorization: Bearer ... OR ?secret=, identical to every
//   sibling ai-pulse cron. Fired by the dispatcher, not vercel.json (the hard
//   100-cron cap): the schedule row is seeded by
//   supabase/migrations/*_ai_pulse_quiz_missing_warn.sql and the registry entry
//   lives in lib/ai-routines/ai-pulse.ts.
//
// Created: 2026-09-17.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { filterPushRecipients } from '@/lib/push/opt-out';
import { withCronRun } from '@/lib/cron/run-log';
import webpush from 'web-push';
import {
  cycleNotificationExpiresAt,
  type AiPulseCycleRow,
} from '@/lib/services/ai-pulse/cycle-window';
import {
  QUIZ_AUTHOR_PERMISSION,
  WARN_DAYS_KEY,
  WARN_ENABLED_KEY,
  DEFAULT_WARN_DAYS,
  MAX_WARN_DAYS,
  istDateKey,
  daysBetweenDateKeys,
  quizGapReason,
  warnBody,
  warnTitle,
  type QuizGapReason,
} from '@/lib/services/ai-pulse/quiz-missing-warn';

/** Cycles read per run. Wide enough to hold the upcoming cycles AND enough
 *  history for cycle-window to measure the cadence the TTL is derived from. */
const CYCLE_WINDOW = 12;

/** Bounded so a run cannot open one socket per subscription at once. */
const PUSH_CONCURRENCY = 8;

const QUIZ_EDITOR_PATH = '/ai-pulse/admin/quiz';

// Same cron-usable push mechanism as aipulse-domain-starter-notify: sign with
// VAPID here and post straight to the endpoint. The DB trigger path is a silent
// no-op on this project (its app.push_send_endpoint setting is unconfigured).
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:director@jkkn.ac.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

type Admin = SupabaseClient;

type PushSubRow = {
  id: string;
  user_id: string;
  subscription: { endpoint: string; keys?: { p256dh: string; auth: string } } | null;
  failure_count: number | null;
};

type FlaggedCycle = {
  cycle: AiPulseCycleRow;
  demoDay: string;
  daysOut: number;
  reason: QuizGapReason;
  questionCount: number;
};

/**
 * Fail-safe policy read. Returns undefined on ANY problem so each caller
 * applies its own default — which here is not always "off": this guard
 * defaults ON, because one that ships dark repeats the bug it fixes.
 */
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return undefined;
    const row = data as { value_jsonb?: unknown } | null;
    if (!row) return undefined;
    return row.value_jsonb;
  } catch {
    return undefined;
  }
}

/**
 * Everyone who can author a quiz, resolved from the PERMISSION rather than a
 * hardcoded role key: custom_roles.permissions is the single source of truth
 * for who holds aiPulse:quiz.author, so a second Champion role added later
 * starts receiving this with no code change.
 *
 * Falls back to the super admins when that set is empty.
 */
async function resolveRecipients(
  admin: Admin,
): Promise<{ userIds: string[]; source: 'quiz_authors' | 'super_admins' | 'none' }> {
  const roleIds: string[] = [];
  const { data: roles } = await admin
    .from('custom_roles')
    .select('id, permissions')
    .eq('is_active', true);
  for (const row of (roles ?? []) as { id: string; permissions: unknown }[]) {
    const perms = (row.permissions ?? {}) as Record<string, unknown>;
    if (perms[QUIZ_AUTHOR_PERMISSION] === true) roleIds.push(row.id);
  }

  if (roleIds.length > 0) {
    const { data: assigned } = await admin
      .from('user_roles')
      .select('user_id')
      .in('role_id', roleIds);
    const ids = Array.from(
      new Set(
        ((assigned ?? []) as { user_id: string | null }[])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (ids.length > 0) return { userIds: ids, source: 'quiz_authors' };
  }

  const { data: supers } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .limit(25);
  const fallback = Array.from(
    new Set(
      ((supers ?? []) as { id: string | null }[])
        .map((r) => r.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (fallback.length > 0) return { userIds: fallback, source: 'super_admins' };
  return { userIds: [], source: 'none' };
}

/**
 * Insert one bell card and the link rows that actually surface it.
 *
 * TWO statements, not one, and the second is the load-bearing one: the bell
 * reads `user_notifications !inner notifications` filtered by user_id (see
 * lib/services/notification/notification-service.ts getNotifications), so a
 * notifications row carrying only targeting.user_ids appears to nobody. Same
 * shape as app/api/cron/aipulse-domain-starter-notify.
 *
 * Returns null when this cycle was already warned about today — a 23505 on
 * idx_notifications_idempotency is the EXPECTED outcome of the second sweep in
 * a day, not a failure. The database is the arbiter rather than a read-then-
 * write check, so two overlapping runs cannot both send.
 *
 * Written inline rather than through createBellNotification (which would do
 * exactly this) because that helper lives in the meetings service and pulls
 * GoogleCalendarService — and therefore googleapis — into a daily cron whose
 * entire job is one JSONB presence check.
 */
async function insertBellCard(
  admin: Admin,
  opts: {
    recipientIds: string[];
    title: string;
    body: string;
    url: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    expiresAt: string | null;
  },
): Promise<{ id: string | null; duplicate: boolean; error: string | null }> {
  const row: Record<string, unknown> = {
    title: opts.title,
    body: opts.body,
    url: opts.url,
    icon: '/icons/icon-192x192.png',
    // An approaching session with no quiz is not an FYI.
    priority: 'high',
    category: 'ai_pulse',
    // work_item keeps cron-emitted reminders out of the /notifications/admin
    // announcement surface (kind='announcement').
    kind: 'work_item',
    created_by: opts.recipientIds[0],
    targeting: { user_ids: opts.recipientIds },
    metadata: opts.metadata,
    idempotency_key: opts.idempotencyKey,
  };
  // Only when the cycle yielded one. The column stays NULL rather than being
  // guessed at, which is the contract cycleNotificationExpiresAt documents.
  if (opts.expiresAt) row.expires_at = opts.expiresAt;

  const { data, error } = await admin
    .from('notifications')
    .insert(row as never)
    .select('id')
    .single();

  if (error || !data) {
    const message = error?.message ?? 'insert returned no row';
    if (/duplicate|unique/i.test(message) || (error as { code?: string })?.code === '23505') {
      return { id: null, duplicate: true, error: null };
    }
    return { id: null, duplicate: false, error: message };
  }

  const notificationId = (data as { id: string }).id;
  const { error: linkErr } = await admin
    .from('user_notifications')
    .insert(opts.recipientIds.map((uid) => ({ notification_id: notificationId, user_id: uid })) as never);
  if (linkErr) {
    // The card exists but nobody can see it. That is a failure, not a partial
    // success — report it rather than counting the warning as delivered.
    return { id: null, duplicate: false, error: `link rows failed: ${linkErr.message}` };
  }

  return { id: notificationId, duplicate: false, error: null };
}

/**
 * Best-effort phone delivery. Never throws: a push problem must not cost the
 * bell row that already landed.
 */
async function pushToRecipients(
  admin: Admin,
  userIds: string[],
  payload: { title: string; body: string; url: string; data: Record<string, unknown> },
): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return 0;
  if (userIds.length === 0) return 0;

  // Drop anyone who switched push off. is_active alone cannot carry that
  // answer — unsubscribing destroys the endpoint and the next page load mints
  // a fresh is_active row (see lib/push/opt-out.ts).
  let allowed: string[] = [];
  try {
    allowed = await filterPushRecipients(admin as never, userIds);
  } catch {
    return 0;
  }
  if (allowed.length === 0) return 0;

  let subs: PushSubRow[] = [];
  try {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, user_id, subscription, failure_count')
      .in('user_id', allowed)
      .eq('is_active', true);
    if (error) return 0;
    subs = (data ?? []) as PushSubRow[];
  } catch {
    return 0;
  }

  const serialized = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    icon: '/icons/icon-192x192.png',
    data: payload.data,
  });

  let pushed = 0;
  for (let i = 0; i < subs.length; i += PUSH_CONCURRENCY) {
    const wave = subs.slice(i, i + PUSH_CONCURRENCY);
    const results = await Promise.allSettled(
      wave.map(async (row) => {
        const sub = row.subscription;
        if (!sub || !sub.endpoint || !sub.keys) return 0;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, serialized);
          return 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          const at = new Date().toISOString();
          // 404/410 => the browser dropped this subscription for good.
          await admin
            .from('push_subscriptions')
            .update({
              ...(statusCode === 404 || statusCode === 410 ? { is_active: false } : {}),
              last_failed_at: at,
              failure_count: (row.failure_count ?? 0) + 1,
              updated_at: at,
            } as never)
            .eq('id', row.id);
          return 0;
        }
      }),
    );
    for (const r of results) if (r.status === 'fulfilled') pushed += r.value;
  }
  return pushed;
}

async function handler(request: NextRequest) {
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
  const admin = createServiceRoleClient() as Admin;
  const errors: string[] = [];

  // -- Config. Both knobs live in ai_pulse_policies; both carry a code default
  //    so the route is correct before its seed migration is applied.
  const enabledRaw = await readPolicy(admin, WARN_ENABLED_KEY);
  if (enabledRaw === false) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      processed: 0,
      flagged: 0,
      sent: 0,
      skipped: 0,
      note: 'quiz_missing_warning_enabled is off',
    });
  }

  const daysParsed = Number(await readPolicy(admin, WARN_DAYS_KEY));
  const warnDays =
    Number.isFinite(daysParsed) && daysParsed >= 0 && daysParsed <= MAX_WARN_DAYS
      ? Math.floor(daysParsed)
      : DEFAULT_WARN_DAYS;

  // -- Cycles. Newest-first so upcoming cycles lead, and a WINDOW rather than
  //    one row so cycle-window can measure the cadence for the TTL.
  const { data: cyclesRaw, error: cyclesErr } = await admin
    .from('startup_events')
    .select('id, name, demo_date, status, config')
    .eq('config->>kind', 'ai_pulse')
    .neq('status', 'cancelled')
    .order('demo_date', { ascending: false, nullsFirst: false })
    .limit(CYCLE_WINDOW);

  if (cyclesErr) {
    return NextResponse.json(
      { ok: false, enabled: true, error: `cycle read failed: ${cyclesErr.message}` },
      { status: 500 },
    );
  }

  const cycles = (cyclesRaw ?? []) as (AiPulseCycleRow & { name?: string | null })[];
  const today = istDateKey(new Date());

  // -- The check itself.
  const flagged: FlaggedCycle[] = [];
  for (const cycle of cycles) {
    const demoDay = cycle.demo_date ? String(cycle.demo_date).slice(0, 10) : '';
    const daysOut = daysBetweenDateKeys(today, demoDay);
    if (daysOut === null) continue;
    // Only a cycle that can still be saved. A session already past is beyond
    // warning about, and warning about it would bury the one that is not.
    if (daysOut < 0 || daysOut > warnDays) continue;

    const gap = quizGapReason(cycle.config);
    if (gap.reason === null) continue;
    flagged.push({
      cycle,
      demoDay,
      daysOut,
      reason: gap.reason,
      questionCount: gap.questionCount,
    });
  }

  if (flagged.length === 0) {
    return NextResponse.json({
      ok: true,
      enabled: true,
      warn_days: warnDays,
      ist_date: today,
      processed: cycles.length,
      flagged: 0,
      sent: 0,
      skipped: 0,
      elapsed_ms: Date.now() - started,
    });
  }

  // -- Recipients, resolved once for the whole run.
  const recipients = await resolveRecipients(admin);
  if (recipients.userIds.length === 0) {
    // Honest failure. Flagging with nobody to tell is exactly the silence this
    // route exists to end, so it must NOT answer 200.
    return NextResponse.json(
      {
        ok: false,
        enabled: true,
        warn_days: warnDays,
        processed: cycles.length,
        flagged: flagged.length,
        sent: 0,
        skipped: 0,
        error: 'no holder of aiPulse:quiz.author and no super admin was found to warn',
      },
      { status: 500 },
    );
  }

  let sent = 0;
  let skipped = 0;
  let pushed = 0;

  for (const item of flagged) {
    const cycleId = item.cycle.id;
    const title = warnTitle(item.demoDay, item.daysOut);
    const body = warnBody(item.demoDay, item.daysOut, item.reason, item.questionCount);
    const url = `${QUIZ_EDITOR_PATH}/${cycleId}`;
    // Derived from THIS cycle, never a literal: the warning is superseded when
    // the cycle it is about is over, and the cadence lives in the cycle rows.
    const expiresAt = cycleNotificationExpiresAt(item.cycle, cycles);

    let card: { id: string | null; duplicate: boolean; error: string | null };
    try {
      card = await insertBellCard(admin, {
        recipientIds: recipients.userIds,
        title,
        body,
        url,
        metadata: {
          source: 'ai_pulse_quiz_missing_warn',
          cycle_id: cycleId,
          demo_date: item.demoDay,
          days_out: item.daysOut,
          reason: item.reason,
          question_count: item.questionCount,
          warn_days: warnDays,
          recipient_source: recipients.source,
        },
        idempotencyKey: `ai_pulse_quiz_missing_warn:${cycleId}:${today}`,
        // The guard family's rule: a per-cycle row that RESTATES a fact on a
        // fixed cadence gets a cycle-derived TTL. expiresAt cannot be null here
        // (demoDay was validated above) but the contract is honoured anyway.
        expiresAt,
      });
    } catch (err) {
      errors.push(`${cycleId}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (card.error) {
      errors.push(`${cycleId}: ${card.error}`);
      continue;
    }
    // A duplicate means today's key already existed — already warned this
    // morning, which is the idempotency guard working, not a problem.
    if (card.duplicate || !card.id) {
      skipped++;
      continue;
    }
    sent++;

    pushed += await pushToRecipients(admin, recipients.userIds, {
      title,
      body,
      url,
      data: { notification_id: card.id, type: 'ai_pulse_quiz_missing', cycle_id: cycleId },
    });
  }

  // Top-level numerics so the dispatcher's summarize() prints real numbers
  // rather than a bare "HTTP 200". processed/flagged/sent/skipped are headline
  // keys and print even at zero, which is what makes "ran and found nothing"
  // look different from "did not run".
  return NextResponse.json({
    ok: true,
    enabled: true,
    warn_days: warnDays,
    ist_date: today,
    processed: cycles.length,
    flagged: flagged.length,
    sent,
    skipped,
    pushed,
    recipients: recipients.userIds.length,
    recipient_source: recipients.source,
    // Hoisted top-level on purpose: ai-pulse-anomaly-scan reported "flagged 0"
    // daily for weeks while EVERY insert failed, because its failures lived
    // inside an errors[] array in a 200 response that the dispatcher summary
    // never read. A non-zero count here shows up in the status line.
    insert_errors: errors.length,
    flagged_cycles: flagged.map((f) => ({
      cycle_id: f.cycle.id,
      demo_date: f.demoDay,
      days_out: f.daysOut,
      reason: f.reason,
      question_count: f.questionCount,
    })),
    ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
    elapsed_ms: Date.now() - started,
  });
}

export const GET = withCronRun('ai-pulse-quiz-missing-warn', handler);
