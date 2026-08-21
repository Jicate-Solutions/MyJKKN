// =====================================================================
// Doctrines v1 — Sunday 9 PM Wrap Cron (Task 9)
// =====================================================================
// Runs every Sunday at 21:00 IST (15:30 UTC). Delivers a weekly wrap to
// every user with a Doctrines persona: principal, hod, counselor,
// accounts, faculty, student.
//
// Pipeline:
//   1. Refresh both cluster leaderboard MVs (so rank data is fresh for
//      anyone opening the dashboard after the wrap arrives).
//   2. Enumerate active users by persona.
//   3. For each user, compute their current composite score via the
//      auth-bypass helper that matches their role (where available).
//   4. Fan out a notification to that user (priority='high',
//      category='doctrines:sunday-wrap', idempotency_key guards repeats).
//      Fan-out = a `notifications` row PLUS its `user_notifications` link row;
//      without the link the card never reaches the bell.
//   5. Send a web push via the shared push_subscriptions infrastructure.
//
// NO WhatsApp — explicit thrash-lock from Doctrines v1 spec.
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs).
//
// Task 11 Part B will replace the per-user on-the-fly compute with a
// cache read from doctrines_percentile_cache.
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { filterPushRecipients } from '@/lib/push/opt-out';
import webpush from 'web-push';
import { SUNDAY_WRAP_ANCHOR, buildIdempotencyKey } from '@/lib/habits/anchor-schedule';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const DOCTRINES_PERSONAS = ['principal', 'hod', 'counselor', 'accounts', 'faculty', 'student'] as const;

type Persona = (typeof DOCTRINES_PERSONAS)[number];

