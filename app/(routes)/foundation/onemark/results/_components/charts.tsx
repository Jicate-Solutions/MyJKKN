'use client';

// OneMark results — the two charts, hand-built.
//
// No chart library: both forms are magnitude-over-a-short-category-list, which
// is a bar and nothing more, and a library would ship a canvas renderer plus a
// second colour system to keep in step with the theme. Both use ONE hue (brand
// green) because both are single-series — a categorical palette would imply an
// identity that is not there — with the value direct-labelled in a text token,
// so nothing is carried by colour alone and both themes read the same.

import { cn } from '@/lib/utils';
import type { ScoreBand, StripRow } from '@/lib/services/onemark/results-service';

const BAR = 'bg-[#0b6d41] dark:bg-emerald-500';
const TRACK = 'bg-muted';

/** How many learners scored in each band. Counts sit under the axis, so the
 *  chart is readable without hovering and needs no separate table view. */
export function ScoreDistribution({ bands, className }: { bands: ScoreBand[]; className?: string }) {
  if (bands.length === 0) return null;
  const peak = Math.max(...bands.map((b) => b.count), 1);
  return (
    <figure className={cn('space-y-3', className)}>
      <figcaption className="text-sm font-medium text-foreground">Score distribution</figcaption>
      <div className="flex h-40 items-end gap-2" role="img" aria-label="Score distribution across the cohort">
        {bands.map((band) => (
          <div key={band.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">{band.count}</span>
            <div className={cn('flex w-full items-end rounded-t-[4px]', TRACK)} style={{ height: '100%' }}>
              <div
                className={cn('w-full rounded-t-[4px]', BAR)}
                style={{ height: `${Math.max(band.count === 0 ? 0 : 4, (band.count / peak) * 100)}%` }}
                title={`${band.count} ${band.count === 1 ? 'learner' : 'learners'} scored ${band.label}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-border pt-2">
        {bands.map((band) => (
          <span key={band.label} className="flex-1 text-center text-[11px] tabular-nums text-muted-foreground">
            {band.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Accuracy per unit or per tag: one thin bar each, percentage direct-labelled,
 *  correct-of-total alongside so a 100% on a single question cannot masquerade
 *  as strength. */
export function AccuracyStrip({
  title,
  rows,
  emptyNote,
  className,
}: {
  title: string;
  rows: StripRow[];
  emptyNote: string;
  className?: string;
}) {
  return (
    <figure className={cn('space-y-3', className)}>
      <figcaption className="text-sm font-medium text-foreground">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyNote}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-sm text-foreground" title={row.label}>
                {row.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.accuracy === null ? 'not attempted' : `${row.accuracy}% · ${row.correct}/${row.total}`}
              </span>
              <div className={cn('col-span-2 h-2 w-full overflow-hidden rounded-full', TRACK)}>
                <div
                  className={cn('h-full rounded-full', BAR)}
                  style={{ width: `${row.accuracy ?? 0}%` }}
                  title={`${row.label}: ${row.correct} of ${row.total} correct`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
