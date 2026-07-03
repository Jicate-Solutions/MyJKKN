'use client';

// Coordinators' back-mark nudge: surfaces past induction days whose sessions
// still have no attendance marks. Completion requires >=75% attendance, so an
// unmarked past day silently fails every fresher — this keeps the gap visible
// right where the per-day "Day attendance" bulk dialog lives.
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { AttendanceCoverageRow } from '@/lib/services/induction/induction-service';

export function AttendanceCoverageBanner({
  coverage,
  unavailable,
}: {
  coverage: AttendanceCoverageRow[];
  unavailable?: boolean;
}) {
  // A coverage load failure must not read as "all marked" — show a muted note
  // instead of silently hiding (deep-review: silence looks identical to done).
  if (unavailable) {
    return (
      <p className="mb-4 text-xs text-muted-foreground">
        Attendance coverage unavailable right now — reload the page to retry.
      </p>
    );
  }

  // A day is pending while any of its PAST sessions is not FULLY marked —
  // "marked" server-side means every rostered learner has an attendance row,
  // so 1-of-435 marked can't hide a day and fake completeness.
  const pending = coverage.filter(
    (c) => c.day_number !== null && c.past_sessions > 0 && c.marked_sessions < c.past_sessions,
  );
  // day_number NULL = the "Unscheduled" bucket. No day dialog exists for it, so
  // it's surfaced separately (per-session marking) rather than silently dropped.
  const unscheduled = coverage.find((c) => c.day_number === null);
  const unscheduledPending = unscheduled
    ? Math.max(0, unscheduled.past_sessions - unscheduled.marked_sessions)
    : 0;
  if (pending.length === 0 && unscheduledPending === 0) return null;

  const unmarkedSessions = pending.reduce((n, c) => n + (c.past_sessions - c.marked_sessions), 0);
  const dayList = pending.map((c) => c.day_number).join(', ');

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
      <AlertTitle className="text-sm">
        {pending.length > 0
          ? `Attendance pending for day${pending.length === 1 ? '' : 's'} ${dayList}`
          : 'Attendance pending for unscheduled sessions'}
      </AlertTitle>
      <AlertDescription className="text-xs">
        {pending.length > 0 && (
          <>
            {`${unmarkedSessions} past session${unmarkedSessions === 1 ? ' isn’t' : 's aren’t'} fully marked yet. Use each day's `}
            <span className="font-medium">Mark day attendance</span>
            {' button to back-mark in one pass — completion counts attendance (≥75%), so unmarked freshers fail by default.'}
          </>
        )}
        {unscheduledPending > 0 && (
          <>
            {pending.length > 0 ? ' Also: ' : ''}
            {`${unscheduledPending} past unscheduled session${unscheduledPending === 1 ? ' isn’t' : 's aren’t'} fully marked — open each one and use its attendance button.`}
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
