// app/api/cron/project-accountability-check/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR2 nightly project triggers.
//
// Evaluates active project rules (metric_key IN 'task_overdue','project_at_risk')
// and reconciles the 24h explanation valve for project (subject-scoped) events:
//   * evaluateProjectTriggers      — detect breaches, resolve RACI, notify
//                                     (Accountable explain-or-meet; R/C/I/head info)
//   * reconcileProjectExplanations — route explanations to the head, or escalate
//                                     to meeting_pending after the deadline
//
// Nothing fires unless a rule is `active` (both seeded inactive — the Director
// activates in /meetings/triggers). The live attendance cron is unaffected.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// Scheduled in vercel.json (mould of attendance-breach-check).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  evaluateProjectTriggers,
  reconcileProjectExplanations
} from '@/lib/services/meetings/meeting-trigger-service';
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
    const evaluated = await evaluateProjectTriggers({});
    const reconciled = await reconcileProjectExplanations({});

    return NextResponse.json({
      success: true,
      evaluated,
      reconciled,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error(
      'meetings/triggers',
      'project-accountability-check failed',
      error
    );
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
