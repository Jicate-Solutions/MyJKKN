'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type UnbatchedLearner = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  roll_number?: string | null;
};

/**
 * Notice for a practical period whose batches leave some of the section's
 * learners out. Marking is never blocked — this only says who is missing.
 *
 * Added: 2026-10-10 (BUG-006270 follow-up)
 */
export function UnbatchedLearnersNotice({ learners }: { learners: UnbatchedLearner[] }) {
  if (!learners || learners.length === 0) return null;

  const names = learners
    .map((l) => {
      const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Unnamed learner';
      return l.roll_number ? `${name} (${l.roll_number})` : name;
    })
    .join(', ');
  const count = learners.length;

  return (
    <Card className='mb-4 border-0 shadow-lg border-l-4 border-l-amber-500'>
      <CardContent className='p-5'>
        <div className='flex items-start gap-4'>
          <div className='bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-full flex-shrink-0'>
            <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
          </div>
          <div className='space-y-1'>
            <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
              {count} {count === 1 ? 'learner' : 'learners'} in this section{' '}
              {count === 1 ? 'is' : 'are'} in no practical batch for this period
            </h3>
            <p className='text-sm text-gray-700 dark:text-gray-300'>{names}</p>
            <p className='text-sm text-gray-700 dark:text-gray-300'>
              {count === 1 ? 'This learner does' : 'These learners do'} not appear on any batch&apos;s
              list, so their attendance cannot be marked here. Ask the timetable in-charge to add
              them in Academic &rarr; Timetables &rarr; practical settings.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
