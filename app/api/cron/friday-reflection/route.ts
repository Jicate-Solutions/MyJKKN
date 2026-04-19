// =====================================================================
// Doctrines v1 — Friday 4 PM Reflection Cron (Task 10)
// =====================================================================
// Runs every Friday at 16:00 IST (10:30 UTC). Drops an in-app reflection
// card into the notifications feed for Students and Faculty only.
//
// Spec-locked decisions:
//   - Audience: Student + Faculty only (not Principal/HOD/Accounts/Counselor).
//   - No web push — this is a quiet prompt, not an interrupt. Sunday wrap
//     is the push-worthy moment; Friday reflection is the reflective one.
//   - Same idempotency pattern as Sunday wrap: one card per user per ISO week.
//   - NO WhatsApp (Doctrines v1 explicit thrash-lock).
//
// Auth: CRON_SECRET query parameter.
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

  const secret = request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    console.warn('[cron/friday-reflection] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const week = isoWeek(new Date());
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

    const { error: insertErr } = await serviceClient.from('notifications').insert({
      title,
      body,
      url: '/dashboard?reflection=open',
      icon: '/icons/icon-192x192.png',
      created_by: user.id,
      targeting: { user_ids: [user.id] },
      priority: 'normal',
      category: `doctrines:${FRIDAY_REFLECTION_ANCHOR.key}`,
      idempotency_key: idempKey,
      metadata: {
        role: user.role,
        week,
        source: `cron:${FRIDAY_REFLECTION_ANCHOR.key}`
      }
    });

    if (insertErr) {
      results.errors.push(`${user.id}: ${insertErr.message}`);
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
