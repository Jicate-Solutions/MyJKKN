// app/api/cron/campus-walk-chase-up/route.ts
// ============================================================================
// Campus Walk — the chase-up ladder (D5, locked).
//
// A photographed campus condition becomes a project_tasks row
// (lib/services/campus-walk/campus-walk-service.ts) with a due date. Nothing
// else in this codebase revisits it once it goes overdue —
// app/api/cron/grievance-sla-breach-check/route.ts is the named precedent for
// "a cron that watches a due date", but it only flags sla_breached_at; it
// never notifies and never escalates. This route does both, for campus-walk
// tasks only.
//
// All the logic lives in lib/campus-walk/chase-up.ts (runCampusWalkChaseUp) —
// this route is the thin CRON_SECRET-gated wrapper, the same shape as
// app/api/cron/director-handover-chase/route.ts and
// app/api/cron/grievance-sla-breach-check/route.ts.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param
// — the pattern used by every cron in app/api/cron/*.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runCampusWalkChaseUp } from '@/lib/campus-walk/chase-up';
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
    const result = await runCampusWalkChaseUp();

    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error('campus-walk/chase-up', 'campus-walk-chase-up failed', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
