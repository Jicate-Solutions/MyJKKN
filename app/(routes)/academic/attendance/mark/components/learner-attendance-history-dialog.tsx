'use client';

// Updated: 2026-09-07 - Per-learner attendance history, opened from the roster
// on the marking screen.
//
// The Senior Learner marking a register could see today's roster and nothing
// else. This dialog answers "which days did this learner come, and which days
// was he absent" without leaving the screen.
//
// It renders THREE states per day and never two. A day the section's register
// exists for but where this learner has no entry is shown as "not marked for
// this learner", in its own colour, with its own count — it is never drawn as
// an absence, and it is never folded into the percentage. The rule itself lives
// in lib/utils/academic/learner-attendance-history.ts under unit test; this file
// only draws it.

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Loader2,
  Briefcase,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import {
  buildLearnerAttendanceHistory,
  LEARNER_ATTENDANCE_DAY_LABEL,
  type LearnerAttendanceDay,
  type LearnerAttendanceDayState,
  type LearnerAttendanceHistory
} from '@/lib/utils/academic/learner-attendance-history';

/**
 * Default window. The section's registers only go back as far as the term does,
 * so a wider window costs nothing and a narrower one hides days that exist.
 */
export const LEARNER_ATTENDANCE_HISTORY_DAYS = 60;

interface LearnerAttendanceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string | null;
  learnerName: string;
  rollNumber?: string | null;
  sectionId: string | null;
  sectionName?: string | null;
}

const DAY_STATE_STYLES: Record<
  LearnerAttendanceDayState,
  { badge: string; row: string }
> = {
  present: {
    badge:
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700',
    row: 'border-l-4 border-l-green-500'
  },
  absent: {
    badge:
      'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700',
    row: 'border-l-4 border-l-red-500'
  },
  on_duty: {
    badge:
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
    row: 'border-l-4 border-l-blue-500'
  },
  other: {
    badge:
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700',
    row: 'border-l-4 border-l-purple-500'
  },
  // Deliberately grey, not red. An unmarked day is missing information, not a
  // missed class, and colouring it like an absence is the exact confusion this
  // dialog exists to remove.
  unmarked: {
    badge:
      'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
    row: 'border-l-4 border-l-gray-400 border-dashed'
  }
};

function DayStateIcon({ state }: { state: LearnerAttendanceDayState }) {
  if (state === 'present') return <Check className='h-3.5 w-3.5' />;
  if (state === 'absent') return <X className='h-3.5 w-3.5' />;
  if (state === 'on_duty') return <Briefcase className='h-3.5 w-3.5' />;
  if (state === 'other') return <CircleHelp className='h-3.5 w-3.5' />;
  return <CalendarDays className='h-3.5 w-3.5' />;
}

function formatDayLabel(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'EEE, d MMM yyyy');
  } catch {
    return isoDate;
  }
}

function SummaryTile({
  label,
  value,
  tone,
  hint
}: {
  label: string;
  value: string;
  tone: string;
  hint?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-3', tone)}>
      <div className='text-xl font-semibold leading-tight'>{value}</div>
      <div className='text-xs font-medium mt-0.5'>{label}</div>
      {hint && <div className='text-[11px] opacity-80 mt-1'>{hint}</div>}
    </div>
  );
}

