'use client';

/**
 * The five things the increment engine can conclude, as a readable label.
 *
 * Colours follow design-system/MASTER.md §6: the 700 weight for green and
 * amber, because the 400 ramp measures 1.7–2.8:1 on white and the 600 ramp
 * still fails 4.5:1. Every badge carries text, never colour alone.
 */

import type { IncrementVerdict } from '@/lib/hr/increment-engine';

const LABELS: Record<IncrementVerdict, string> = {
  due: 'Due',
  not_due: 'Not due yet',
  withheld: 'Withheld',
  cannot_tell: 'Cannot tell',
  no_rules: 'No rules',
};

// MEASURED in the running light theme, against the pill's own `bg-muted`
// (#F1F5F9) and NOT against white. That distinction is the whole point: a pill
// does not sit on the page background, and two of the three colours MASTER.md
// clears for white fall below 4.5:1 once the surface is slate-100.
//
//   green-700  #15803D on #F1F5F9  =  4.58:1  ✅
//   amber-700  #B45309 on #F1F5F9  =  4.58:1  ✅
//   red-700    #B91C1C on #F1F5F9  =  5.91:1  ✅
//   foreground #020817 on #F1F5F9  = 18.26:1  ✅
//
// Two rejected first choices, both measured, both failing:
//   red-600            #DC2626 = 4.41:1  ✗  (MASTER.md's 4.83 is against white)
//   text-muted-foreground #64748B = 4.34:1  ✗  (slate-500 on slate-100 is grey
//                                               on grey), so the neutral
//                                               "not due" state uses
//                                               text-foreground.
const CLASSES: Record<IncrementVerdict, string> = {
  due: 'text-green-700 dark:text-emerald-400',
  not_due: 'text-foreground',
  withheld: 'text-red-700 dark:text-red-400',
  cannot_tell: 'text-amber-700 dark:text-amber-400',
  no_rules: 'text-amber-700 dark:text-amber-400',
};

export function IncrementVerdictBadge({ verdict }: { verdict: IncrementVerdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium ${CLASSES[verdict]}`}
    >
      {LABELS[verdict]}
    </span>
  );
}

export const VERDICT_LABELS = LABELS;
export const VERDICT_CLASSES = CLASSES;
