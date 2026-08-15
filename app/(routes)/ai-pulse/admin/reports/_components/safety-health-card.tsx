'use client';

// app/(routes)/ai-pulse/admin/reports/_components/safety-health-card.tsx
// ============================================================================
// Is the automatic safety check still running?  (Director moderation #10,
// corrected by Director decision #2 of 2026-07-30)
//
// The check runs every ten minutes on a cron. If it silently stops, every new
// prompt build stays 'pending' and simply never appears in the feed — and an
// empty feed looks EXACTLY like "nobody is writing prompts". Nothing else on the
// platform can tell those two apart, which is why this card exists.
//
// WHAT DECISION #2 CHANGED, AND WHY IT MATTERED
// The first version of this card judged liveness from the last time a PROMPT was
// checked. That is the wrong signal. The cron stamps a build only when there is
// an eligible build to stamp, so a run that correctly finds nothing to do stamps
// nothing and looks dead. Measured on production 2026-07-30: 0 eligible builds,
// 357 minutes since the last stamp, red banner reading "the automatic safety
// check may have stopped" — while the cron ran correctly every ten minutes, with
// no way for the banner to ever clear. Raising the threshold would only have
// postponed the same false alarm.
//
// So the card now reads two different numbers and never confuses them:
//   checker_last_ran_at    the cron wrote a run-log row   -> LIVENESS, warns
//   last_build_checked_at  a prompt was actually stamped  -> THROUGHPUT, informs
// Both are displayed, because a human needs both to tell a stalled cron from a
// quiet week.
//
// WHAT 2026-08-06 CHANGED, AND WHY IT MATTERED
// Two numbers were still not enough to name the state the system was in.
// Measured on production that morning, the run log read, every ten minutes:
//     {"phase":"done","enabled":true,"skipped":44,"enqueued":0,"recorded":0}
// That is a checker which is switched on, running on time, and correctly acting
// on nothing. The card had no way to say that. Worse, it could not tell a
// checker somebody had deliberately switched off from one that had crashed,
// because both look like an absence, and it reported the oldest waiting prompt
// as fourteen days old on a system with nothing wrong with it.
//
// This card now names four states, and derives each from its own signal:
//   DISABLED  checker_enabled is false            somebody turned it off
//   STALLED   no heartbeat inside the window      it should be running and isn't
//   IDLE      heartbeat fresh, nothing eligible   healthy; the quiet case
//   WORKING   heartbeat fresh, work queued        healthy; the busy case
//
// DISABLED and STALLED are deliberately independent rather than ranked, because
// the cron writes its heartbeat BEFORE it reads the kill switch. A switched-off
// checker therefore keeps ticking. "Off and ticking" means somebody turned it
// off; "off and silent" means it is also not being invoked at all. Collapsing
// those into one banner would throw away the difference.
// ============================================================================

import { AlertTriangle, CheckCircle2, Clock, PauseCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePromptSafetyHealth,
  type PromptSafetyHealth,
} from '@/lib/services/ai-pulse/champion-report-queue-service';

// Threshold taken from the cron's real cadence, not from a round number. It is
// scheduled every 10 minutes, so 30 minutes is THREE consecutive missed runs —
// past any single slow or skipped slot, while still catching a genuine outage in
// half an hour rather than an hour.
//
// This is a deliberate return to 30 after the value was raised to 60. The
// earlier 30 was not wrong because it was short; it was wrong because it was
// measured against max(safety_checked_at), a number that stops advancing
// whenever nothing is eligible — so it fired forever on a healthy cron and no
// threshold could have saved it. Against the run log the measurement is sound:
// that row is written unconditionally on every invocation, including runs that
// do nothing and runs where the checker is switched off. Three missing rows
// means three missing invocations, full stop.
const CHECKER_STALE_AFTER_MINUTES = 30;

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

