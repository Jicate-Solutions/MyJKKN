// A scheduled job that STOPS raises the same alarm as one that fails.
//
// ── THE RECEIPT (2026-09-14, 14:05 IST)
// cron_run_log held 16 runs for `whats-new-highlight-drafts`, every one of them
// ok = true, and the most recent was 08:13 — six hours earlier on a
// `13,43 * * * *` schedule, so roughly a dozen fires simply did not happen. The
// job is still declared in vercel.json, so this is an environment problem, not
// a configuration one.
//
// fn_cron_failure_streaks counts CONSECUTIVE FAILURES. Sixteen successes and
// then silence is a streak of zero. Nothing tripped, and nothing could have:
// there was no failure to count. This is precisely the shape the Director was
// shown as precedent — three Instagram pipeline jobs failing from June to
// September while the dashboards read healthy — except worse, because there is
// nothing to fail.
//
// ── WHY CADENCE IS DECLARED AND NOT INFERRED
// The obvious implementation reads each job's own history and calls it absent
// when the silence exceeds its usual gap. It does not work, for two reasons
// measured against the very job that prompted this:
//
//   * A BROKEN JOB'S OWN HISTORY NORMALISES ITS BREAKAGE. 16 runs over a 14-day
//     window on a half-hourly schedule means the typical gap in the log is
//     already hours or days. Six hours of silence looks ordinary against that,
//     so the detector would stay quiet for exactly the job it exists to catch.
//   * A BURSTY SCHEDULE LOOKS DEAD BETWEEN BURSTS. aipulse-domain-starter-notify
//     fires ten times on a Thursday (`0 14-23 * * 4`) and then not for six days.
//     Inferred cadence would page every Friday, for ever, about a healthy job —
//     and an alarm that fires on noise trains everyone to ignore it, which is
//     the reasoning already written into the streak detector.
//
// So the expected interval is DECLARED, as a config row
// (platform_ops.cron_expected_interval_minutes, docs/architecture/config-table-pattern.md),
// and the number to declare is read off vercel.json — the schedule Vercel
// actually fires. For a bursty schedule, declare the LONGEST normal gap (a
// Thursday-only job is 7 days, not 1 hour), so a quiet week is not an alarm.
//
// ── WHAT THIS DELIBERATELY DOES NOT COVER
//   * A job that is not in the map is not watched for absence. Silence about a
//     job nobody declared is honest; a default guessed from history would be
//     the inferred-cadence failure above wearing a different hat.
//   * A job that has NEVER run has no row to be late, and no last_run_at to key
//     an alert on. Naming it here would page from the moment it is declared,
//     including for a job whose route was merged but not yet deployed. It stays
//     out, and is stated rather than papered over.
//   * A job that runs and does nothing is not absent. Absence means NO RUN ROW
//     AT ALL; a legitimately idle job still fires, still logs, and is healthy.
//
// Pure, no I/O, no clock of its own — `now` is passed in, so the decision is
// testable without waiting six hours for it to be true.

/** One job's most recent activity, as fn_cron_last_runs returns it. */
export interface CronLastRun {
  job_key: string;
  path: string | null;
  last_run_at: string;
  runs_in_window: number;
}

/** A job that should have run by now and did not. */
export interface AbsentJob {
  job_key: string;
  path: string | null;
  /** The declared interval, in minutes. */
  expected_interval_minutes: number;
  /** Whole minutes since its last run. */
  silent_minutes: number;
  /** Stable for the life of one silence — the alert's idempotency anchor. */
  last_run_at: string;
  runs_in_window: number;
}

/**
 * How many expected intervals of silence before a job is called absent.
 *
 * 3, matching platform_ops.cron_failure_alert_streak, and for the same reason:
 * one missed fire is noise (Vercel drops one occasionally, and a deploy skips
 * one), three in a row is a stopped job. Against the receipt, a half-hourly job
 * is flagged after 90 minutes — four and a half hours before the state it was
 * actually found in.
 */
export const DEFAULT_ABSENCE_MULTIPLIER = 3;

/**
 * Never page about less than this much silence, however short the declared
 * interval. A job declared at one minute would otherwise alert after three,
 * which is inside the noise of a single slow deploy.
 */
export const MIN_SILENCE_MINUTES = 45;

/** Parse the config row into job_key → interval minutes, ignoring anything that
 *  is not a usable positive number. A malformed entry must not take the whole
 *  map down — the other jobs are still worth watching. */
export function parseExpectedIntervals(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [job, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.set(job, Math.floor(n));
  }
  return out;
}

/**
 * Which declared jobs have gone silent.
 *
 * A declared job with no row in `lastRuns` is NOT reported — see the header:
 * it has never run in the window, which is a different (and unkeyable) state
 * from having stopped.
 */
export function findAbsentJobs(params: {
  lastRuns: ReadonlyArray<CronLastRun>;
  expected: ReadonlyMap<string, number>;
  now: Date;
  multiplier?: number;
}): AbsentJob[] {
  const { lastRuns, expected, now } = params;
  const multiplier =
    Number.isFinite(params.multiplier) && (params.multiplier as number) >= 1
      ? (params.multiplier as number)
      : DEFAULT_ABSENCE_MULTIPLIER;

  const out: AbsentJob[] = [];
  for (const run of lastRuns) {
    const interval = expected.get(run.job_key);
    if (!interval) continue;

    const last = new Date(run.last_run_at);
    // An unparseable timestamp is not evidence of silence. Reporting it would
    // manufacture an alert out of a driver quirk.
    if (Number.isNaN(last.getTime())) continue;

    const silentMinutes = Math.floor((now.getTime() - last.getTime()) / 60_000);
    // A clock skew that puts the last run in the future is not silence either.
    if (silentMinutes <= 0) continue;

    const budget = Math.max(interval * multiplier, MIN_SILENCE_MINUTES);
    if (silentMinutes <= budget) continue;

    out.push({
      job_key: run.job_key,
      path: run.path,
      expected_interval_minutes: interval,
      silent_minutes: silentMinutes,
      last_run_at: run.last_run_at,
      runs_in_window: run.runs_in_window,
    });
  }

  // Longest silence first: the job that stopped earliest is the one to read.
  return out.sort((a, b) => b.silent_minutes - a.silent_minutes);
}

/** One line a person can act on, in the same register as the streak detector's. */
export function describeAbsence(a: AbsentJob): string {
  const hours = a.silent_minutes / 60;
  const silence =
    hours >= 48
      ? `${Math.floor(hours / 24)} days`
      : hours >= 2
        ? `${Math.floor(hours)} hours`
        : `${a.silent_minutes} minutes`;
  return `${a.job_key}: no run for ${silence} (expected every ${a.expected_interval_minutes} min)`;
}
