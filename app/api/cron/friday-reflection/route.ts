// =====================================================================
// Doctrines v1 — Friday 4 PM Reflection Cron (Task 10)
// =====================================================================
// Runs every Friday at 16:00 IST (10:30 UTC). Drops an in-app reflection
// card into the notifications feed for Learners and Faculty only.
//
// Delivery = TWO writes (a `notifications` row plus its `user_notifications`
// link row), done via the shared fanoutNotification helper. A parent row on
// its own never reaches the bell.
//
// Spec-locked decisions:
//   - Audience: Student + Faculty only (not Principal/HOD/Accounts/Counselor).
//   - No web push — this is a quiet prompt, not an interrupt. Sunday wrap
//     is the push-worthy moment; Friday reflection is the reflective one.
//   - Same idempotency pattern as Sunday wrap: one card per user per ISO week.
//   - NO WhatsApp (Doctrines v1 explicit thrash-lock).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs).
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { FRIDAY_REFLECTION_ANCHOR, buildIdempotencyKey } from '@/lib/habits/anchor-schedule';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const REFLECTION_ROLES = ['faculty', 'student'] as const;
type ReflectionRole = (typeof REFLECTION_ROLES)[number];

type ReflectionUser = {
  id: string;
  role: ReflectionRole;
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/friday-reflection] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/friday-reflection] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const week = isoWeek(new Date());
  // Self-obsoleting weekly card: expire in 7 days so it clears the day next
  // Friday's reflection arrives, instead of piling up unread forever. The
  // notification read path honors expires_at as of 2026-07-26 (see
  // lib/services/notification/notification-service.ts). 7d > the 7d cadence, so
  // at most one reflection card is ever live per user.
  const REFLECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + REFLECTION_TTL_MS).toISOString();
  const results = {
    week,
    eligible_users: 0,
    cards_created: 0,
    cards_skipped_duplicate: 0,
    errors: [] as string[]
  };

  const { data: users, error: usersErr } = await serviceClient
    .from('profiles')
    .select('id, role')
    .in('role', REFLECTION_ROLES as unknown as string[]);

  if (usersErr) {
    console.error('[cron/friday-reflection] user enumeration failed:', usersErr);
    results.errors.push(`user fetch: ${usersErr.message}`);
    return NextResponse.json({ ...results, duration_ms: Date.now() - startTime }, { status: 500 });
  }

  const typedUsers = (users as ReflectionUser[]) ?? [];
  results.eligible_users = typedUsers.length;

  for (const user of typedUsers) {
    const idempKey = buildIdempotencyKey(FRIDAY_REFLECTION_ANCHOR, week, user.id);

    const { data: existing } = await serviceClient
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempKey)
      .maybeSingle();

    if (existing) {
      results.cards_skipped_duplicate++;
      continue;
    }

    const title = 'Friday Reflection';
    const body =
      user.role === 'faculty'
        ? 'Log one learning from this week. What will you try differently next week? Set your weekend intent.'
        : 'What did you learn this week? What is your intent for the weekend? Capture one thing you would do differently next week.';

    // Delivering an in-app card takes TWO writes, not one. The bell and inbox
    // read `user_notifications` with an `!inner` join back to `notifications`
    // (lib/services/notification/notification-service.ts), and there is no DB
    // trigger that fans out — so a `notifications` row with no matching
    // `user_notifications` link row is invisible to its recipient forever.
    // Until 2026-08-25 this route wrote only the parent row: every reflection
    // card it has ever composed reached nobody. fanoutNotification does both
    // writes (and is the canonical helper — see its header).
    try {
      await fanoutNotification(serviceClient, {
        title,
        body,
        userIds: [user.id],
        createdBy: user.id,
        url: '/dashboard?reflection=open',
        icon: '/icons/icon-192x192.png',
        priority: 'normal',
        category: `doctrines:${FRIDAY_REFLECTION_ANCHOR.key}`,
        // 2026-04-25: doctrines:* are cron-emitted operational reminders, not
        // user-composed announcements. Tagging as work_item keeps them out of
        // the /notifications/admin page (which filters to kind='announcement').
        kind: 'work_item',
        idempotencyKey: idempKey,
        // expires_at is a real production column with no first-class option on
        // the helper; the 7-day TTL above is what stops these piling up unread.
        extraColumns: { expires_at: expiresAt },
        source: `cron:${FRIDAY_REFLECTION_ANCHOR.key}`,
        metadata: {
          role: user.role,
          week
        }
      });
    } catch (err) {
      results.errors.push(`${user.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    results.cards_created++;
  }

  return NextResponse.json({
    ...results,
    duration_ms: Date.now() - startTime
  });
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
