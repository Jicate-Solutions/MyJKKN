export const dynamic = 'force-dynamic';

// /api/cron/hr-memo-auto-detector
// T6.1 — runs daily. Detects memo-eligible events (leave taken before approval,
// monthly LOP threshold breach) and auto-issues hr_memos rows with a
// notification fan-out. Idempotent — re-runs do not duplicate memos because
// the detectors de-duplicate on stable keys (leave_id / month).
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
//
// Director notes
//   * Schedule: once a day at 02:00 UTC (configure via vercel.json crons).
//   * If `hr.memo_and_termination_triggers` policy row isn't seeded yet,
//     safe defaults apply (defined in fn_get_hr_memo_triggers).
//   * The detector returns 0 events when the source tables (institution_leaves,
//     hr_attendance_records) are absent or empty — never throws.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { HRMemoService } from '@/lib/services/hr/memo-service';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function generateRunId(): string {
  // Cheap UUID — Node 18+ has crypto.randomUUID on globalThis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback shouldn't trigger on Vercel runtime
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const runId = generateRunId();

  try {
    const supabase = getServiceClient();
    const service = new HRMemoService(supabase);
    const result = await service.runDetection(runId);

    if (result.errors.length > 0) {
      Sentry.captureMessage(
        `hr-memo-auto-detector encountered ${result.errors.length} non-fatal error(s)`,
        {
          level: 'warning',
          tags: { feature: 'hr_memos', subtype: 'detector_warnings' },
          extra: { run_id: runId, ...result },
        },
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      elapsed_ms: Date.now() - start,
      ...result,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'hr_memos', subtype: 'detector_fatal' },
      extra: { run_id: runId },
    });
    return NextResponse.json(
      {
        ok: false,
        run_id: runId,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
