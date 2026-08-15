'use client';

import { useMemo } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
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
      acc.totalPresent += institution.total_present;
      acc.totalAbsent += institution.total_absent;
      acc.totalMarked += institution.total_marked;
      acc.totalUnmarked += institution.total_unmarked;
      return acc;
    },
    {
      totalStudents: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalMarked: 0,
      totalUnmarked: 0
    }
  );

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
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-5'>
          <StatCard
            title='Total Learners'
            value={aggregateStats.totalStudents}
            subtitle='Admitted, reserved or active — not gated on fees'
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
              college where 92 learners were never marked at all. */}
          <StatCard
            title='Not yet marked'
            value={aggregateStats.totalUnmarked}
            subtitle='Nobody has recorded these learners today'
            icon={UserMinus}
            color='warning'
          />
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
