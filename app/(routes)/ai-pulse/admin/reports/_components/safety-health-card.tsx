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
// ============================================================================

import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePromptSafetyHealth } from '@/lib/services/ai-pulse/champion-report-queue-service';

// Threshold taken from the cron's real cadence, not from a round number. It is
// scheduled every 10 minutes, so 60 minutes is roughly SIX consecutive missed
// runs — far enough past a single slow or skipped slot that a warning means
// something, close enough that a genuine outage is caught within the hour.
// (The old 30-minute value was only two missed runs AND was measured against the
// wrong signal, which is what made it fire forever.)
const CHECKER_STALE_AFTER_MINUTES = 60;

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
  const { data, isLoading, error } = usePromptSafetyHealth();

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

  // NEVER RUN is not the same as STOPPED. Before the first run after this ships,
  // the run log is legitimately empty; alarming on that would greet every deploy
  // with a red banner and teach everyone to ignore it.
  const neverRan = health.checker_last_ran_at === null;
  const sinceLastRun = minutesSince(health.checker_last_ran_at);
  const looksStopped = !neverRan && sinceLastRun !== null && sinceLastRun > CHECKER_STALE_AFTER_MINUTES;

  return (
    <div className='space-y-3'>
      {looksStopped && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>The automatic safety check may have stopped</AlertTitle>
          <AlertDescription>
            It last ran {ageInWords(health.checker_last_ran_at)}, and it normally
            runs every 10 minutes. While it is stopped, new prompts stay in the
            waiting list and never reach the feed — which looks exactly like
            nobody writing prompts. Ask a super admin to check the scheduled job
            before assuming the feed is simply quiet.
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
        <StatTile
          label='Waiting to be checked'
          value={health.waiting_count}
          hint={
            health.waiting_count === 0
              ? 'Nothing in the queue'
              : `Oldest arrived ${ageInWords(health.oldest_waiting_at)}`
          }
          Icon={Clock}
          tone={health.waiting_count > 0 && looksStopped ? 'warn' : 'neutral'}
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
