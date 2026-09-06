'use client';

// Added: 2026-08-17 (BUG-005837)
//
// A cycle timetable's start_date is also its rotation anchor. Anchor one a few
// working days off from the rest of the college and it rotates permanently out
// of phase — invisible on its own, but a class SHARED with those cohorts then
// shows at a different hour here than it does for everyone else. That is how
// one General English lecture came to be advertised at 11:55 to I B.A History
// and at 14:45 to the four other I-year majors sitting in the same room.
//
// Advisory only. It never blocks the save: a college can have a genuine reason
// to start a programme out of phase, and the author is better placed to judge
// that than this check is.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CycleCalculationService } from '@/lib/services/academic/cycle-calculation-service';
import {
  formatCycleAnchorWarning,
  type CycleAnchorPhaseWarning
} from '@/lib/utils/academic/cycle-anchor-phase';

interface CycleAnchorPhaseWarningProps {
  /** Only cycle-format timetables rotate, so only they can be out of phase. */
  timetableFormat?: string | null;
  institutionId?: string | null;
  /** ISO "YYYY-MM-DD", or null while the author has not picked one yet. */
  startDate?: string | null;
  numCycles?: number | null;
  /** The row's own id when editing, so it is not compared against itself. */
  excludeTimetableId?: string | null;
}

export function CycleAnchorPhaseWarningBanner({
  timetableFormat,
  institutionId,
  startDate,
  numCycles,
  excludeTimetableId
}: CycleAnchorPhaseWarningProps) {
  const [warning, setWarning] = useState<CycleAnchorPhaseWarning | null>(null);

  useEffect(() => {
    if (timetableFormat !== 'cycle' || !institutionId || !startDate || !numCycles) {
      setWarning(null);
      return;
    }

    // The author can still be mid-edit when a response lands; drop stale ones
    // rather than letting an earlier date's verdict overwrite a later one.
    let cancelled = false;

    CycleCalculationService.getAnchorPhaseWarning({
      institutionId,
      startDate,
      numCycles,
      excludeTimetableId
    })
      .then((result) => {
        if (!cancelled) setWarning(result);
      })
      .catch(() => {
        if (!cancelled) setWarning(null);
      });

    return () => {
      cancelled = true;
    };
  }, [timetableFormat, institutionId, startDate, numCycles, excludeTimetableId]);

  if (!warning) return null;

  return (
    <Alert className='mt-2 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'>
      <AlertTriangle className='h-4 w-4 text-amber-600 dark:text-amber-400' />
      <AlertDescription className='text-xs text-amber-800 dark:text-amber-200'>
        {formatCycleAnchorWarning(warning)}
      </AlertDescription>
    </Alert>
  );
}
