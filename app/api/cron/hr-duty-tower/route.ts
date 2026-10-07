// =====================================================================
// HR duty tower — weekly on-time readings for the seven HR duties
// =====================================================================
// Records last week's on-time readings per HR duty (per college and for all
// colleges), puts each duty's rate on its loops-tower row through the existing
// recordLoopMeasurement, then asks for earned-trust suggestions — which
// returns 0 unless the Director has switched them on (ships OFF).
//
// It MEASURES ONLY. No email, no WhatsApp, no notification; no role,
// permission or approval chain is changed. Migration 20271007161151.
//
// SCHEDULE: the AI-routine dispatcher (ai_routine_schedules row
// 'hr-duty-tower', Monday 06:47 IST, editable at /admin/ai-routines).
// NOT a vercel.json cron.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` only, constant-time. The
// dispatcher sends Bearer only.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runHrDutyTower } from '@/lib/services/hr/duty-tower/tower-run';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'hr/duty-tower';

function secretMatches(presented: string | null | undefined, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return bearer !== null && secretMatches(bearer, secret);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runHrDutyTower(createServiceRoleClient());
    const failed = result.duties.filter((d) => d.outcome === 'failed');
    if (failed.length > 0) {
      logger.warn(LOG_MODULE, '[hr-duty-tower] some measurements were not recorded', failed);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(LOG_MODULE, '[hr-duty-tower] run failed', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
