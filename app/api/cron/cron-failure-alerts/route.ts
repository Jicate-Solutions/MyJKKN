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
// consecutive non-successes, AND which declared jobs have simply stopped
// running, and if any are, raise ONE bell notification to the super admins.
// Silence when healthy.
//
// ── A JOB THAT STOPS RAISES NO STREAK (added 2026-09-14)
// Measured at 14:05 on 2026-09-14: cron_run_log held 16 runs for
// `whats-new-highlight-drafts`, ALL ok = true, the latest at 08:13 — six hours
// earlier on a `13,43 * * * *` schedule, so roughly a dozen fires did not
// happen. fn_cron_failure_streaks counts consecutive FAILURES, and sixteen
// successes followed by silence is a streak of zero. Nothing tripped, and
// nothing could: there was no failure to count. That is the Instagram shape the
// Director was shown — three pipeline jobs failing June to September while the
// dashboards read healthy — except worse, because there is nothing to fail.
//
// So this route now asks a second question of the same table, through the same
// delivery path: fn_cron_last_runs gives each job's most recent run, and
// lib/cron/absence.ts compares that against a DECLARED cadence
// (platform_ops.cron_expected_interval_minutes, read off vercel.json). No
// second alerting system, no new schedule, no second notification — absences
// join the streaks in the one card that already goes to every super admin. The
// cadence is declared rather than inferred for reasons measured in that file's
// header: a broken job's own history normalises its breakage, and a bursty
// weekly schedule looks dead between bursts.
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
//   * The absence scan cannot see THIS cron stopping either, and for a sharper
//     reason than the one above: if it stops, nothing runs to notice. Declaring
//     it in the cadence map would only ever report its own absence while it was
//     still alive to do so, which is never.
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
import {
  findAbsentJobs,
  parseExpectedIntervals,
  describeAbsence,
  type AbsentJob,
  type CronLastRun,
} from '@/lib/cron/absence';

const JOB_KEY = 'cron-failure-alerts';
const POLICY_KEY = 'platform_ops.cron_failure_alert_streak';
/** job_key → how many minutes may pass between runs before it is called absent. */
const CADENCE_POLICY_KEY = 'platform_ops.cron_expected_interval_minutes';
const DEFAULT_MIN_STREAK = 3;

/** How far back fn_cron_last_runs looks. 14 days = the table's retention window,
 *  so a weekly job's last run is still findable. */
const ABSENCE_LOOKBACK_HOURS = 336;

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
function streakFingerprint(streaks: FailureStreak[], absent: AbsentJob[]): string {
  return [
    ...streaks.map((s) => `${s.job_key}@${s.streak_started_at}`),
    // last_run_at, NOT silent_minutes. The silence grows every hour, so keying
    // on its length would page hourly for ever about one stopped job; the
    // moment it last ran is fixed for the whole life of that silence, so one
    // stop raises one card (plus the daily restatement the IST day adds).
    ...absent.map((a) => `${a.job_key}@absent:${a.last_run_at}`),
  ]
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

  // ── THE SECOND QUESTION: which declared jobs have simply stopped? ──────────
  //
  // A failure here must NOT silence the streak alarm, so it is caught and
  // reported alongside rather than returned early: half an alarm beats none.
  let absent: AbsentJob[] = [];
  let absenceError: string | null = null;
  try {
    const { data: cadenceRaw } = await admin.rpc('fn_get_policy', {
      p_key: CADENCE_POLICY_KEY,
      p_scope_id: null,
    });
    const expected = parseExpectedIntervals(cadenceRaw);
    if (expected.size > 0) {
      const { data: lastRows, error: lastErr } = await admin.rpc('fn_cron_last_runs', {
        p_lookback_hours: ABSENCE_LOOKBACK_HOURS,
      });
      if (lastErr) throw new Error(lastErr.message);
      absent = findAbsentJobs({
        lastRuns: (lastRows ?? []) as CronLastRun[],
        expected,
        now: new Date(),
      });
    }
  } catch (e) {
    absenceError = e instanceof Error ? e.message : String(e);
    console.error(`[cron:${JOB_KEY}] absence scan failed:`, e);
  }

  const findings = [...streaks.map(describe), ...absent.map(describeAbsence)];

  if (findings.length === 0) {
    return NextResponse.json({
      ok: true,
      job: JOB_KEY,
      min_streak: minStreak,
      flagged: 0,
      absent: 0,
      absence_error: absenceError,
      notified: 0,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      job: JOB_KEY,
      dry_run: true,
      min_streak: minStreak,
      flagged: streaks.length,
      absent: absent.length,
      absence_error: absenceError,
      findings,
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
        absent: absent.length,
        findings,
      },
      { status: 500 },
    );
  }

  const userIds = (supers as { id: string }[]).map((s) => s.id);
  const istDay = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);

  // The title names what is actually wrong. "Failing repeatedly" above a list of
  // jobs that have STOPPED would send a reader looking for errors there are
  // none of — the fault is the absence of runs, not their outcome.
  const total = streaks.length + absent.length;
  const what =
    streaks.length === 0
      ? 'stopped running'
      : absent.length === 0
        ? 'failing repeatedly'
        : 'failing or stopped';

  const outcome = await fanoutNotification(admin, {
    title: `🔴 ${total} scheduled job${total === 1 ? '' : 's'} ${what}`,
    body:
      findings.slice(0, 8).join(' · ') +
      (findings.length > 8 ? ` · …and ${findings.length - 8} more` : ''),
    userIds,
    priority: 'high',
    category: 'platform-ops',
    kind: 'work_item',
    url: '/admin/loops',
    idempotencyKey: `cron-failure:${istDay}:${streakFingerprint(streaks, absent)}`.slice(0, 200),
    source: `${JOB_KEY}-cron`,
    metadata: {
      min_streak: minStreak,
      jobs: streaks.map((s) => ({
        job_key: s.job_key,
        streak_length: s.streak_length,
        streak_started_at: s.streak_started_at,
        last_status_code: s.last_status_code,
      })),
      stopped: absent.map((a) => ({
        job_key: a.job_key,
        last_run_at: a.last_run_at,
        silent_minutes: a.silent_minutes,
        expected_interval_minutes: a.expected_interval_minutes,
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
    absent: absent.length,
    absence_error: absenceError,
    findings,
    notified: outcome.notified,
    skipped: outcome.skipped ?? null,
  });
}

export const GET = withCronRun(JOB_KEY, handler);
