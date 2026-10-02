// app/api/cron/campus-walk-director-digest/route.ts
// ============================================================================
// Campus Walk — the Director's ONE morning summary (08:03 IST).
//
// Director ruling, 30 Sep 2026: jobs 7 days past due reach the Director as a
// single summary each morning, grouped by college — never one message per
// job. The 08:00 IST ladder (app/api/cron/campus-walk-chase-up) marks the
// jobs; this lists every one marked since the previous summary. All logic is
// in lib/campus-walk/director-digest.ts; this is the thin CRON_SECRET-gated
// wrapper, the same shape as app/api/cron/campus-walk-chase-up/route.ts.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param
// — vercel.json passes ?secret=, like every cron in app/api/cron/*.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runCampusWalkDirectorDigest } from '@/lib/campus-walk/director-digest';
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
    const result = await runCampusWalkDirectorDigest();

    return NextResponse.json({
      success: result.outcome !== 'failed',
      ...result,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error('campus-walk/director-digest', 'campus-walk-director-digest failed', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
