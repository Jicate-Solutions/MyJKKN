'use client';

// Per-learner generation breakdown, driven by the dry-run plan for one learner.
// Shows the lines that WOULD be created (proposed — emphasis) and the lines that
// are already billed and will be skipped (muted), plus the learner's year of
// study. Rendered inside the generate tab's per-row "View" popover.

import type { LearnerGenerationPlan } from '@/lib/services/campus-living/hostel-bill-generation-service';

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

function feeSourceLabel(source?: string | null): string {
  if (!source) return 'Academic';
  return source
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function ResidentFeeDetail({ plan }: { plan: LearnerGenerationPlan }) {
  const hasProposed = plan.proposed.length > 0;
  const hasSkipped = plan.skipped.length > 0;

  return (
    <div className='space-y-3 text-sm'>
      <div className='flex items-center justify-between'>
        <span className='font-medium'>Fee breakdown</span>
        <span className='text-xs text-muted-foreground'>
          {plan.year_of_study === null || plan.year_of_study === undefined
            ? 'Year —'
            : `Year ${plan.year_of_study}`}
        </span>
      </div>

      {!hasProposed && !hasSkipped && (
        <p className='text-xs text-muted-foreground'>
          No applicable fees for this learner.
        </p>
      )}

      {hasProposed && (
        <div className='space-y-1'>
          <p className='text-xs font-medium text-green-700'>
            New bills ({plan.new_count})
          </p>
          <ul className='divide-y rounded-md border'>
            {plan.proposed.map((line, i) => (
              <li
                key={`proposed-${i}`}
                className='flex items-center justify-between px-3 py-1.5'
              >
                <div className='flex flex-col'>
                  <span className='font-medium text-green-800'>
                    {line.category_name}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {feeSourceLabel(line.fee_source)}
                  </span>
                </div>
                <span className='font-mono font-medium text-green-800'>
                  {formatAmount(line.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSkipped && (
        <div className='space-y-1'>
          <p className='text-xs font-medium text-muted-foreground'>
            Already billed — skipped ({plan.skipped.length})
          </p>
          <ul className='divide-y rounded-md border'>
            {plan.skipped.map((line, i) => (
              <li
                key={`skipped-${i}`}
                className='flex items-center justify-between px-3 py-1.5 text-muted-foreground'
              >
                <div className='flex flex-col'>
                  <span>{line.category_name}</span>
                  <span className='text-xs'>{feeSourceLabel(line.fee_source)}</span>
                </div>
                <span className='font-mono line-through'>
                  {formatAmount(line.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