/** Plain English, no library: "4 hours ago", not "PT4H". */
function ageInWords(iso: string | null): string {
  const mins = minutesSince(iso);
  if (mins === null) return 'unknown';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * The four states, plus the two honest "cannot say" answers.
 *
 * `unknown` is not a failure — it is what an app build reports when it is
 * talking to a database where migration 20260813030000 has not been applied
 * yet, so the RPC still returns the older six columns. That window is real: the
 * migration in this change is applied by hand, separately from the deploy. The
 * only safe reading of a missing signal is "not observed", never "off" and never
 * "zero", so `unknown` renders no banner at all.
 */
type CheckerActivity = 'stalled' | 'never-ran' | 'working' | 'idle' | 'unknown';

interface CheckerState {
  /** Somebody switched the checker off. Independent of `activity` on purpose:
   *  the cron heartbeats before it reads the switch, so a disabled checker is
   *  still expected to tick. Null when the reader cannot tell us. */
  disabled: boolean | null;
  activity: CheckerActivity;
  minutesSinceLastRun: number | null;
}

export function resolveCheckerState(
  health: Pick<
    PromptSafetyHealth,
    'checker_enabled' | 'checker_last_ran_at' | 'eligible_waiting_count'
  >,
  nowMs: number,
): CheckerState {
  const lastRan = health.checker_last_ran_at
    ? new Date(health.checker_last_ran_at).getTime()
    : null;
  const mins =
    lastRan === null || Number.isNaN(lastRan) ? null : Math.floor((nowMs - lastRan) / 60_000);

  // Explicitly `=== false`. A null kill switch means "this reader is too old to
  // tell", which must NOT be reported as switched off.
  const disabled = health.checker_enabled === null ? null : health.checker_enabled === false;

  let activity: CheckerActivity;
  if (mins === null) {
    // No run has ever been recorded. On a fresh release the log is legitimately
    // empty, so this is its own state and not an alarm.
    activity = 'never-ran';
  } else if (mins > CHECKER_STALE_AFTER_MINUTES) {
    activity = 'stalled';
  } else if (health.eligible_waiting_count === null) {
    // Heartbeat is fresh, so the checker is alive — but without the eligible
    // count we cannot honestly claim it is idle rather than busy.
    activity = 'unknown';
  } else if (health.eligible_waiting_count > 0) {
    activity = 'working';
  } else {
    activity = 'idle';
  }

  return { disabled, activity, minutesSinceLastRun: mins };
}

function StatTile({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  Icon: typeof ShieldCheck;
  tone: 'neutral' | 'warn' | 'good';
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600 dark:text-amber-500'
      : tone === 'good'
        ? 'text-emerald-600 dark:text-emerald-500'
        : 'text-foreground';

  return (
    <div className='rounded-md border border-border p-3'>
      <div className='flex items-center gap-2'>
        <Icon className={`h-4 w-4 ${toneClass}`} aria-hidden />
        <span className='text-xs font-medium text-muted-foreground'>{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
    </div>
  );
}

export function SafetyHealthCard() {
  const { data, isLoading, error, dataUpdatedAt } = usePromptSafetyHealth();

  if (isLoading) {
    return (
      <div className='grid gap-3 sm:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
        Could not load the safety check status. Confirm you hold the{' '}
        <code className='font-mono'>aiPulse:anomaly.review</code> permission and reload.
      </div>
    );
  }

  const health = data!;

  // Staleness is measured against WHEN THIS READING WAS TAKEN, not against a
  // render clock. Date.now() during render is impure — React's purity rule
  // rejects it, because two renders of the same data could disagree — and
  // dataUpdatedAt is the more honest reference anyway: this card reports on the
  // reading it actually holds. It is non-zero whenever `data` is present, and in
  // the impossible case that it were zero the age would come out negative, which
  // resolves to a healthy state rather than to a false alarm.
  const { disabled, activity } = resolveCheckerState(health, dataUpdatedAt);
  const looksStopped = activity === 'stalled';
  const neverRan = activity === 'never-ran';

  // The number that actually deserves attention. `waiting_count` counts every
  // pending build including the ones the checker will never look at, so it is
  // shown as context, never as the queue. On production 2026-08-06 the two read
  // 46 and 0: nothing was waiting on the checker at all.
  const eligible = health.eligible_waiting_count;
  const ineligible = eligible === null ? null : Math.max(0, health.waiting_count - eligible);

  return (
    <div className='space-y-3'>
      {disabled === true && (
        <Alert>
          <PauseCircle className='h-4 w-4' />
          <AlertTitle>The automatic safety check is switched off</AlertTitle>
          <AlertDescription>
            Somebody turned it off deliberately — this is not a breakdown. While
            it is off, no new prompt is judged, so none can reach the feed. Ask a
            super admin to switch it back on when you want prompts flowing again.
          </AlertDescription>
        </Alert>
      )}

      {looksStopped && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>The automatic safety check may have stopped</AlertTitle>
          <AlertDescription>
            It last ran {ageInWords(health.checker_last_ran_at)}, and it normally
            runs every 10 minutes. This is about the scheduled job not running at
            all, which is a different problem from it being switched off — a
            switched-off checker still reports in every 10 minutes. While it is
            stopped, new prompts stay in the waiting list and never reach the
            feed, which looks exactly like nobody writing prompts. Ask a super
            admin to check the scheduled job before assuming the feed is simply
            quiet.
          </AlertDescription>
        </Alert>
      )}

      {neverRan && (
        <Alert>
          <Clock className='h-4 w-4' />
          <AlertTitle>No runs recorded yet</AlertTitle>
          <AlertDescription>
            The safety check has not yet written a run record. That is normal for
            the first hour after a release. If this is still here tomorrow, ask a
            super admin to confirm the scheduled job is switched on.
          </AlertDescription>
        </Alert>
      )}

      <div className='grid gap-3 sm:grid-cols-3'>
        {/* The queue, counted honestly. Until 2026-08-06 this tile showed every
            pending build, including ones the checker is not allowed to touch,
            and reported the oldest of THOSE as how long the queue had been
            waiting — which on production read fourteen days while the checker
            was working perfectly and had nothing to do. The checker only ever
            picks up prompts scored between 60 and 79; on that day 44 of the 46
            pending builds scored 5 to 58 and would never be picked up at all.
            They are not late, they are out of scope, so they are reported as
            context underneath rather than counted as a backlog. */}
        <StatTile
          label='Waiting to be checked'
          value={eligible ?? health.waiting_count}
          hint={
            eligible === null
              ? `${health.waiting_count} pending in total`
              : eligible === 0
                ? ineligible
                  ? `Nothing waiting — ${ineligible} pending prompts are outside the checker's range`
                  : 'Nothing in the queue'
                : `Oldest arrived ${ageInWords(health.oldest_waiting_at)}`
          }
          Icon={Clock}
          tone={(eligible ?? health.waiting_count) > 0 && looksStopped ? 'warn' : 'neutral'}
        />
        <StatTile
          label='Rejected by the checker'
          value={health.rejected_count}
          hint={
            health.rejected_count === 0
              ? 'Nothing needs a second look'
              : 'Open the AI-rejected tab to review'
          }
          Icon={ShieldAlert}
          tone={health.rejected_count > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label='Cleared for the feed'
          value={health.passed_count}
          hint='Judged appropriate, or released by a champion'
          Icon={CheckCircle2}
          tone='good'
        />
      </div>

      {/* Both numbers, always, side by side. A reader who sees only one of them
          cannot tell "the checker died" from "the checker is fine and there has
          simply been nothing to check" — which is the exact confusion that put a
          permanent red banner on a healthy system. */}
      <div className='space-y-1 text-xs text-muted-foreground'>
        {/* Say the healthy states out loud. A card that only ever speaks up to
            complain leaves "everything is fine" and "this card is broken"
            looking identical, and the quiet case here — on, running, nothing
            eligible — is the one that was previously misread as a fault. */}
        {disabled === false && activity === 'idle' && (
          <p className='flex items-center gap-1.5'>
            <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500' aria-hidden />
            <span>
              The checker is on and running on time, with nothing waiting for it.
              That is the normal quiet state, not a fault.
            </span>
          </p>
        )}
        {disabled === false && activity === 'working' && (
          <p className='flex items-center gap-1.5'>
            <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500' aria-hidden />
            <span>
              The checker is on and running on time, working through{' '}
              {eligible} waiting {eligible === 1 ? 'prompt' : 'prompts'}.
            </span>
          </p>
        )}
        <p className='flex items-center gap-1.5'>
          <ShieldCheck className='h-3.5 w-3.5 shrink-0' aria-hidden />
          <span>
            Checker last ran{' '}
            {neverRan ? 'never (no run recorded yet)' : ageInWords(health.checker_last_ran_at)}
            {health.checker_last_ran_at &&
              ` (${new Date(health.checker_last_ran_at).toLocaleString()})`}
            .
          </span>
        </p>
        <p className='flex items-center gap-1.5'>
          <Clock className='h-3.5 w-3.5 shrink-0' aria-hidden />
          <span>
            A prompt was last checked{' '}
            {health.last_build_checked_at === null
              ? 'never'
              : ageInWords(health.last_build_checked_at)}
            {health.last_build_checked_at &&
              ` (${new Date(health.last_build_checked_at).toLocaleString()})`}
            . This one stands still whenever there is nothing eligible to check,
            so it is not a sign of trouble on its own.
          </span>
        </p>
      </div>
    </div>
  );
}
