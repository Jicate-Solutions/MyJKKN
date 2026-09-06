'use client';

/**
 * The provisional chip on the attendance-marking roster.
 *
 * Spec: specs/provisional-freshers-spec-2026-08-05.md §7.4
 *
 * Migration 20260821010000 puts current-intake learners whose fees are still
 * pending onto the roster. Without a marker that widening trades one silent
 * behaviour for another: today they are missing with no signal, and afterwards
 * they would be present with no signal. The person marking has no other way to
 * know that a name on their screen belongs to someone who has not yet completed
 * admission.
 *
 * The row stays fully interactive on purpose. This is a label, not a gate —
 * Director decision (2026-08-05) is that provisional learners are marked
 * exactly like anyone else and their attendance counts toward the 75% rule.
 *
 * NOT rendered here: the lapse variant ("window lapsed — N days"). It needs a
 * provisional window whose configuration shape is still open (spec §8), and
 * roster membership deliberately does not depend on it.
 */

import { Hourglass } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Compact form, for the marking grid where only an icon fits.
 *
 * Amber rather than red: this is an admission state in progress, not an error
 * and not a warning about the learner.
 */
export function ProvisionalLearnerIndicatorCompact() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className='w-5 h-5 rounded-full flex items-center justify-center cursor-help bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
            aria-label='Provisional — fees pending'
          >
            <Hourglass className='w-3 h-3' aria-hidden='true' />
          </div>
        </TooltipTrigger>
        <TooltipContent side='right'>
          <div className='text-xs'>
            <div className='font-semibold'>Provisional</div>
            <div>Seat reserved, fees pending.</div>
            <div>Attendance is recorded and counts as normal.</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
