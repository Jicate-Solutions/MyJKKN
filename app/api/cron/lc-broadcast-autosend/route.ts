export const dynamic = 'force-dynamic';

// app/api/cron/lc-broadcast-autosend/route.ts
// Sends Learners Council all-college broadcasts whose approval window has passed.
//
// The Director's rule (2026-08-08): an all-college council message waits for ONE
// named approver, and if that person does not respond within the configured
// window (`lc.broadcast.auto_send_hours`, default 24) the message is SENT
// ANYWAY. Silence counts as approval. That was chosen on a question which named
// the consequence explicitly — it is deliberate, not an oversight.
//
// All the work happens inside fn_lc_broadcast_autosend(), which is
// service_role-only, advisory-locked against overlapping runs, and re-checks
// the learners-only rule at send time in case the council roster changed while
// a request sat waiting.
//
// Auth: CRON_SECRET via EITHER `Authorization: Bearer <secret>` OR `?secret=`.
// Both are accepted deliberately — this repo registers its cron paths with
// `?secret=${CRON_SECRET}` (105 of 138 cron routes read the query param), while
// Vercel also sends the Bearer header. Accepting only one of the two is how a
// cron ends up 401-ing on every run and silently doing nothing.

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (!cronSecret || (!bearerMatches(authHeader, cronSecret) && querySecret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('fn_lc_broadcast_autosend');

    if (error) {
      console.error('[cron/lc-broadcast-autosend] rpc failed:', error.message);
      return NextResponse.json({ error: 'Auto-send sweep failed' }, { status: 500 });
    }

    // Log the WORK COUNT, not just "ran" — a fast, successful sweep that sent
    // nothing looks identical to a broken one otherwise.
    const result = (data ?? {}) as { auto_sent?: number; rejected?: number; skipped?: string };
    console.warn(
      `[cron/lc-broadcast-autosend] auto_sent=${result.auto_sent ?? 0} rejected=${result.rejected ?? 0}${
        result.skipped ? ` skipped=${result.skipped}` : ''
      }`
    );

    return NextResponse.json(
      { success: true, ...result },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cron/lc-broadcast-autosend] error:', err);
    return NextResponse.json({ error: 'Auto-send sweep failed' }, { status: 500 });
  }
}
