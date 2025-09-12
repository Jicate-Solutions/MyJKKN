'use client';

import {
  Users,
  UserCheck,
  UserX,
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
import type { DashboardFilterState } from './dashboard-filters';
import { EnhancedDetailedBreakdown } from './enhanced-detailed-breakdown';

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

  console.log('📊 StatisticsCards - Query params:', {
    queryInstitutionId,
    canViewAllInstitutions,
    selectedDate: selectedDate?.toISOString().split('T')[0],
    refreshTrigger,
    filtersInstitution: filters?.institutionId,
    userInstitution: userInstitutionId
  });

  const { stats, isLoading, error, refetch } = useAttendanceStats(
    queryInstitutionId,
    canViewAllInstitutions,
    selectedDate,
    refreshTrigger,
    filters?.academicYearId
  );

  // Calculate aggregate stats across all institutions/selected institution
  const aggregateStats = stats.reduce(
    (acc, institution) => {
      acc.totalStudents += institution.total_students;
      acc.totalPresent += institution.total_present;
      acc.totalAbsent += institution.total_absent;
      return acc;
    },
    { totalStudents: 0, totalPresent: 0, totalAbsent: 0 }
  );

  const overallPercentage =
    aggregateStats.totalStudents > 0
      ? Math.round(
          (aggregateStats.totalPresent / aggregateStats.totalStudents) * 100
        )
      : 0;

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
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <StatCard
            title='Total Students'
            value={aggregateStats.totalStudents}
            subtitle='Students enrolled today'
            icon={Users}
          />
          <StatCard
            title='Present'
            value={aggregateStats.totalPresent}
            subtitle='Students marked present'
            icon={UserCheck}
            color='success'
          />
          <StatCard
            title='Absent'
            value={aggregateStats.totalAbsent}
            subtitle='Students marked absent'
            icon={UserX}
            color='destructive'
          />
          <StatCard
            title='Attendance Rate'
            value={overallPercentage}
            subtitle='Overall percentage'
            icon={TrendingUp}
            color={getAttendanceColor(overallPercentage)}
          />
        </div>
      )}

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
