'use client';

// =============================================================================
// RCLTP Practice — assignment list + "Mark complete" (Phase 4b)
// =============================================================================
// Renders the learner's weekly adaptive-practice assignments with ONLY the real
// counts from each row (exercises_assigned / exercises_completed) — never a
// fabricated progress figure. "Mark complete" posts to the live Phase-3
// service-role route via RcltpScheduleService.recordPracticeCompletion; the
// route derives the learner from the session and verifies ownership, so the
// client cannot self-mark another learner's work. On success we invalidate the
// practice key tree so the row reflects the server's new count/status.
// =============================================================================

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Dumbbell,
  CheckCircle2,
  Clock,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RcltpScheduleService } from '@/lib/services/rcltp/schedule-service';
import { rcltpPracticeKeys } from '@/hooks/rcltp/use-rcltp-schedule';
import type {
  RcltpPracticeAssignment,
  RcltpPracticeStatus,
} from '@/types/rcltp';

const STATUS_LABEL: Record<RcltpPracticeStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  missed: 'Missed',
};

function statusVariant(
  s: RcltpPracticeStatus
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (s === 'assigned' || s === 'in_progress') return 'default';
  if (s === 'completed') return 'secondary';
  if (s === 'missed') return 'destructive';
  return 'outline';
}

/** Format a date-only `week_of` (YYYY-MM-DD) without timezone drift. */
function formatWeekOf(weekOf: string): string {
  // week_of is a DATE; parse the parts directly so we don't shift across TZ.
  const [y, m, d] = weekOf.split('-').map((n) => Number(n));
  if (!y || !m || !d) return weekOf;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PracticeRow({ assignment }: { assignment: RcltpPracticeAssignment }) {
  const qc = useQueryClient();
  const [marking, setMarking] = useState(false);

  const assigned = assignment.exercises_assigned;
  const completed = assignment.exercises_completed;
  // Real numbers only — guard against a zero/over-count divide.
  const pct =
    assigned > 0
      ? Math.min(100, Math.round((completed / assigned) * 100))
      : 0;
  const isDone = assignment.status === 'completed' || completed >= assigned;

  async function handleMarkComplete() {
    setMarking(true);
    try {
      // exercises_completed = the full assigned set (the learner finished it).
      await RcltpScheduleService.recordPracticeCompletion(
        assignment.id,
        assignment.exercises_assigned
      );
      await qc.invalidateQueries({ queryKey: rcltpPracticeKeys.all });
      toast.success('Practice marked complete.');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not mark this practice complete.'
      );
    } finally {
      setMarking(false);
    }
  }

  return (
    <Card>
      <CardContent className='space-y-4 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='flex items-center gap-2 font-medium'>
              <CalendarDays
                className='h-4 w-4 text-muted-foreground'
                aria-hidden='true'
              />
              Week of {formatWeekOf(assignment.week_of)}
            </p>
            <Badge variant={statusVariant(assignment.status)} className='mt-2'>
              {STATUS_LABEL[assignment.status]}
            </Badge>
          </div>
          {isDone ? (
            <Badge variant='secondary' className='shrink-0 gap-1'>
              <CheckCircle2 className='h-3.5 w-3.5' aria-hidden='true' /> Done
            </Badge>
          ) : (
            <Button
              size='sm'
              onClick={handleMarkComplete}
              disabled={marking || assigned === 0}
            >
              {marking ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <CheckCircle2 className='mr-2 h-4 w-4' />
              )}
              Mark complete
            </Button>
          )}
        </div>

        <div className='space-y-1.5'>
          <div className='flex items-center justify-between text-sm text-muted-foreground'>
            <span>Exercises completed</span>
            <span className='font-medium text-foreground'>
              {completed} / {assigned}
            </span>
          </div>
          <Progress value={pct} aria-label={`${completed} of ${assigned} exercises completed`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function PracticeList({
  assignments,
}: {
  assignments: RcltpPracticeAssignment[];
}) {
  if (assignments.length === 0) {
    return (
      <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
        <Clock className='mx-auto mb-2 h-7 w-7' aria-hidden='true' />
        No practice assigned to you yet. Your weekly practice set appears here once
        your teacher schedules it.
      </div>
    );
  }

  // Roll-up across all assignments — real summed counts only, no estimates.
  const totalAssigned = assignments.reduce(
    (sum, a) => sum + a.exercises_assigned,
    0
  );
  const totalCompleted = assignments.reduce(
    (sum, a) => sum + a.exercises_completed,
    0
  );
  const overallPct =
    totalAssigned > 0
      ? Math.min(100, Math.round((totalCompleted / totalAssigned) * 100))
      : 0;

  return (
    <div className='space-y-5'>
      <Card>
        <CardContent className='space-y-2 p-4'>
          <div className='flex items-center justify-between'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              <Dumbbell className='h-4 w-4' aria-hidden='true' /> Overall practice
            </p>
            <p className='text-sm font-medium'>
              {totalCompleted} / {totalAssigned} exercises
            </p>
          </div>
          <Progress
            value={overallPct}
            aria-label={`${totalCompleted} of ${totalAssigned} exercises completed overall`}
          />
        </CardContent>
      </Card>

      <ul className='space-y-3'>
        {assignments.map((a) => (
          <li key={a.id}>
            <PracticeRow assignment={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}
