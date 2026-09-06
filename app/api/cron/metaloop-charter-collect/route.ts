// =====================================================================
// MetaLoop — daily charter-draft COLLECT (surface finished drafts same-day)
// =====================================================================
// The metaloop-charter-drafts routine (Sundays 10:41 IST) enqueues charter
// drafts on the ₹0 Max lane AND collects finished ones — but a draft the drain
// completes minutes after Sunday's collect used to sit invisible until the
// NEXT Sunday. Receipt: the 3 drafts completed 2026-08-16 were not collected
// until 2026-08-23 — a week of invisibility for 35 seconds of work, which
// read as "the factory is broken" from /admin/loops/charters.
//
// This route is the latency fix: the SAME collect pass
// (lib/services/loops/metaloop-charter-collect.ts — files valid drafts as
// status='proposed', honest {insufficient:true} abstentions as
// status='insufficient'), on a DAILY clock. It never enqueues — drafting
// cadence stays Sunday's decision, so an insufficient loop is re-asked at most
// weekly, not daily.
//
// Idempotent by construction: fn_ai_collect_claim's delivered_at stamp means a
// draft is claimed exactly once ACROSS BOTH routes (whichever clock fires
// first wins; the other sees nothing), and source_job_id UNIQUE means a result
// can never file twice. Safe no-op when there is nothing to collect, while the
// job type is dark, or while the migrations are unapplied.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query
// param (both constant-time — ref feedback_cron_auth_must_accept_query_secret).
// Dispatch: ai_routine_schedules row 'metaloop-charter-collect' (daily 12:41
// IST, migration 20260927040000), NOT vercel.json.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectCharterDrafts } from '@/lib/services/loops/metaloop-charter-collect';

function constantTimeEquals(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = request.nextUrl.searchParams.get('secret') ?? '';
  const authorized =
    (bearer !== '' && constantTimeEquals(bearer, cronSecret)) ||
    (querySecret !== '' && constantTimeEquals(querySecret, cronSecret));
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const summary = await collectCharterDrafts(admin);
  return NextResponse.json({ ok: true, ...summary });
}
