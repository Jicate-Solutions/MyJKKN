'use client';
/**
 * Renders a small progress indicator showing N/4 fields filled.
 * Colour reflects severity: red (critical) → amber (needs work) → emerald (almost).
 */

interface CompletionProgressCellProps {
  filled: number;        // 0..4
  percent: number;       // 0..100
}

export function CompletionProgressCell({ filled, percent }: CompletionProgressCellProps) {
  const colour =
    filled <= 1
      ? 'bg-red-500'
      : filled === 2
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const text =
    filled <= 1
      ? 'text-red-700 dark:text-red-300'
      : filled === 2
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-emerald-700 dark:text-emerald-300';

  return (
    <div className="space-y-1 min-w-[60px]">
      <div className={`text-xs font-semibold ${text}`}>
        {filled}/4
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full transition-all ${colour}`}
          style={{ width: `${percent}%` }}
          aria-label={`${percent}% complete`}
        />
      </div>
    </div>
  );
}
