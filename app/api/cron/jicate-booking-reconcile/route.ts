export const dynamic = 'force-dynamic';

// app/api/cron/jicate-booking-reconcile/route.ts
//
// Nightly cron handler for OPEN-4 backfill.
// Scheduled at 02:17 UTC in vercel.json (07:47 IST) — off-herd minute, daily.
//
// Auth pattern mirrors app/api/cron/notification-processor/route.ts:
//   Authorization: Bearer <CRON_SECRET> header (Vercel cron auto-fires).
//   ?secret=<CRON_SECRET> query param is also accepted for manual curl tests.
//
// Vercel does NOT substitute ${CRON_SECRET} inside URL paths, so the Bearer
// header path is the only one that fires automatically. The query-param path
// is for manual testing only.

import { NextRequest, NextResponse } from 'next/server';
import {
  JicateBookingReconcileService,
} from '@/lib/services/integrations/jicate-booking-reconcile-service';

const BATCH_SIZE = 200;
const LOG_PREFIX = '[jicate-booking/reconcile]';

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

  // -----------------------------------------------------------------------
  // Reconcile batch.
  // -----------------------------------------------------------------------
  try {
    console.info(`${LOG_PREFIX} Starting — batchSize=${BATCH_SIZE}`);

    const result = await JicateBookingReconcileService.reconcileBatch({
      batchSize: BATCH_SIZE,
    });

    console.info(
      `${LOG_PREFIX} Done — examined=${result.examined} resolved=${result.resolved} still_unresolved=${result.still_unresolved} elapsed_ms=${result.elapsed_ms}`,
    );

    return NextResponse.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: errMsg,
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
