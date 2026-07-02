'use client';

import { UserCheck, Clock, AlertTriangle, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirmationSplit } from '@/hooks/academic/use-attendance-dashboard';
import { cn } from '@/lib/utils';
import type { DashboardFilterState } from './dashboard-filters';

interface ConfirmationSplitCardsProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  selectedDate?: Date;
  filters?: DashboardFilterState;
  refreshTrigger?: number;
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
  refreshTrigger = 0
}: ConfirmationSplitCardsProps) {
  const queryInstitutionId =
    filters?.institutionId ||
    (canViewAllInstitutions ? undefined : userInstitutionId);

  const { gateMode, windowHours, split, isLoading, isError } =
    useConfirmationSplit(
      queryInstitutionId,
      canViewAllInstitutions,
      selectedDate,
      refreshTrigger
    );

  // Policy disables the layer → surface nothing. Keep rendering while loading
  // (gateMode defaults to 'off' before data arrives) so the skeleton shows.
  if (gateMode === 'off' && !isLoading) return null;

  const confirmedPct =
    split && split.totalPresent > 0
      ? Math.round((split.confirmed / split.totalPresent) * 100)
      : 0;

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <h3 className='text-lg font-semibold'>Post-Class Feedback Confirmation</h3>
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

      {isLoading ? (
        <div className='grid gap-4 md:grid-cols-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-4' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-7 w-16 mb-1' />
                <Skeleton className='h-3 w-28' />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className='py-4 text-sm text-muted-foreground'>
            Couldn&apos;t load feedback-confirmation data. This does not affect the
            attendance figures above.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 md:grid-cols-3'>
          <SplitCard
            title='Feedback-Confirmed'
            value={split?.confirmed ?? 0}
            subtitle={`${confirmedPct}% of ${(split?.totalPresent ?? 0).toLocaleString()} marked present`}
            icon={UserCheck}
            color='success'
          />
          <SplitCard
            title='Present-Pending'
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
      )}
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
