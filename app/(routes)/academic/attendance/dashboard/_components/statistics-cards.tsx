'use client';

import { useMemo } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  CalendarOff,
  TrendingUp,
  Building2,
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttendanceStats } from '@/hooks/academic/use-attendance-dashboard';
import { cn } from '@/lib/utils';
import { toHierarchyFilter, type DashboardFilterState } from './dashboard-filters';
import { EnhancedDetailedBreakdown } from './enhanced-detailed-breakdown';
import { ConfirmationSplitCards } from './confirmation-split-cards';

interface Institution {
  id: string;
  name: string;
}

interface StatisticsCardsProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  institutions: Institution[];
  selectedDate?: Date;
  filters?: DashboardFilterState;
  refreshTrigger?: number;
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  className?: string;
  color?: 'default' | 'success' | 'warning' | 'destructive';
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
  color = 'default'
}: StatCardProps) {
  const colorClasses = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    destructive: 'text-red-600 dark:text-red-400'
  };

  const bgClasses = {
    default: 'bg-muted/50',
    success: 'bg-green-50 dark:bg-green-950/20',
    warning: 'bg-yellow-50 dark:bg-yellow-950/20',
    destructive: 'bg-red-50 dark:bg-red-950/20'
  };

  return (
    <Card className={cn(bgClasses[color], className)}>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className={cn('h-4 w-4', colorClasses[color])} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', colorClasses[color])}>
          {value.toLocaleString()}
        </div>
        {subtitle && (
          <p className='text-xs text-muted-foreground mt-1'>{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className='flex items-center mt-2'>
            <TrendingUp className='h-3 w-3 mr-1 text-green-600' />
            <span className='text-xs text-green-600'>
              +{trend}% from yesterday
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatisticsCards({
  userInstitutionId,
  canViewAllInstitutions,
  institutions,
  selectedDate = new Date(),
  filters,
  refreshTrigger = 0
}: StatisticsCardsProps) {
  // Determine which institution to query based on filters or user permissions
  const queryInstitutionId =
    filters?.institutionId ||
    (canViewAllInstitutions ? undefined : userInstitutionId);

  // Memoised because this object goes into a React Query key. `filters` is page
  // state that is only replaced when a filter actually changes, so its identity
  // is a sound dependency.
  const hierarchy = useMemo(() => toHierarchyFilter(filters), [filters]);

  const { stats, isLoading, error, refetch } = useAttendanceStats(
    queryInstitutionId,
    canViewAllInstitutions,
    selectedDate,
    refreshTrigger,
    filters?.academicYearId,
    hierarchy
  );

  // Calculate aggregate stats across all institutions/selected institution
  const aggregateStats = stats.reduce(
    (acc, institution) => {
      acc.totalStudents += institution.total_students;
      acc.totalActive += institution.total_active;
      acc.totalReserved += institution.total_reserved;
      acc.totalAdmitted += institution.total_admitted;
      acc.totalScheduled += institution.total_scheduled;
      acc.totalScheduledMarked += institution.total_scheduled_marked;
      acc.totalPresent += institution.total_present;
      acc.totalAbsent += institution.total_absent;
      acc.totalMarked += institution.total_marked;
      acc.totalUnmarked += institution.total_unmarked;
      return acc;
    },
    {
      totalStudents: 0,
      totalActive: 0,
      totalReserved: 0,
      totalAdmitted: 0,
      totalScheduled: 0,
      totalScheduledMarked: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalMarked: 0,
      totalUnmarked: 0
    }
  );

  // WHY this card spells out its own arithmetic.
  //
  // This roster counts active + reserved + admitted (Director decision
  // 2026-08-11), while Learner Profiles defaults to its Active tab. On
  // 2026-08-31 that read 512 here and 498 there for Dental — both correct, the
  // difference being exactly 14 reserved learners — and the only way to
  // reconcile them was to query the database. Naming the statuses (the old
  // static subtitle) was not enough; the sizes are what answer "then why 512
  // and not 498?".
  //
  // Zero buckets are omitted rather than printed as "0 admitted", so a college
  // with no pre-enrolment pipeline just reads "498 active".
  const rosterBreakdown = [
    [aggregateStats.totalActive, 'active'],
    [aggregateStats.totalReserved, 'reserved'],
    [aggregateStats.totalAdmitted, 'admitted']
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, label]) => `${(count as number).toLocaleString()} ${label}`)
    .join(' + ');

  // The backlog is TIMETABLE-DRIVEN, not roster-driven.
  //
  // "Not yet marked" used to be total − marked, which counted every learner whose
  // section had no class that day — people nobody could have marked. Measured
  // 2026-08-31: 1,111 of 3,155 estate-wide, and all 357 of Dental's. The number was
  // therefore not a work queue, and a college could never drive it to zero.
  //
  // Subtracting the two SCHEDULED counters (never `totalMarked`) is what keeps this
  // non-negative: 436 learners estate-wide carry a mark while their section has no
  // class that day, so `totalScheduled − totalMarked` would go negative. Clamped
  // anyway rather than ever render "-3 pending".
  const notYetMarked = Math.max(
    aggregateStats.totalScheduled - aggregateStats.totalScheduledMarked,
    0
  );
  const noClassToday = Math.max(
    aggregateStats.totalStudents - aggregateStats.totalScheduled,
    0
  );

  // Against a database where the timetable migration has not landed, every
  // scheduled counter is 0 — which would render a real backlog as "0 pending, all
  // learners have no class", the most misleading state on this screen. So fall
  // back to the roster arithmetic this card used before.
  //
  // Keyed on whether the RPC EMITTED the columns, never on their values: on a
  // Sunday nothing is scheduled anywhere and every counter is legitimately 0,
  // and a value test would silently revert the whole screen on that day.
  const hasSchedulingData = stats.some((i) => i.has_scheduling);

  // Denominator is learners ACTUALLY MARKED (Director decision 2026-08-11).
  // A learner nobody marked is unknown, not absent — counting them against the
  // rate reports a marking backlog as poor attendance. The headline therefore
  // reads higher than it used to; the "Not yet marked" card beside it is what
  // makes that honest rather than flattering, and the two must never be
  // separated.
  const overallPercentage =
    aggregateStats.totalMarked > 0
      ? Math.round(
          (aggregateStats.totalPresent / aggregateStats.totalMarked) * 100
        )
      : 0;

  // Colleges listed with an explicit zero because they hold no learners once
  // this view's narrowing is applied. Named, never silently dropped.
  const emptyViewInstitutions = stats.filter((i) => i.is_empty_view);

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'destructive';
  };

  if (error) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center py-6'>
          <div className='text-center space-y-2'>
            <p className='text-destructive'>
              Error loading attendance statistics
            </p>
            <Button variant='outline' size='sm' onClick={() => refetch()}>
              <RefreshCw className='h-4 w-4 mr-2' />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Stats Cards */}
      {isLoading ? (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-4 w-4' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-7 w-16 mb-1' />
                <Skeleton className='h-3 w-24' />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Six cards once scheduling data is present, five without it. The column
        // count is driven by the same flag that renders the sixth card, so the
        // grid can never be left with a hole.
        <div
          className={cn(
            'grid gap-4 md:grid-cols-2',
            hasSchedulingData ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
          )}
        >
          <StatCard
            title='Total Learners'
            value={aggregateStats.totalStudents}
            // Falls back to naming the statuses when the split is unavailable —
            // i.e. against a database where the breakdown migration has not
            // landed — so the card is never left with a bare, unexplained number.
            subtitle={
              rosterBreakdown || 'Admitted, reserved or active — not gated on fees'
            }
            icon={Users}
          />
          <StatCard
            title='Present'
            value={aggregateStats.totalPresent}
            subtitle='Learners marked present'
            icon={UserCheck}
            color='success'
          />
          <StatCard
            title='Absent'
            value={aggregateStats.totalAbsent}
            subtitle='Learners marked absent'
            icon={UserX}
            color='destructive'
          />
          {/* Ships beside the rate, never without it. Removing this card turns
              "1 present of 1 marked" into a 100% attendance claim over a
              college where 92 learners were never marked at all.

              Now counts only learners a class was actually SCHEDULED for, so the
              number is a work queue a college can drive to zero. "No class today"
              beside it holds the remainder — the two together still account for
              every learner in Total Learners, so nothing is hidden by the change. */}
          <StatCard
            title='Not yet marked'
            value={hasSchedulingData ? notYetMarked : aggregateStats.totalUnmarked}
            subtitle={
              hasSchedulingData
                ? 'Scheduled a class today, not yet recorded'
                : 'Nobody has recorded these learners today'
            }
            icon={UserMinus}
            color='warning'
          />
          {/* Deliberately NOT 'warning': these learners are not a backlog and no
              staff action can clear them — their section has no timetable slot
              today. Before this card existed they were folded into "Not yet
              marked", which is why Dental read 357 pending while its true
              outstanding count was 0. */}
          {hasSchedulingData && (
            <StatCard
              title='No class today'
              value={noClassToday}
              subtitle='No timetable slot scheduled — cannot be marked'
              icon={CalendarOff}
            />
          )}
          <StatCard
            title='Attendance Rate'
            value={overallPercentage}
            subtitle={`Of ${aggregateStats.totalMarked.toLocaleString()} learners actually marked`}
            icon={TrendingUp}
            color={getAttendanceColor(overallPercentage)}
          />
        </div>
      )}

      {/* Colleges that hold learners but none in this view. Listed with the
          reason rather than dropped from the breakdown below (CLAUDE.md #27). */}
      {!isLoading && emptyViewInstitutions.length > 0 && (
        <Card className='border-dashed'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Showing zero, and why
            </CardTitle>
            <CardDescription>
              These colleges have no learners matching the current view — they
              are listed here rather than dropped from the list.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            {emptyViewInstitutions.map((institution) => (
              <Badge
                key={institution.institution_id}
                variant='outline'
                className='font-normal'
              >
                {institution.institution_name}: 0 — no learners admitted in this
                intake yet
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Post-Class Feedback Confirmation split (visibility-only; hidden when
          session_feedback.gate_mode = 'off') */}
      <ConfirmationSplitCards
        userInstitutionId={userInstitutionId}
        canViewAllInstitutions={canViewAllInstitutions}
        selectedDate={selectedDate}
        filters={filters}
        refreshTrigger={refreshTrigger}
      />

      {/* Enhanced Detailed Breakdown */}
      <div>
        <div className='flex items-center justify-between mb-4'>
          <div>
            <h3 className='text-lg font-semibold'>Detailed Breakdown</h3>
            <p className='text-sm text-muted-foreground mt-1'>
              Comprehensive hierarchical view with interactive charts and
              analytics
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>

        <EnhancedDetailedBreakdown
          stats={stats}
          canViewAllInstitutions={canViewAllInstitutions}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
