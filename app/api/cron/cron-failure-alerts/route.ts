// =====================================================================
// CRON FAILURE ALERTS — a scheduled job that breaks repeatedly says so
// =====================================================================
// THE RECEIPT
// /api/cron/aipulse-domain-starter-notify fires ten times every Thursday. On
// 2026-08-20 it returned HTTP 500 nine times in one window ("canceling
// statement due to statement timeout"), and it had failed the same way the
// Thursday before. 588 and then 635 learners got no starter prompt. Nothing
// went red, because vercel.json's 57 static crons were the one scheduled-work
// lane with no run log and no watcher. It was found by a human going looking.
//
// WHAT THIS DOES
// Hourly: ask cron_run_log which jobs' most recent runs are a streak of N
// consecutive non-successes, and if any are, raise ONE bell notification to
// the super admins. Silence when healthy.
//
// WHY A STREAK AND NOT "ANY FAILURE"
// A cron that fails once and recovers is noise; an alarm that fires on noise
// trains everyone to ignore it, and is then worth less than no alarm at all
// (the same lesson already written into ai-lane-heartbeat and the AI Pulse
// heartbeat migration). N is a config row —
// platform_ops.cron_failure_alert_streak, default 3 — so the threshold is a
// Director decision, not a constant buried here. Against the receipt, 3 pages
// on the third of that Thursday's ten fires: hours before the window closed.
//
// WHY ONE NOTIFICATION AND NOT ONE PER JOB
// Copied from loop-watchdog, deliberately, rather than invented: the
// idempotency key is a fingerprint of the CURRENT failing set plus the IST day.
// The same failing set re-checked every hour stays deduplicated to a single
// card; a NEW job joining the failure set changes the fingerprint and pages
// once more; and a set still broken tomorrow pages once tomorrow. That is
// once-per-change plus a daily restatement — not once per hour.
//
// KNOWN LIMITATIONS, stated rather than papered over
//   * A route that answers HTTP 200 and does nothing is invisible here. Liveness
//     is not correctness; catching that class needs a per-job outcome assertion,
//     which is not what this file claims to do.
//   * Nothing watches THIS cron. It records its own runs into cron_run_log via
//     withCronRun, so a human can see it stopped, but a detector that detected
//     its own death would be turtles all the way down. The honest fix is to put
//     it on the dispatcher (which loop-watchdog already watches) once it has
//     proven itself; that is a follow-up, not this PR.
//   * A job is only visible once its route opts into withCronRun. This PR wires
//     the dispatcher, the AI Pulse notify cron that started all this, and this
//     detector; the remaining static crons are a one-line change each.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`.
//       `?dryRun=1` computes and reports but delivers nothing.
// Created: 2026-09-10.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { withCronRun, isCronAuthorized } from '@/lib/cron/run-log';

const JOB_KEY = 'cron-failure-alerts';
const POLICY_KEY = 'platform_ops.cron_failure_alert_streak';
const DEFAULT_MIN_STREAK = 3;

/** Cards live 3 days: long enough to survive a weekend, short enough that a
 *  fortnight of daily restatements cannot bury the bell. */
const ALERT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Rows returned by fn_cron_failure_streaks. */
interface FailureStreak {
  job_key: string;
  path: string | null;
  streak_length: number;
  streak_started_at: string;
  last_failure_at: string;
  last_status_code: number | null;
  last_error: string | null;
  runs_in_window: number;
  failures_in_window: number;
}

/**
 * Stable identity for a failing SET. Each job contributes its key and the start
 * of its current streak — both stable for the life of that streak — so the
 * fingerprint only moves when a job joins, leaves, or breaks anew.
 */
function streakFingerprint(streaks: FailureStreak[]): string {
  return streaks
    .map((s) => `${s.job_key}@${s.streak_started_at}`)
    .sort()
    .join('|');
}

function describe(s: FailureStreak): string {
  const code = s.last_status_code ? `HTTP ${s.last_status_code}` : 'no response';
  const err = s.last_error ? ` — ${s.last_error.slice(0, 90)}` : '';
  return `${s.job_key}: ${s.streak_length} in a row (${code})${err}`;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, job: JOB_KEY, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const admin = createServiceRoleClient();

  // Threshold from the config row. A policy read that fails must not silence the
  // alarm, so it falls back to the default rather than returning early.
  let minStreak = DEFAULT_MIN_STREAK;
  const { data: policyValue } = await admin.rpc('fn_get_policy', {
    p_key: POLICY_KEY,
    p_scope_id: null,
  });
  if (typeof policyValue === 'number' && policyValue >= 1) {
    minStreak = Math.floor(policyValue);
  }

  const { data: streakRows, error: streakErr } = await admin.rpc('fn_cron_failure_streaks', {
    p_min_streak: minStreak,
  });
  if (streakErr) {
    console.error(`[cron:${JOB_KEY}] streak query failed:`, streakErr);
    return NextResponse.json(
      { ok: false, job: JOB_KEY, error: streakErr.message },
      { status: 500 },
    );
  }

  const streaks = (streakRows ?? []) as FailureStreak[];
  if (streaks.length === 0) {
    return NextResponse.json({ ok: true, job: JOB_KEY, min_streak: minStreak, flagged: 0, notified: 0 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      job: JOB_KEY,
      dry_run: true,
      min_streak: minStreak,
      flagged: streaks.length,
      findings: streaks.map(describe),
      notified: 0,
    });
  }

  // The audience lookup failing must FAIL the run rather than silently fan out
  // to nobody — the same call loop-watchdog makes, for the same reason: a
  // swallowed recipient error is an alarm that reports success while reaching
  // no one.
  const { data: supers, error: supersErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  if (supersErr || !supers?.length) {
    return NextResponse.json(
      {
        ok: false,
        job: JOB_KEY,
        error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`,
        flagged: streaks.length,
        findings: streaks.map(describe),
      },
      { status: 500 },
    );
  }

  const userIds = (supers as { id: string }[]).map((s) => s.id);
  const istDay = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  const findings = streaks.map(describe);

  const outcome = await fanoutNotification(admin, {
    title: `🔴 ${streaks.length} scheduled job${streaks.length === 1 ? '' : 's'} failing repeatedly`,
    body:
      findings.slice(0, 8).join(' · ') +
      (findings.length > 8 ? ` · …and ${findings.length - 8} more` : ''),
    userIds,
    priority: 'high',
    category: 'platform-ops',
    kind: 'work_item',
    url: '/admin/loops',
    idempotencyKey: `cron-failure:${istDay}:${streakFingerprint(streaks)}`.slice(0, 200),
    source: `${JOB_KEY}-cron`,
    metadata: {
      min_streak: minStreak,
      jobs: streaks.map((s) => ({
        job_key: s.job_key,
        streak_length: s.streak_length,
        streak_started_at: s.streak_started_at,
        last_status_code: s.last_status_code,
      })),
    },
    // Honoured by the bell's live-notification filter. Without an expiry every
    // daily restatement stays unread forever and the alarm buries itself.
    extraColumns: { expires_at: new Date(Date.now() + ALERT_TTL_MS).toISOString() },
  });

  return NextResponse.json({
    ok: true,
    job: JOB_KEY,
    min_streak: minStreak,
    flagged: streaks.length,
    findings,
    notified: outcome.notified,
    skipped: outcome.skipped ?? null,
  });
}

export const GET = withCronRun(JOB_KEY, handler);
