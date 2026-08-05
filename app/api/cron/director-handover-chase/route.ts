// app/api/cron/director-handover-chase/route.ts
// ============================================================================
// Director's Desk — the nightly chase (decisions 9, 10, 11, 12).
//
// One pass per night:
//   * relabel handovers whose owner has left  -> orphaned, and tell the Director
//     it is back on his desk (decision 7). Nothing else on the platform writes
//     this status;
//   * relabel handovers past their due date   -> expired (decision 4), and open
//     the 24h explain-or-meet valve on each one (decision 11);
//   * nudge the holder of every live handover, once, every day (decision 10);
//   * reconcile anything already in the valve — an explanation goes to the
//     Director and stops the escalation, silence hands the event to the existing
//     booking pass, which books the Director/grantee meeting.
//
// LIVE FROM NIGHT ONE — Director decision 9, a recorded override of the
// recommendation to run silent for a week. The volume fuse in the service is
// what makes that survivable: it resolves the entire recipient list first and,
// over HANDOVER_CHASE_MAX_RECIPIENTS (default 50), sends nothing at all and
// tells the Director alone. Every run is written to
// director_handover_chase_runs, fuse blown or not.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param
// — the same shape as project-accountability-check, which is the cron this
// engine extends rather than duplicates.
// ============================================================================

export const dynamic = 'force-dynamic';
// One row per handover, a handful of small writes each, and a desk that holds
// tens of items rather than thousands. 60s matches the sibling accountability
// cron; the service's own LOAD_LIMIT is the real bound on the work.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runHandoverChase } from '@/lib/services/director-desk/handover-chase-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');

  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk = querySecret === cronSecret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runHandoverChase();

    if (result.fuse_blown) {
      logger.warn(
        'director-desk/chase',
        'run halted by the volume fuse — nothing sent',
        {
          resolved: result.recipients_resolved,
          limit: result.fuse_limit
        }
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error('director-desk/chase', 'director-handover-chase failed', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
