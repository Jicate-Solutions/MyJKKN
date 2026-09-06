'use client';

/**
 * Round picker — horizontal scrollable chip row.
 *
 * Mobile: snap-scroll chips, 44px tap targets.
 * Desktop: same layout, never wraps awkwardly.
 *
 * Each chip shows the round name (e.g., "CIA 1") and a max-marks hint
 * (sum of components × max). Active chip uses primary background.
 */

import { cn } from '@/lib/utils';
import type { CiaViewRound } from '@/types/my-marks';

interface Props {
  rounds: CiaViewRound[];
  value?: number;
  onChange: (round: number) => void;
}

function roundMax(round: CiaViewRound): number {
  return (round.components ?? []).reduce((acc, c) => acc + (c.max_marks ?? 0), 0);
}

export function RoundPicker({ rounds, value, onChange }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto scrollbar-thin scroll-smooth snap-x snap-mandatory pb-1"
      role="tablist"
      aria-label="Round selector"
    >
      {[...rounds]
        .sort((a, b) => a.round - b.round)
        .map((r) => {
          const isActive = r.round === value;
          const max = roundMax(r);
          return (
            <button
              key={r.round}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(r.round)}
              className={cn(
                'snap-start flex-shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-all',
                'min-h-[32px]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span>{r.round_name}</span>
              {max > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  / {max}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}
