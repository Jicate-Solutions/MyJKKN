'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';
import type { AttainmentBucket, AttainmentSummary } from '@/types/mark-entry';

interface Props {
  summary: AttainmentSummary;
}

/** Red below 40, amber below 60, emerald at or above. */
function toneFor(pct: number | null): string {
  if (pct == null) return 'bg-muted-foreground/30';
  if (pct < 40) return 'bg-red-500';
  if (pct < 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/**
 * Live class-level CO and Bloom attainment.
 *
 * Only ENTERED marks feed both numerator and denominator — see computeAttainment.
 * That is what keeps the number honest under "answer any N": an optional question
 * a learner skipped is ABSENT, not a zero, so it neither helps nor hurts the CO.
 * The flip side worth knowing when reading this: a CO that appears only on
 * optional questions has a smaller denominator than one on compulsory questions.
 */
export function CoAttainmentBar({ summary }: Props) {
  if (summary.learnersEntered === 0) return null;
  if (summary.co.length === 0 && summary.kLevel.length === 0) return null;

  return (
    <Card>
      <CardContent className='space-y-3 py-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Target className='h-4 w-4 text-muted-foreground' />
          <h3 className='text-sm font-semibold'>Attainment</h3>
          <span className='text-xs text-muted-foreground'>
            live · {summary.learnersEntered} of {summary.learnersTotal} learners entered
          </span>
        </div>

        {summary.co.length > 0 && (
          <BucketGroup title='Course Outcomes' buckets={summary.co} />
        )}
        {summary.kLevel.length > 0 && (
          <BucketGroup title="Bloom's levels" buckets={summary.kLevel} />
        )}

        <p className='text-[11px] text-muted-foreground'>
          Computed from attempted questions only — a question the learner was not
          required to answer is excluded, not counted as zero.
        </p>
      </CardContent>
    </Card>
  );
}

function BucketGroup({ title, buckets }: { title: string; buckets: AttainmentBucket[] }) {
  return (
    <div className='space-y-1.5'>
      <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
        {title}
      </p>
      <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3'>
        {buckets.map((b) => (
          <div key={b.key} className='flex items-center gap-2'>
            <span className='w-10 shrink-0 font-mono text-xs font-medium'>{b.key}</span>
            <div className='h-2 flex-1 overflow-hidden rounded-full bg-muted'>
              <div
                className={cn('h-full rounded-full transition-all', toneFor(b.percentage))}
                style={{ width: `${Math.min(100, b.percentage ?? 0)}%` }}
              />
            </div>
            <span className='w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground'>
              {b.percentage == null ? '—' : `${b.percentage}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