function DayRow({ day }: { day: LearnerAttendanceDay }) {
  const [expanded, setExpanded] = useState(false);
  const styles = DAY_STATE_STYLES[day.state];

  return (
    <div className={cn('rounded-md bg-white dark:bg-gray-900/40', styles.row)}>
      <button
        type='button'
        onClick={() => setExpanded((value) => !value)}
        className='w-full flex items-center justify-between gap-3 px-3 py-2 text-left'
      >
        <div className='min-w-0'>
          <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
            {formatDayLabel(day.date)}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400'>
            {day.markedPeriodCount} of {day.periods.length}{' '}
            {day.periods.length === 1 ? 'period' : 'periods'} recorded for this
            learner
          </div>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <Badge
            variant='outline'
            className={cn('text-xs flex items-center gap-1', styles.badge)}
          >
            <DayStateIcon state={day.state} />
            <span>
              {day.state === 'unmarked'
                ? 'Not marked'
                : LEARNER_ATTENDANCE_DAY_LABEL[day.state]}
            </span>
          </Badge>
          {expanded ? (
            <ChevronDown className='h-4 w-4 text-gray-400' />
          ) : (
            <ChevronRight className='h-4 w-4 text-gray-400' />
          )}
        </div>
      </button>

      {expanded && (
        <div className='px-3 pb-3 flex flex-wrap gap-1.5'>
          {day.periods.map((period) => {
            const state: LearnerAttendanceDayState = period.status ?? 'unmarked';
            return (
              <Badge
                key={period.periodKey}
                variant='outline'
                className={cn(
                  'text-[11px] font-normal',
                  DAY_STATE_STYLES[state].badge
                )}
              >
                <Clock className='h-3 w-3 mr-1' />
                {period.periodName || 'Period'}
                {period.courseName ? ` · ${period.courseName}` : ''}
                {' — '}
                {period.status === null
                  ? 'not marked'
                  : period.rawStatus || LEARNER_ATTENDANCE_DAY_LABEL[state]}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LearnerAttendanceHistoryDialog({
  open,
  onOpenChange,
  learnerId,
  learnerName,
  rollNumber,
  sectionId,
  sectionName
}: LearnerAttendanceHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LearnerAttendanceHistory | null>(null);

  const toDate = format(new Date(), 'yyyy-MM-dd');
  const fromDate = format(
    subDays(new Date(), LEARNER_ATTENDANCE_HISTORY_DAYS - 1),
    'yyyy-MM-dd'
  );

  const load = useCallback(async () => {
    if (!learnerId || !sectionId) {
      setHistory(null);
      setError(
        'This learner has no section on the register being marked, so a section history cannot be shown.'
      );
      return;
    }

    setLoading(true);
    setError(null);

    const result = await FacultyAttendanceService.getLearnerAttendanceHistory({
      learnerId,
      sectionId,
      fromDate,
      toDate
    });

    if (result.error) {
      setHistory(null);
      setError(result.error);
    } else {
      setHistory(buildLearnerAttendanceHistory(result.rows));
    }

    setLoading(false);
  }, [learnerId, sectionId, fromDate, toDate]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const summary = history?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[85vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Attendance history — {learnerName}</DialogTitle>
          <DialogDescription>
            {rollNumber ? `Roll ${rollNumber} · ` : ''}
            {sectionName ? `${sectionName} · ` : ''}
            {format(parseISO(fromDate), 'd MMM yyyy')} to{' '}
            {format(parseISO(toDate), 'd MMM yyyy')} (last{' '}
            {LEARNER_ATTENDANCE_HISTORY_DAYS} days), this section only.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className='flex items-center justify-center gap-2 py-12 text-sm text-gray-600 dark:text-gray-300'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Reading attendance history…
          </div>
        )}

        {!loading && error && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription className='space-y-2'>
              <div>{error}</div>
              <Button size='sm' variant='outline' onClick={() => void load()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!loading && !error && summary && (
          <>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
              <SummaryTile
                label='Days present'
                value={String(summary.presentDays)}
                tone='border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200'
              />
              <SummaryTile
                label='Days absent'
                value={String(summary.absentDays)}
                tone='border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200'
              />
              <SummaryTile
                label='Days on duty'
                value={String(summary.onDutyDays)}
                tone='border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
              />
              <SummaryTile
                label='Never marked'
                value={String(summary.unmarkedDays)}
                hint='Register exists, this learner is not in it'
                tone='border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
              />
            </div>

            <div className='rounded-lg border border-gray-200 dark:border-gray-700 p-3'>
              <div className='flex items-baseline gap-2'>
                <span className='text-2xl font-semibold text-gray-900 dark:text-gray-100'>
                  {summary.presentPercent === null
                    ? 'Not known'
                    : `${summary.presentPercent}%`}
                </span>
                <span className='text-sm text-gray-600 dark:text-gray-400'>
                  present
                </span>
              </div>
              <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>
                {summary.presentPercent === null
                  ? `No day in this window has a status recorded for this learner, so no rate can be worked out. ${summary.unmarkedDays} ${summary.unmarkedDays === 1 ? 'day was' : 'days were'} marked for the section but not for this learner.`
                  : `Out of the ${summary.markedDays} ${summary.markedDays === 1 ? 'day' : 'days'} actually marked for this learner. A further ${summary.unmarkedDays} ${summary.unmarkedDays === 1 ? 'day is' : 'days are'} not counted here — the section's register exists but this learner has no entry in it. Those are not absences.`}
              </p>
            </div>

            {history && history.days.length === 0 ? (
              <div className='py-10 text-center text-sm text-gray-600 dark:text-gray-400'>
                No register was recorded for this section in this window, so
                there is nothing to show yet.
              </div>
            ) : (
              <ScrollArea className='flex-1 min-h-0 pr-3'>
                <div className='space-y-2'>
                  {history?.days.map((day) => (
                    <DayRow key={day.date} day={day} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
