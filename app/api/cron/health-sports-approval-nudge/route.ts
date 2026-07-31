// =====================================================================
// Tournament squad permission — scheduled reminder to undecided colleges
// =====================================================================
// A squad request names learners from several colleges. Each college's
// Principal decides only for their own learners, and until every one of them
// has answered, nobody travels. Filing already notifies each Principal (trigger
// trg_htp_approvals_notify); this cron is what stops a request that was seen
// and then forgotten from sitting there until the tournament has been and gone.
//
// All the work is in the SECURITY DEFINER RPC
// fn_health_tournament_nudge_stale_approvals (service_role only), which writes
// notifications + user_notifications directly and is idempotent per college per
// day, so this cron can run repeatedly. It approves nothing — a reminder is the
// only remedy for a late decision.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends it
// automatically) OR `?secret=` for manual runs. Does not call Claude.
// Params: ?hours=<n> overrides the staleness window; ?dry=1 reports what it
// WOULD send without writing anything.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Has the migration that adds this RPC not been applied yet?
 *
 * Migrations here are Director-gated files that neither merge nor deploy
 * applies, so this route ships before its RPC exists. PostgREST answers a call
 * to an unknown function with PGRST202. Reporting that as `pending_migration`
 * keeps the cron's failure log meaningful instead of paging someone every run
 * over a state that is expected and harmless.
 */
function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'PGRST202') return true;
  return (
    err.code === '42883' ||
    (typeof err.message === 'string' &&
      err.message.includes('fn_health_tournament_nudge_stale_approvals') &&
      /could not find|does not exist/i.test(err.message))
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 48h default: long enough that a Principal who simply has not opened the app
  // since yesterday is not chased, short enough that a request filed on Monday
  // is chased before the weekend.
  const hoursParam = Number(request.nextUrl.searchParams.get('hours'));
  const staleHours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.floor(hoursParam) : 48;
  const dryRun = request.nextUrl.searchParams.get('dry') === '1';

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('fn_health_tournament_nudge_stale_approvals', {
    p_stale_hours: staleHours,
    p_dry_run: dryRun,
  });

  if (error) {
    if (isMissingFunction(error)) {
      return NextResponse.json({ ok: true, skipped: 'pending_migration' });
    }
    console.error('[health-sports-approval-nudge] failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const summary = (data ?? {}) as Record<string, unknown>;

  // A college with no holder of health.sports.approve is a request that can
  // never be decided. Surface it rather than letting it read as a quiet success.
  if (typeof summary.no_approver === 'number' && summary.no_approver > 0) {
    console.error(
      `[health-sports-approval-nudge] ${summary.no_approver} college(s) have no approver — those requests can never be decided.`,
    );
  }
  // The RPC contains a per-college failure rather than abandoning the run, so a
  // non-zero count here is the only place a persistent breakage becomes visible.
  if (typeof summary.failed === 'number' && summary.failed > 0) {
    console.error(
      `[health-sports-approval-nudge] ${summary.failed} college(s) failed to notify — see Postgres warnings for the reason.`,
    );
  }

  return NextResponse.json({ ok: true, ...summary });
}
