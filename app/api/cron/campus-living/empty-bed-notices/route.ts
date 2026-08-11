export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runEmptyBedNotices } from '@/lib/services/campus-living/empty-bed-notice-service';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/empty-bed-notices-cron';

/**
 * Empty-bed intimation runner (Director interview 2026-08-09).
 *
 * Tells residents of an under-filled room, while its settle window is open,
 * how many beds are empty, what their share costs today, what it would cost if
 * the room filled, and that they can invite someone.
 *
 * DELIBERATELY NOT SCHEDULED. There is no entry for this route in vercel.json
 * and that omission is the point, not an oversight. Two gates have to open
 * before a single learner hears anything:
 *   1. the Director arms hostel.empty_bed_notice.enabled (seeded false), and
 *   2. someone adds the schedule here after reading a dry run.
 * A cron entry added today would start firing the moment the switch flips,
 * with nobody having looked at the list first.
 *
 * DRY RUN BY DEFAULT. A plain GET composes the messages and returns exactly who
 * would be told and the exact text, sending nothing and writing nothing. Only
 * `?dry_run=false` sends. This is the opposite of the usual default on purpose:
 * the failure mode here is messaging thousands of learners about their money.
 *
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`.
 * Mirrors /api/cron/campus-living/occupancy-snapshot.
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

  // Anything other than the literal string 'false' stays a dry run.
  const dryRun = request.nextUrl.searchParams.get('dry_run') !== 'false';

  try {
    const summary = await runEmptyBedNotices(dryRun);
    const duration_ms = Date.now() - startTime;

    // The switch being off is a refusal, not a failure — 200 with the reason so
    // a scheduler does not start retrying a deliberate no-op.
    logger.info(LOG, summary.enabled ? 'run complete' : 'refused — master switch off', {
      dry_run: summary.dry_run,
      rooms_with_empty_beds: summary.rooms_with_empty_beds,
      notices_planned: summary.notices_planned,
      notices_sent: summary.notices_sent,
      reason: summary.reason,
      duration_ms,
    });
    return NextResponse.json({ ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    logger.error(LOG, 'Fatal', { error, duration_ms });
    return NextResponse.json({ error, duration_ms }, { status: 500 });
  }
}
