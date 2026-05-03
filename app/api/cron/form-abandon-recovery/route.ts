// app/api/cron/form-abandon-recovery/route.ts
// Path A B7 — Form-abandon recovery cron (Hour-2 nudge).
//
// Schedule: every 30 minutes via Vercel cron (see vercel.json).
// Purpose: detect public-form sessions that hit form_started + field_completed
// (with phone or email hash captured) but never reached form_submitted, and
// route matched abandoners to the existing 'gentle-reengagement' WhatsApp
// sequence — recovering Hour-2 intent invisible to the Day-14+ cold-lead
// re-engagement system.
//
// Auth: Bearer ${CRON_SECRET} or ?secret=${CRON_SECRET}. Same pattern as
// other admission crons (prospect-reminders, dashboard-work-items).
//
// Idempotency: handled by the service via:
//   1. ON CONFLICT (session_id, form_id) DO NOTHING on admission_form_abandon_log
//   2. abandon_recovery_triggered sentinel event filters re-runs out
//   3. cooldown_days policy gates same-session re-fire over a 7-day window.
//
// Created: 2026-05-03 — Path A B7.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runFormAbandonRecovery } from '@/lib/services/admission/form-abandon-recovery-service';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFormAbandonRecovery();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[cron/form-abandon-recovery] failed:', err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
