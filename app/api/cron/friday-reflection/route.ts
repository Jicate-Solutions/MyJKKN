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
    // Link rows actually written. cards_created counts composition; this counts
    // DELIVERY. They diverge only if the fan-out half of the emit is broken.
    cards_delivered: 0,
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

  // 2026-08-17: this used to loop over every profile and make TWO sequential
  // round-trips per user (a SELECT on idempotency_key, then an INSERT). At 6,705
  // eligible users that is 13,410 round-trips, and the AI-routine dispatcher
  // aborts any routine at 120s, so the loop was cut off mid-way and the run
  // recorded "The operation was aborted due to timeout". It was not dead, it was
  // PARTIAL: 6,703 users served on 08-14 but only 51 on 07-10, with no signal in
  // the output that anyone had been missed.
  //
  // Now: build every card in memory, then hand whole batches to
  // fn_doctrines_emit_cards, which does the dedupe in ONE statement.
  //
  // It has to be an RPC. notifications' unique index on idempotency_key is
  // PARTIAL (WHERE idempotency_key IS NOT NULL), Postgres will not infer a
  // partial index from a bare ON CONFLICT (col), and PostgREST's on_conflict
  // parameter cannot express the predicate — so a plain
  // .upsert(rows, { onConflict: 'idempotency_key' }) raises 42P10 on every call.
  // Verified against production before this was written.
  const cards = typedUsers.map((user) => ({
    title: 'Friday Reflection',
    body:
      user.role === 'faculty'
        ? 'Log one learning from this week. What will you try differently next week? Set your weekend intent.'
        : 'What did you learn this week? What is your intent for the weekend? Capture one thing you would do differently next week.',
    url: '/dashboard?reflection=open',
    icon: '/icons/icon-192x192.png',
    created_by: user.id,
    targeting: { user_ids: [user.id] },
    priority: 'normal',
    category: `doctrines:${FRIDAY_REFLECTION_ANCHOR.key}`,
    // 2026-04-25: doctrines:* are cron-emitted operational reminders, not user-composed
    // announcements. Tagging as work_item keeps them out of /notifications/admin page
    // (which filters to kind='announcement'). User dashboard surfaces still pick them up.
    kind: 'work_item',
    idempotency_key: buildIdempotencyKey(FRIDAY_REFLECTION_ANCHOR, week, user.id),
    expires_at: expiresAt,
    metadata: {
      role: user.role,
      week,
      source: `cron:${FRIDAY_REFLECTION_ANCHOR.key}`
    }
  }));

  // Delivering an in-app card takes TWO writes, not one. The bell and inbox read
  // `user_notifications` with an `!inner` join back to `notifications`
  // (lib/services/notification/notification-service.ts), and no DB trigger fans
  // out — so a `notifications` row with no matching `user_notifications` link row
  // is invisible to its recipient forever. Until 2026-08-25 this route wrote only
  // the parent row: 91,069 reflection cards naming real people reached nobody.
  //
  // #3199 fixed that by routing the per-user loop through fanoutNotification.
  // This route no longer HAS a per-user loop, so the second write moved down with
  // the first: fn_doctrines_emit_cards inserts the notifications rows AND their
  // user_notifications links in the same statement, and back-fills the links of a
  // card that already existed (the heal fanoutNotification does on its idempotent
  // path). `linked` comes back so delivery is COUNTED, not assumed — the whole
  // point of the 2026-08-25 postmortem was that this route reported
  // `cards_created: N` for four months while delivering zero.
  //
  // Chunked so one run never posts a multi-megabyte body. 6,705 cards is 4 calls
  // instead of 13,410.
  const EMIT_CHUNK = 2000;
  for (let i = 0; i < cards.length; i += EMIT_CHUNK) {
    const batch = cards.slice(i, i + EMIT_CHUNK);
    const { data, error } = await serviceClient.rpc('fn_doctrines_emit_cards', {
      p_cards: batch
    });

    if (error) {
      console.error('[cron/friday-reflection] emit failed:', error);
      results.errors.push(`emit rows ${i}-${i + batch.length - 1}: ${error.message}`);
      continue;
    }

    const r = (data ?? {}) as { inserted?: number; skipped_duplicate?: number; linked?: number };
    results.cards_created += r.inserted ?? 0;
    results.cards_skipped_duplicate += r.skipped_duplicate ?? 0;
    results.cards_delivered += r.linked ?? 0;
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
