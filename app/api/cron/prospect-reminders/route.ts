// =====================================================================
// Solutions Hub Phase C2 — Prospect follow-up reminder cron
// =====================================================================
// Daily 8:23 UTC (off-peak, non-round per substrate-first wave practice).
// Calls generateReminderNotifications() which:
//   1. RPC sh_get_overdue_prospects() — overdue active prospects
//   2. Group by assigned_to
//   3. fn_create_dashboard_work_item() per assignee (idempotent per day)
//
// Auth pattern matches dashboard-work-items / attention-bar-prune /
// counselor-shift-flip — Bearer header OR ?secret= query param.
// Vercel cron invocations send the Authorization header automatically.
//
// Created: 2026-05-02 — PRD Phase C2 (Solutions Hub pipeline).
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { generateReminderNotifications } from '@/lib/services/solutions/prospect-reminders-service';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  const started = Date.now();

  try {
    const result = await generateReminderNotifications();
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      processed: result.processed,
      notifications_created: result.notifications_created,
      assignees: result.assignees,
      skipped_idempotent: result.skipped_idempotent,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[cron/prospect-reminders] failed:', err);
    return NextResponse.json(
      { ok: false, error: message, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }
}
