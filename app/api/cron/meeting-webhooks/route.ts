export const dynamic = 'force-dynamic';

// /api/cron/meeting-webhooks
// ----------------------------------------------------------------------------
// MODULE 9 — webhook delivery worker (Universal Booking, Calendly parity).
//
// Drains the meeting_webhook_deliveries queue: every pending delivery whose
// scheduled_for has arrived is POSTed to its webhook's target_url with an
// X-MyJKKN-Signature HMAC header, then marked sent / failed (with backoff
// retry under the attempt cap). All delivery logic lives in
// lib/services/meetings/meeting-webhook-dispatcher.ts — this route is just the
// authorized trigger.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs). Identical shape to the other crons
// in app/api/cron/* (e.g. hr/document-expiry-reminders, notification-processor).
//
// Schedule (document in NAV-WIRING + add to vercel.json on apply):
//   `*/2 * * * *` — every 2 minutes (real-time-ish; webhooks are latency-
//   sensitive). `*/5` is acceptable if cron budget is tight.
//
// Idempotency / concurrency: the dispatcher increments attempts and flips
// status as it goes, so overlapping invocations don't double-deliver the same
// row (a row already moved to sent/failed/backoff is no longer "due").

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchDue } from '@/lib/services/meetings/meeting-webhook-dispatcher';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  // ---- Auth (CRON_SECRET) ---------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/meeting-webhooks] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient() as unknown as import('@supabase/supabase-js').SupabaseClient;
    const summary = await dispatchDue(supabase);
    return NextResponse.json({
      ok: true,
      ...summary,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/meeting-webhooks] failed:', message);
    return NextResponse.json(
      { ok: false, error: message, duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
