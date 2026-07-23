'use client';

// =============================================================================
// RCLTP — shared "awaiting MyJKKN scoring" honest empty-state (Phase 4e)
// =============================================================================
// CONTENT-SAFETY (the whole point of Phase 4e): every report/dashboard surface
// reuses this empty state. It NEVER renders a score, band, percentage, ranking,
// or chart data point. It only describes WHAT a section will show and states the
// honesty rule: validated results only — never an estimated or placeholder score.
// =============================================================================

import { Lock } from 'lucide-react';

/**
 * The single, honest awaiting-state message reused across every report section.
 * No numbers, no fabricated data — describes intent + the no-placeholder promise.
 */
export function AwaitingScoring({ what }: { what: string }) {
  return (
    <div className='flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 px-6 py-8 text-center'>
      <Lock className='h-5 w-5 text-muted-foreground' aria-hidden='true' />
      <p className='text-sm font-medium text-foreground'>{what}</p>
      <p className='max-w-prose text-sm text-muted-foreground'>
        This populates once MyJKKN scoring is enabled. We only show validated
        results — never an estimated or placeholder score.
      </p>
    </div>
  );
}

/**
 * An empty chart "frame" — communicates WHERE a visual will appear without
 * drawing any axes, gridlines, or fabricated data points. Deliberately blank.
 */
export function ChartFrame({ label }: { label: string }) {
  return (
    <div className='flex h-40 w-full items-center justify-center rounded-md border border-dashed bg-muted/20 text-center'>
      <span className='px-4 text-xs text-muted-foreground'>
        {label} — awaiting MyJKKN scoring
      </span>
    </div>
  );
}