type WrapRow = {
  id: string;
  role: Persona;
  institution_id: string | null;
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/sunday-wrap] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/sunday-wrap] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const week = isoWeek(new Date());
  // Self-obsoleting weekly wrap: expire in 7 days so it clears the day next
  // Sunday's wrap arrives, instead of piling up unread forever. The notification
  // read path honors expires_at as of 2026-07-26 (see
  // lib/services/notification/notification-service.ts). 7d > the 7d cadence, so
  // at most one wrap is ever live per user.
  const WRAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + WRAP_TTL_MS).toISOString();
  const results = {
    week,
    mv_refresh: null as Record<string, unknown> | null,
    percentile_precompute: null as Record<string, unknown> | null,
    eligible_users: 0,
    wraps_created: 0,
    wraps_skipped_duplicate: 0,
    pushes_sent: 0,
    errors: [] as string[]
  };

  // Step 1 — Refresh cluster MVs FIRST so the wrap carries fresh rank data.
  try {
    const { data: refreshResult, error: refreshErr } = await serviceClient.rpc(
      'fn_refresh_cluster_leaderboards'
    );
    if (refreshErr) throw refreshErr;
    results.mv_refresh = (refreshResult as Record<string, unknown>) ?? { note: 'no-payload' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/sunday-wrap] MV refresh failed:', msg);
    results.errors.push(`MV refresh: ${msg}`);
    // Continue — stale rank data is better than skipping the wrap entirely.
  }

  // Step 1.5 — Precompute Faculty + Student percentile cache (Task 11 Part B).
  // Writes doctrines_percentile_cache rows for every eligible user cluster-wide,
  // so the week's cold fn_cluster_rank_private calls hit the cache instead of
  // the O(N²) live-compute path.
  try {
    const { data: precomputeResult, error: precomputeErr } = await serviceClient.rpc(
      'fn_precompute_percentile_cache'
    );
    if (precomputeErr) throw precomputeErr;
    results.percentile_precompute =
      (precomputeResult as Record<string, unknown>) ?? { note: 'no-payload' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/sunday-wrap] Percentile precompute failed:', msg);
    results.errors.push(`percentile precompute: ${msg}`);
    // Non-fatal — live compute fallback still works.
  }

  // Step 2 — Enumerate Doctrines-persona users.
  const { data: users, error: usersErr } = await serviceClient
    .from('profiles')
    .select('id, role, institution_id')
    .in('role', DOCTRINES_PERSONAS as unknown as string[]);

  if (usersErr) {
    console.error('[cron/sunday-wrap] user enumeration failed:', usersErr);
    results.errors.push(`user fetch: ${usersErr.message}`);
    return NextResponse.json({ ...results, duration_ms: Date.now() - startTime }, { status: 500 });
  }

  const typedUsers = (users as WrapRow[]) ?? [];
  results.eligible_users = typedUsers.length;

  // Step 3..5 — Per-user wrap compose + insert + push.
  for (const user of typedUsers) {
    const idempKey = buildIdempotencyKey(SUNDAY_WRAP_ANCHOR, week, user.id);

    // Idempotency — skip if a wrap for this user+week already exists.
    const { data: existing } = await serviceClient
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempKey)
      .maybeSingle();

    if (existing) {
      results.wraps_skipped_duplicate++;
      continue;
    }

    // Compute current composite score where we have an auth-bypass helper.
    const { score, bandLabel } = await computeWrapScore(serviceClient, user);

    const title = 'Your Sunday Wrap';
    const scoreLine = score != null ? ` Composite: ${score}/100${bandLabel ? ` (${bandLabel})` : ''}.` : '';
    const body = `Week ${week} is in the books.${scoreLine} Open your dashboard for insights and next-week priorities.`;

    // Delivering an in-app wrap takes TWO writes, not one. The bell and inbox
    // read `user_notifications` with an `!inner` join back to `notifications`
    // (lib/services/notification/notification-service.ts), and there is no DB
    // trigger that fans out — so a `notifications` row with no matching
    // `user_notifications` link row is invisible to its recipient forever.
    // Until 2026-08-25 this route wrote only the parent row: the web push below
    // landed on the phone, and the card it pointed at was never in the bell.
    // fanoutNotification does both writes (and is the canonical helper).
    let notificationId: string;
    try {
      const fanout = await fanoutNotification(serviceClient, {
        title,
        body,
        userIds: [user.id],
        createdBy: user.id,
        url: '/dashboard',
        icon: '/icons/icon-192x192.png',
        priority: 'high',
        category: `doctrines:${SUNDAY_WRAP_ANCHOR.key}`,
        idempotencyKey: idempKey,
        // expires_at is a real production column with no first-class option on
        // the helper; the TTL above is what stops these piling up unread.
        extraColumns: { expires_at: expiresAt },
        source: `cron:${SUNDAY_WRAP_ANCHOR.key}`,
        metadata: {
          role: user.role,
          score,
          band: bandLabel,
          week
        }
      });
      if (!fanout.notificationId) {
        results.errors.push(`${user.id}: fanout returned no notification id`);
        continue;
      }
      notificationId = fanout.notificationId;
    } catch (err) {
      results.errors.push(`${user.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    results.wraps_created++;

    // Web push (best-effort; failures logged, not fatal).
    try {
      const sent = await sendPushToUsers(serviceClient, [user.id], {
        title,
        body,
        icon: '/icons/icon-192x192.png',
        url: '/dashboard',
        data: { notification_id: notificationId, type: 'sunday_wrap', week, role: user.role }
      });
      results.pushes_sent += sent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`push ${user.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ...results,
    duration_ms: Date.now() - startTime
  });
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function computeWrapScore(
  client: ReturnType<typeof createServiceRoleClient>,
  user: WrapRow
): Promise<{ score: number | null; bandLabel: string }> {
  let rpcName: string | null = null;
  let args: Record<string, string> = {};

  if (user.role === 'faculty') {
    rpcName = 'fn_compute_tes_for_user';
    args = { p_user_id: user.id };
  } else if (user.role === 'student') {
    rpcName = 'fn_compute_crs_for_user';
    args = { p_user_id: user.id };
  } else if (user.role === 'hod') {
    rpcName = 'fn_compute_dhs_for_user';
    args = { p_user_id: user.id };
  } else if (user.role === 'principal' && user.institution_id) {
    rpcName = 'fn_compute_ohs_for_institution';
    args = { p_institution_id: user.institution_id };
  }
  // counselor / accounts: no auth-bypass helper in v1. Wrap ships
  // without an inline score — user opens dashboard for their CVS/CHS.

  if (!rpcName) return { score: null, bandLabel: '' };

  try {
    const { data, error } = await client.rpc(rpcName, args);
    if (error) {
      console.warn(`[cron/sunday-wrap] ${rpcName} failed for ${user.id}:`, error.message);
      return { score: null, bandLabel: '' };
    }
    const payload = data as { score?: number; band?: string } | null;
    return {
      score: typeof payload?.score === 'number' ? payload.score : null,
      bandLabel: payload?.band ?? ''
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cron/sunday-wrap] ${rpcName} threw for ${user.id}:`, msg);
    return { score: null, bandLabel: '' };
  }
}

async function sendPushToUsers(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon: string;
    url: string;
    data: Record<string, unknown>;
  }
): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return 0;
  }
  if (userIds.length === 0) return 0;

  // Drop anyone who switched push off before looking up any subscription.
  // is_active alone cannot carry that answer: unsubscribing destroys the browser
  // endpoint, so the next page load mints a NEW row that is is_active=true and
  // passes the filter below perfectly.
  const pushUserIds = await filterPushRecipients(serviceClient, userIds);
  if (pushUserIds.length === 0) return 0;

  const { data: subscriptions, error } = await serviceClient
    .from('push_subscriptions')
    .select('id, subscription, user_id')
    .in('user_id', pushUserIds)
    .eq('is_active', true);

  if (error || !subscriptions?.length) return 0;

  const pushPayload = JSON.stringify(payload);
  let sent = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub: { id: string; subscription: webpush.PushSubscription; user_id: string }) => {
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await serviceClient.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );

  return sent;
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
