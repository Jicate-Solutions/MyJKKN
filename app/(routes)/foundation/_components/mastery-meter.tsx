'use client';

// Foundation — MasteryMeter (the module's signature element).
//
// A slim four-band gauge that turns a topic's mastery_score into an at-a-glance
// "where am I weak" read. The bands run weak → developing → proficient →
// mastered on a warm-to-green scale anchored on JKKN green (#0b6d41). The
// numeric readout is tabular-nums (examiner's-ledger feel) so columns of scores
// line up down the page. Weak topics are meant to be sorted to the top by the
// caller — this component only renders one row's gauge.

import { cn } from '@/lib/utils';

export type MasteryBand = 'weak' | 'developing' | 'proficient' | 'mastered';

const BANDS: Record<
  MasteryBand,
  { label: string; fill: string; text: string; track: string }
> = {
  weak: {
    label: 'Weak',
    fill: 'bg-red-600',
    text: 'text-red-700 dark:text-red-400',
    track: 'bg-red-100 dark:bg-red-950/40',
  },
  developing: {
    label: 'Developing',
    fill: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    track: 'bg-amber-100 dark:bg-amber-950/40',
  },
  proficient: {
    label: 'Proficient',
    fill: 'bg-emerald-600',
    text: 'text-emerald-700 dark:text-emerald-400',
    track: 'bg-emerald-100 dark:bg-emerald-950/40',
  },
  mastered: {
    label: 'Mastered',
    // Deep JKKN green — the "you're done here" colour.
    fill: 'bg-[#0b6d41]',
    text: 'text-[#0b6d41] dark:text-emerald-300',
    track: 'bg-[#0b6d41]/10',
  },
};

/** Normalise a raw mastery_score (0–1 fraction OR 0–100) to a 0–100 percent. */
export function toPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const pct = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function bandFor(pct: number | null): MasteryBand {
  if (pct === null) return 'weak';
  if (pct < 40) return 'weak';
  if (pct < 60) return 'developing';
  if (pct < 80) return 'proficient';
  return 'mastered';
}

interface MasteryMeterProps {
  /** Raw mastery_score from fp_student_weakness (0–1 or 0–100). */
  score: number | null | undefined;
  /** Optional attempts count shown as a faint suffix. */
  attempts?: number | null;
  className?: string;
  /** Compact mode drops the band label (for dense tables). */
  compact?: boolean;
}

export function MasteryMeter({
  score,
  attempts,
  className,
  compact = false,
}: MasteryMeterProps) {
  const pct = toPercent(score);
  const band = bandFor(pct);
  const meta = BANDS[band];
  const width = pct ?? 0;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative h-2 flex-1 overflow-hidden rounded-full',
          meta.track,
        )}
        role="meter"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Mastery ${pct ?? 0} percent (${meta.label})`}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out',
            meta.fill,
          )}
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="flex shrink-0 items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            meta.text,
          )}
        >
          {pct === null ? '—' : `${pct}%`}
        </span>
        {!compact && (
          <span
            className={cn(
              'text-[11px] font-medium uppercase tracking-wider',
              meta.text,
            )}
          >
            {meta.label}
          </span>
        )}
        {attempts !== null && attempts !== undefined && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {attempts} att
          </span>
        )}
      </div>
    </div>
  );
}
