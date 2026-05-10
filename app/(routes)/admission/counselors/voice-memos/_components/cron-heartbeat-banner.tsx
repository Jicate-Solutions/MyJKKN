// app/(routes)/admission/counselors/voice-memos/_components/cron-heartbeat-banner.tsx
// Last-completed timestamp + stuck-rows warning.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { CronHeartbeat } from '@/types/voice-memo-monitor';

interface CronHeartbeatBannerProps {
  cron: CronHeartbeat;
  stuckThresholdMinutes: number;
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest > 0 ? `${hours}h ${rest}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CronHeartbeatBanner({
  cron,
  stuckThresholdMinutes,
}: CronHeartbeatBannerProps) {
  const minutesAgo = cron.minutes_since_last;
  const lastCompletedLabel = formatMinutes(minutesAgo);

  // Red — stuck rows present
  if (cron.has_stuck_rows) {
    return (
      <Alert
        variant="destructive"
        className="border-red-300 bg-red-50 dark:bg-red-950/30"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-sm">
          {cron.stuck_count} memo{cron.stuck_count === 1 ? '' : 's'} stuck
        </AlertTitle>
        <AlertDescription className="text-xs">
          {cron.last_completed_at
            ? `Most recent completion was ${lastCompletedLabel}.`
            : 'No memo has ever completed.'}{' '}
          Memos pending or transcribing for more than {stuckThresholdMinutes} min — cron may be wedged.
          Check Vercel Function logs for{' '}
          <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 py-0.5 rounded text-[11px]">
            /api/cron/analyze-voice-memos
          </code>
          .
        </AlertDescription>
      </Alert>
    );
  }

  // Amber — idle (last completion >30 min ago, but no stuck rows)
  if (minutesAgo != null && minutesAgo > 30) {
    return (
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <Clock className="h-4 w-4 text-amber-700" />
        <AlertTitle className="text-sm text-amber-900 dark:text-amber-200">
          Pipeline quiet
        </AlertTitle>
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
          Last memo completed {lastCompletedLabel}. Cron may be idle, or no new memos have been uploaded.
        </AlertDescription>
      </Alert>
    );
  }

  // Amber — never completed yet (no stuck rows but no completions either)
  if (minutesAgo == null) {
    return (
      <Alert className="border-slate-300 bg-slate-50 dark:bg-slate-900/40">
        <Clock className="h-4 w-4 text-slate-600" />
        <AlertTitle className="text-sm">No memos completed yet</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Once the first memo finishes transcription and analysis, the heartbeat will go green.
        </AlertDescription>
      </Alert>
    );
  }

  // Green — healthy
  return (
    <Alert
      className={cn(
        'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30',
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
      <AlertTitle className="text-sm text-emerald-900 dark:text-emerald-200">
        Pipeline healthy
      </AlertTitle>
      <AlertDescription className="text-xs text-emerald-900 dark:text-emerald-200">
        Last memo completed {lastCompletedLabel}.
      </AlertDescription>
    </Alert>
  );
}
