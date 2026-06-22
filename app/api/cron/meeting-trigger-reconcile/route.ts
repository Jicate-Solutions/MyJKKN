// app/api/cron/meeting-trigger-reconcile/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR1b hourly reconcile (explanation valve).
//
// For each open breach event (status='notified'):
//   - if the Principal submitted an explanation (action_responses) → mark
//     'explained' + route it to the Director to judge (skip / meet);
//   - if the 24h deadline passed with no explanation → mark 'meeting_pending'
//     + alert the Director that a review meeting is warranted (PR1c books it).
//
// Hourly so the 24h deadline is enforced within ~1h and explanations reach the
// Director promptly. Auth: CRON_SECRET (Bearer header OR ?secret=).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { reconcileExplanations } from '@/lib/services/meetings/meeting-trigger-service';
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
    const result = await reconcileExplanations();
    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error(
      'meetings/triggers',
      'meeting-trigger-reconcile failed',
      error
    );
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
