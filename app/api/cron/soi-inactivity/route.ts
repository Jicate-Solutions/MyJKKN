// app/api/cron/soi-inactivity/route.ts
// ============================================================================
// School of Influence — inactivity engine, DRY RUN (spec §5, §7 S7).
//
// Runs the nudge → pause → remove evaluator over every School of Influence batch
// and RECORDS what it would do in cohort_status_events. It takes no action:
// nothing here changes a membership, sends a reminder, or removes anybody. The
// route contains no action branch at all, so there is no flag this handler could
// be given that would make it act.
//
// WHY A DRY RUN AND NOT A WORKING ENGINE
//   cohort_status_events has 0 rows platform-wide. SF100 carried grace,
//   escalation and inactivity settings and they never fired once — that
//   inertness is why SF100 sat four months with nobody noticing. The fix is not
//   to switch an engine on quickly; it is to make "the engine ran and found
//   nothing" impossible to confuse with "the engine never ran". So every run
//   leaves a receipt per batch, unconditionally, even for a batch with zero
//   members and zero verdicts.
//
// SERVICE ROLE, NOT THE CALLER. fn_soi_record_inactivity_dry_run is granted to
// service_role ONLY — EXECUTE is revoked from anon and PUBLIC and is deliberately
// not granted to authenticated, so no signed-in user can reach the writer over
// PostgREST. This route is its only caller and holds the service key, which is
// why the secret check below is the real gate.
//
// SAFE TO RUN REPEATEDLY. uniq_soi_inactivity_dry_run_daily keys one row per
// target per day, so a retry, a manual poke and the scheduled run cannot write
// the same verdict twice. A second run in the same day reports zero rows written
// and is a success, not an error.
//
// A REFUSED RUN IS LOUD. The recorder aborts the WHOLE run if it is ever handed
// an actionable verdict for somebody whose attendance cannot be recorded at all
// (a member with no learner record — see the migration header). That surfaces
// here as a 500 carrying the database's own sentence, never as a quiet success.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Optional `?batch=<uuid>` scopes the run to one batch; omitted, it sweeps every
// non-archived School of Influence batch.
//
// NOT SCHEDULED IN vercel.json BY THIS CHANGE — see the PR body. The route is
// invokable by hand with the secret; adding the schedule is a one-line follow-up
// the Director makes when they want the list to start accumulating.
// Created: 2026-08-01.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

/** Matches a v4-shaped uuid; anything else is rejected before it reaches SQL. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  // Same shape as the sibling cron routes (app/api/cron/meta-audience-sync):
  // header OR query secret, and FAIL CLOSED when CRON_SECRET is absent. An
  // unset secret must refuse the request, not skip the check — this route holds
  // the service key and is the only caller allowed to write to the audit log, so
  // a missing environment variable must never turn it into an open endpoint.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const headerOk = request.headers.get('authorization') === `Bearer ${cronSecret}`;
  const queryOk = request.nextUrl.searchParams.get('secret') === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchParam = request.nextUrl.searchParams.get('batch');
  if (batchParam && !UUID_RE.test(batchParam)) {
    return NextResponse.json(
      {
        success: false,
        error:
          'The "batch" parameter must be a batch id. Leave it off to evaluate every School of Influencer batch.',
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await (supabase as any).rpc(
      'fn_soi_record_inactivity_dry_run',
      { p_cohort_id: batchParam ?? null }
    );

    if (error) {
      // Includes the deliberate abort described in the header. The database
      // writes these messages for a human, so the message is passed through
      // rather than replaced with a generic failure.
      logger.error(
        'school-of-influence',
        'soi-inactivity dry run refused by the database',
        error
      );
      return NextResponse.json(
        {
          success: false,
          dry_run: true,
          actions_taken: 0,
          error: error.message ?? 'The inactivity dry run could not be recorded.',
        },
        { status: 500 }
      );
    }

    const result = (data ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      ...result,
      // Restated AFTER the payload deliberately, so these two cannot be
      // overridden by whatever the database returned. This handler has no action
      // path, so they are true regardless of what any flag or future column says.
      dry_run: true,
      actions_taken: 0,
      note:
        'Evaluated only. No reminder was sent, nobody was paused and nobody was removed.',
      duration_ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    logger.error('school-of-influence', 'soi-inactivity cron failed', err);
    return NextResponse.json(
      {
        success: false,
        dry_run: true,
        actions_taken: 0,
        error: err?.message ?? 'Internal error',
      },
      { status: 500 }
    );
  }
}
