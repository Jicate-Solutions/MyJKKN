// =====================================================================
// SF100 "Solve for 100" — daily accountability sweep
// =====================================================================
// Fires the SF100 accountability engine on a schedule. For every ACTIVE
// program (sf100_programs.status = 'active') it runs, per program:
//   SF100Service.runStallCheck(programId)       — escalates active→warning→
//       probation→removed on check-in silence + notifies each team leader.
//   SF100Service.runDeadlineWarnings(programId) — at exactly 30 & 7 days
//       before the program hard_deadline, notifies active teams (no-op else).
//
// The service methods read from `this.supabase` (an AsyncLocalStorage-injected
// client). A cron has NO user session, so each call runs inside
// SF100Service.runWithClient(serviceClient, fn) with a service-role client.
//
// Each program is guarded in its own try/catch so one program's failure does
// not abort the whole sweep. Scheduled 03:37 UTC daily (= 09:07 IST) via
// vercel.json (secret passed as ?secret=${CRON_SECRET}).
//
// Auth: valid `Authorization: Bearer <CRON_SECRET>` OR matching `?secret=`
// (constant-time compare on either). Reject with 401 otherwise.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SF100Service } from '@/lib/services/startup-studio';

// Constant-time equality that never short-circuits on length mismatch.
function secretMatches(presented: string | null | undefined, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Accept EITHER a valid Bearer token OR a matching ?secret= query param.
// Many existing vercel.json crons pass the secret as ?secret=${CRON_SECRET};
// the Bearer branch matches Vercel's native cron invocation. Both compared
// in constant time.
function isAuthorized(request: NextRequest, secret: string): boolean {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearer !== null && secretMatches(bearer, secret)) return true;
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret !== null && secretMatches(querySecret, secret)) return true;
  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createServiceRoleClient();

  // Find every active program.
  const { data: programs, error: programsError } = await svc
    .from('sf100_programs')
    .select('id')
    .eq('status', 'active');

  if (programsError) {
    return NextResponse.json({ ok: false, error: programsError.message }, { status: 500 });
  }

  const ids: string[] = (programs ?? []).map((p: { id: string }) => p.id);
  const results: Array<Record<string, unknown>> = [];

  for (const id of ids) {
    // Guard each program so one failure doesn't abort the sweep.
    try {
      const out = await SF100Service.runWithClient(svc, async () => ({
        stall: await SF100Service.runStallCheck(id),
        deadline: await SF100Service.runDeadlineWarnings(id),
      }));
      results.push({ program_id: id, ok: true, ...out });
    } catch (err) {
      results.push({
        program_id: id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, programs: ids.length, results });
}
