export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { runSettleThenBill } from '@/lib/services/campus-living/settle-bill-service';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/settle-then-bill-cron';

/**
 * Settle-then-bill sweep (Director 2026-08-09).
 *
 * Closes every hostel-room settle window that is due — its 5-day window elapsed,
 * its 20-day outer limit passed, or the room filled — bills each resident at the
 * occupancy that exists at that moment, and issues late-join credits on rooms
 * already billed. All arithmetic belongs to the existing fractional-occupancy
 * engine; this route only triggers the sweep.
 *
 * ⚠️ DELIBERATELY NOT SCHEDULED. This route is intentionally absent from
 * vercel.json's `crons[]`. The mechanism ships OFF (platform policy
 * `hostel.settle_bill.enabled` = false) and scheduling it is a separate
 * Director decision, taken after the dry run has been read. Adding a schedule
 * here without that decision would start billing 2,400+ families on a timer.
 *
 * SAFE BY DEFAULT: a call with no `dry_run` parameter is a DRY RUN — it reports
 * what would be billed and writes nothing. Live billing requires `dry_run=false`
 * explicitly, AND the master switch being on (the SQL biller RAISEs otherwise).
 *
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) OR
 * `?secret=` query param (manual runs). Mirrors the sibling campus-living crons
 * (occupancy-snapshot, vacancy-price-drops).
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.warn(LOG, 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    logger.warn(LOG, 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Opt IN to writing. Anything other than an explicit "false" stays a dry run.
  const dryRun = request.nextUrl.searchParams.get('dry_run') !== 'false';

  try {
    const summary = await runSettleThenBill({ dryRun });
    const duration_ms = Date.now() - startTime;

    if (!summary.enabled) {
      // Not an error — the mechanism is off by design until the Director turns
      // it on. Reported explicitly so a silent no-op is never mistaken for a
      // clean run (see rule 27: permission/gate failures must be explicit).
      return NextResponse.json(
        {
          ...summary,
          duration_ms,
          message:
            'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false). Nothing ran.',
        },
        { status: 200 },
      );
    }

    if (summary.parity_aborts > 0) {
      logger.error(LOG, 'Rooms aborted by the fee parity gate — nothing was billed for them', {
        parity_aborts: summary.parity_aborts,
      });
    }

    return NextResponse.json({ ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    logger.error(LOG, 'Fatal', { error });
    return NextResponse.json({ error, duration_ms }, { status: 500 });
  }
}
