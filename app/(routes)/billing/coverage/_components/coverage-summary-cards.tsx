'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { BillCoverageSummary } from '@/types/billing-coverage';

interface CoverageSummaryCardsProps {
  summary: BillCoverageSummary | undefined;
  isLoading: boolean;
}

const nf = new Intl.NumberFormat('en-IN');

/**
 * Four KPI tiles. "Not Generated" is the actionable number and is emphasised;
 * "Cannot Evaluate" is kept visible rather than folded into a gap count,
 * because a learner with no academic year is an unknown, not a confirmed miss.
 */
export function CoverageSummaryCards({
  summary,
  isLoading
}: CoverageSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    );
  }

  // The four verdict tiles sum exactly to Learners In Scope. "Programme Ended"
  // was carved out of Not Generated and never out of Generated, so that identity
  // still holds and the drop in Not Generated is fully accounted for.
  const tiles = [
    {
      label: 'Learners In Scope',
      value: summary?.in_scope ?? 0,
      hint: undefined as string | undefined,
      tone: 'text-foreground'
    },
    {
      label: 'Bill Generated',
      value: summary?.generated ?? 0,
      hint: undefined,
      tone: 'text-green-600 dark:text-green-500'
    },
    {
      label: 'Not Generated',
      value: summary?.not_generated ?? 0,
      hint: undefined,
      tone: 'text-orange-600 dark:text-orange-500'
    },
    {
      label: 'Programme Ended',
      value: summary?.not_applicable ?? 0,
      hint: 'no bill owed for this year',
      tone: 'text-slate-500 dark:text-slate-400'
    },
    {
      label: 'Cannot Evaluate',
      value: summary?.cannot_evaluate ?? 0,
      hint: undefined,
      tone: 'text-muted-foreground'
    }
  ];

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className='p-4'>
              <p className='text-sm text-muted-foreground'>{t.label}</p>
              <p className={`text-2xl font-bold ${t.tone}`}>
                {nf.format(t.value)}
              </p>
              {t.hint && (
                <p className='text-[11px] text-muted-foreground'>{t.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(summary?.excluded_institutions ?? 0) > 0 && (
        <p className='text-xs text-muted-foreground'>
          {nf.format(summary!.excluded_institutions)} institution
          {summary!.excluded_institutions === 1 ? '' : 's'} hidden — never
          generated a bill ({nf.format(summary!.excluded_learners)} learner
          {summary!.excluded_learners === 1 ? '' : 's'}). Use the toggle to
          include them.
        </p>
      )}

      {(summary?.cannot_evaluate ?? 0) > 0 && (
        <p className='text-xs text-muted-foreground'>
          {nf.format(summary!.cannot_evaluate)} learner
          {summary!.cannot_evaluate === 1 ? ' has' : 's have'} no academic year
          on their profile, so coverage cannot be determined for them.
        </p>
      )}

      {/* Named rather than left implicit: without a duration the programme
          window cannot be bounded, so those learners can never be classed
          "Programme Ended" however old their cohort is. */}
      {(summary?.duration_not_set ?? 0) > 0 && (
        <p className='text-xs text-muted-foreground'>
          {nf.format(summary!.duration_not_set)} learner
          {summary!.duration_not_set === 1
            ? "'s programme has"
            : "s' programmes have"}{' '}
          no duration configured, so their course end date is unknown and they
          are always measured against the current year.
        </p>
      )}
    </div>
  );
}
