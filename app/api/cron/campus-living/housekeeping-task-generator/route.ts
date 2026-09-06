export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Housekeeping task generator cron (20260611180000).
 *
 * Calls fn_housekeeping_generate_tasks() which inserts one 'scheduled'
 * hostel_cleaning_tasks row per active, due hostel_cleaning_schedules plan
 * for today (Asia/Kolkata). Idempotent via the (schedule_id, date) unique
 * index — re-runs and the schedule-creation trigger never duplicate.
 *
 * Schedule in vercel.json: daily at 18:35 UTC (= 00:05 IST, start of the
 * Indian day, so the Tasks page is populated before staff arrive).
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
 * OR `?secret=` query param (manual runs).
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/housekeeping-task-generator] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/housekeeping-task-generator] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  try {
    const { data, error } = await serviceClient.rpc('fn_housekeeping_generate_tasks');
    const duration_ms = Date.now() - startTime;

    if (error) {
      console.error(`[cron/housekeeping-task-generator] RPC failed: ${error.message}`);
      return NextResponse.json(
        { created: 0, error: error.message, duration_ms },
        { status: 500 }
      );
    }

    const created = typeof data === 'number' ? data : 0;
    console.log(`[cron/housekeeping-task-generator] Created ${created} tasks, ${duration_ms}ms`);
    return NextResponse.json({ created, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/housekeeping-task-generator] Fatal: ${message}`);
    return NextResponse.json({ created: 0, error: message, duration_ms }, { status: 500 });
  }
}
