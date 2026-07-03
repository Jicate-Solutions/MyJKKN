'use client';

// Coordinators' back-mark nudge: surfaces past induction days whose sessions
// still have no attendance marks. Completion requires >=75% attendance, so an
// unmarked past day silently fails every fresher — this keeps the gap visible
// right where the per-day "Day attendance" bulk dialog lives.
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { AttendanceCoverageRow } from '@/lib/services/induction/induction-service';

export function AttendanceCoverageBanner({ coverage }: { coverage: AttendanceCoverageRow[] }) {
  // A day is pending when at least one of its PAST sessions carries no marks.
  // (day_number NULL = the "Unscheduled" bucket — no day dialog, so skip it.)
  const pending = coverage.filter(
    (c) => c.day_number !== null && c.past_sessions > 0 && c.marked_sessions < c.past_sessions,
  );
  if (pending.length === 0) return null;

  const unmarkedSessions = pending.reduce((n, c) => n + (c.past_sessions - c.marked_sessions), 0);
  const dayList = pending.map((c) => c.day_number).join(', ');

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
      <AlertTitle className="text-sm">
        Attendance pending for day{pending.length === 1 ? '' : 's'} {dayList}
      </AlertTitle>
      <AlertDescription className="text-xs">
        {`${unmarkedSessions} past session${unmarkedSessions === 1 ? ' has' : 's have'} no attendance marks yet. Use each day's `}
        <span className="font-medium">Mark day attendance</span>
        {' button to back-mark in one pass — completion counts attendance (≥75%), so unmarked days fail every fresher.'}
      </AlertDescription>
    </Alert>
  );
}
