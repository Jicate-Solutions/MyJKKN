// app/api/cron/routine-checks/route.ts
// ============================================================================
// Routine checks — the daily job that creates preventive-maintenance jobs.
//
// Director ruling, 30 Sep 2026: MyJKKN creates routine check jobs by itself
// from the maintenance schedules and sends them straight to the fixer, with no
// approval step. All the logic lives in lib/campus-walk/routine-checks.ts
// (runRoutineChecks); this route is the thin, secret-gated wrapper.
//
// Per run: every active resource_maintenance_schedules row whose next date has
// arrived gets ONE Campus Walk job (idempotency key = schedule id + due date),
// a resource_maintenance_logs row, a bell to the owner, and its next date moved
// on. At most ROUTINE_CHECK_RUN_CAP jobs per run; the rest wait for tomorrow.
// The JSON response reports created / skipped counts.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` ONLY — the header Vercel Cron
// sends by itself. A secret in the URL is refused (it ends up in access logs).
// Fails CLOSED: with CRON_SECRET unset nothing runs.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runRoutineChecks } from '@/lib/campus-walk/routine-checks';
import { withCronRun } from '@/lib/cron/run-log';
import { logger } from '@/lib/utils/enhanced-logger';

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await runRoutineChecks(createServiceRoleClient() as any);
    return NextResponse.json({ success: true, ...report, duration_ms: Date.now() - startTime });
  } catch (error: any) {
    logger.error('campus-walk/routine-checks', 'routine-checks failed', error);
    return NextResponse.json({ success: false, error: error?.message ?? 'Internal error' }, { status: 500 });
  }
}

export const GET = withCronRun('routine-checks', handler);
