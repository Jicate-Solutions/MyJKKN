'use client';

// app/(routes)/ai-pulse/admin/reports/_components/safety-health-card.tsx
// ============================================================================
// Is the automatic safety check still running?  (Director moderation #10)
//
// The check runs on a */10 cron. If it silently stops, every new prompt build
// stays 'pending' and simply never appears in the feed — and an empty feed looks
// EXACTLY like "nobody is writing prompts". Nothing else on the platform can
// tell those two apart. last_checked_at is the heartbeat, and the stale warning
// below is the entire reason this card exists.
// ============================================================================

import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePromptSafetyHealth } from '@/lib/services/ai-pulse/champion-report-queue-service';

/** Beyond this, the cron has missed at least two of its ten-minute slots. */
const STALE_AFTER_MINUTES = 30;

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
  const staleMinutes = minutesSince(health.last_checked_at);
  const looksStopped = staleMinutes === null || staleMinutes > STALE_AFTER_MINUTES;

  return (
    <div className='space-y-3'>
      {looksStopped && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>The automatic safety check may have stopped</AlertTitle>
          <AlertDescription>
            {health.last_checked_at === null
              ? 'It has never recorded a check. '
              : `The last prompt it checked was ${ageInWords(health.last_checked_at)}. `}
            It normally checks every 10 minutes. While it is stopped, new prompts
            stay in the waiting list and never reach the feed — which looks
            exactly like nobody writing prompts. Ask a super admin to check the
            scheduled job before assuming the feed is simply quiet.
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

      <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
        <ShieldCheck className='h-3.5 w-3.5' aria-hidden />
        Last check ran {ageInWords(health.last_checked_at)}
        {health.last_checked_at && ` (${new Date(health.last_checked_at).toLocaleString()})`}.
      </p>
    </div>
  );
}
