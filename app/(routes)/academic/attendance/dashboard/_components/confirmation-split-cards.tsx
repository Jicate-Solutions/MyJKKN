'use client';

import { useMemo } from 'react';
import { UserCheck, Clock, AlertTriangle, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useConfirmationSplit } from '@/hooks/academic/use-attendance-dashboard';
import { cn } from '@/lib/utils';
import {
  toHierarchyFilter,
  type DashboardFilterState
} from './dashboard-filters';

interface ConfirmationSplitCardsProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  selectedDate?: Date;
  filters?: DashboardFilterState;
  refreshTrigger?: number;
  /** Rolling window for the split. Defaults to the hook's 14 days (Statistics
   *  tab). The Feedback Confirmation tab passes 30 so these cards cover the same
   *  span as the college tables below them. The caption renders this value. */
  windowDays?: number;
}

/**
 * Post-class-feedback attendance-confirmation split.
 *
 * VISIBILITY-ONLY: shows how many "Present" marks are feedback-confirmed vs
 * present-pending (within the 48h window vs overdue). Reads
 * session_feedback.gate_mode — renders nothing when the policy is 'off'. Never
 * changes the official attendance %, eligibility, or the faculty attendance record.
 */
export function ConfirmationSplitCards({
  userInstitutionId,
  canViewAllInstitutions,
  selectedDate = new Date(),
  filters,
  refreshTrigger = 0,
  windowDays: windowDaysProp
}: ConfirmationSplitCardsProps) {
  const queryInstitutionId =
    filters?.institutionId ||
    (canViewAllInstitutions ? undefined : userInstitutionId);

  // Same narrowing as the stat cards above, so the split can't describe a wider
  // population than the numbers it sits under. The rollup RPC has no
  // degree/semester params, so those two levels narrow the cards above but not
  // this split.
  const hierarchy = useMemo(() => toHierarchyFilter(filters), [filters]);

  const { gateMode, windowHours, windowDays, split, isLoading, isError } =
    useConfirmationSplit(
      queryInstitutionId,
      canViewAllInstitutions,
      selectedDate,
      refreshTrigger,
      windowDaysProp,
      hierarchy
    );

  // Resolve state before rendering, in order — this avoids two failure modes:
  //  1. While loading we render nothing (not a skeleton): gateMode isn't known
  //     yet and defaults to 'off', so a skeleton here would briefly FLASH the
  //     section on pages where the policy is genuinely 'off', breaking the
  //     "disappears entirely when off" guarantee. The main stat cards above
  //     already provide loading feedback for this secondary section.
  //  2. On a failed query `data` is undefined → gateMode defaults to 'off';
  //     the error branch MUST come before the off-check or load failures would
  //     render identically to a disabled feature (silent failure).
  if (isLoading) return null;
  if (isError) {
    return (
      <Card>
        <CardContent className='py-4 text-sm text-muted-foreground'>
          Couldn&apos;t load feedback-confirmation data. This does not affect the
          attendance figures above.
        </CardContent>
      </Card>
    );
  }
  if (gateMode === 'off') return null;

  const confirmedPct =
    split && split.totalPresent > 0
      ? Math.round((split.confirmed / split.totalPresent) * 100)
      : 0;

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-baseline gap-x-2'>
        <h3 className='text-lg font-semibold'>Post-Class Feedback Confirmation</h3>
        <span className='text-xs text-muted-foreground'>
          last {windowDays} days
        </span>
      </div>
      <p className='flex items-start gap-1.5 text-xs text-muted-foreground'>
        <Info className='h-3.5 w-3.5 mt-0.5 shrink-0' />
        <span>
          Visibility only — attendance is <em>confirmed</em> once the learner
          submits post-class feedback. This does <strong>not</strong> affect the
          official attendance percentage or any eligibility; unconfirmed marks
          are never counted as absent.
        </span>
      </p>

      <div className='grid gap-4 md:grid-cols-3'>
        <SplitCard
          title='Feedback-Confirmed'
          value={split?.confirmed ?? 0}
          subtitle={`${confirmedPct}% of ${(split?.totalPresent ?? 0).toLocaleString()} marked present`}
          icon={UserCheck}
          color='success'
        />
        <SplitCard
          title='Pending (window open)'
          value={split?.pendingWithin ?? 0}
          subtitle={`feedback window still open (within ${windowHours}h)`}
          icon={Clock}
          color='warning'
        />
        <SplitCard
          title='Overdue'
          value={split?.pendingOverdue ?? 0}
          subtitle={`no feedback past ${windowHours}h`}
          icon={AlertTriangle}
          color='destructive'
        />
      </div>
    </div>
  );
}

function SplitCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ElementType;
  color: 'success' | 'warning' | 'destructive';
}) {
  const colorClasses = {
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    destructive: 'text-red-600 dark:text-red-400'
  };
  const bgClasses = {
    success: 'bg-green-50 dark:bg-green-950/20',
    warning: 'bg-yellow-50 dark:bg-yellow-950/20',
    destructive: 'bg-red-50 dark:bg-red-950/20'
  };

  return (
    <Card className={bgClasses[color]}>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className={cn('h-4 w-4', colorClasses[color])} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', colorClasses[color])}>
          {value.toLocaleString()}
        </div>
        <p className='text-xs text-muted-foreground mt-1'>{subtitle}</p>
      </CardContent>
    </Card>
  );
}
