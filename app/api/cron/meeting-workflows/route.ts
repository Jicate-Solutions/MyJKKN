export const dynamic = 'force-dynamic';

// app/api/cron/meeting-workflows/route.ts
//
// Cron handler for Meeting Workflows (Module 4 — Calendly Workflows parity).
// Dispatches DUE meeting_workflow_runs (pending, scheduled_for <= now()) by
// rendering each workflow action's template and sending via email / WhatsApp.
//
// Auth pattern mirrors app/api/cron/jicate-booking-reconcile/route.ts and
// app/api/cron/notification-processor/route.ts:
//   Authorization: Bearer <CRON_SECRET> header (Vercel cron auto-fires), OR
//   ?secret=<CRON_SECRET> query param (manual curl tests).
//
// Suggested schedule (add to vercel.json — see NAV-WIRING-workflows.md):
//   "*/5 * * * *"  → every 5 minutes. before_meeting reminders therefore fire
//   within 5 minutes of their scheduled instant, which is the right granularity
//   for "1 hour / 1 day before" reminders.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { runDueWorkflows } from '@/lib/services/meetings/meeting-workflow-runner';

const LOG_PREFIX = '[meetings/workflows-cron]';
const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // -----------------------------------------------------------------------
  // Auth: CRON_SECRET via Bearer header OR ?secret= query param.
  // -----------------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn(`${LOG_PREFIX} Unauthorized attempt`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient() as any;
    const summary = await runDueWorkflows(supabase, new Date(), { batchSize: BATCH_SIZE });

    console.info(
      `${LOG_PREFIX} Done — examined=${summary.examined} sent=${summary.sent} ` +
        `failed=${summary.failed} skipped=${summary.skipped} ` +
        `actions=${summary.actions_dispatched} elapsed_ms=${summary.elapsed_ms}`
    );

    return NextResponse.json({
      ok: true,
      ...summary,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    return NextResponse.json(
      { ok: false, error: errMsg, duration_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
