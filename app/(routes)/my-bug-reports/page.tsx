'use client';

import { useState, useMemo } from 'react';
import { useMyBugReports } from '@/hooks/bug-reports/use-bug-reports';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BugReportStatus, BugReport } from '@/types/bugs';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import {
  Eye,
  Bug,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Trophy,
  Target,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const statusConfig: Record<
    BugReportStatus,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      colorClass?: string;
      icon: React.ElementType;
    }
  > = {
    new: {
      variant: 'default',
      colorClass:
        'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200',
      icon: AlertCircle
    },
    seen: {
      variant: 'secondary',
      colorClass:
        'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200',
      icon: Eye
    },
    in_progress: {
      variant: 'outline',
      colorClass:
        'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
      icon: Clock
    },
    resolved: {
      variant: 'default',
      colorClass:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
      icon: CheckCircle
    },
    wont_fix: {
      variant: 'destructive',
      colorClass:
        'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
      icon: XCircle
    }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.colorClass}>
      <Icon className='w-3 h-3 mr-1' />
      {status.replace('_', ' ')}
    </Badge>
  );
};


export default function MyBugReportsPage() {
  const {
    data: reports,
    isLoading,
    error,
    isFetching,
    refetch
  } = useMyBugReports();

  // Calculate statistics
  const stats = reports
    ? {
        total: reports.length,
        new: reports.filter((r) => r.status === 'new').length,
        seen: reports.filter((r) => r.status === 'seen').length,
        inProgress: reports.filter((r) => r.status === 'in_progress').length,
        resolved: reports.filter((r) => r.status === 'resolved').length,
        wontFix: reports.filter((r) => r.status === 'wont_fix').length,
        successRate:
          reports.length > 0
            ? Math.round(
                (reports.filter((r) => r.status === 'resolved').length /
                  reports.length) *
                  100
              )
            : 0
      }
    : {
        total: 0,
        new: 0,
        seen: 0,
        inProgress: 0,
        resolved: 0,
        wontFix: 0,
        successRate: 0
      };

  // Define columns for DataTable
  const columns: ColumnDef<BugReport>[] = useMemo(
    () => [
      {
        accessorKey: 'display_id',
        header: 'Bug ID',
        cell: ({ row }) => (
          <span className='font-mono font-medium'>
            {row.original.display_id}
          </span>
        )
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <span className='text-sm'>
            {new Date(row.original.created_at).toLocaleDateString()}
          </span>
        )
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className='max-w-md truncate' title={row.original.description}>
            {row.original.description}
          </div>
        )
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <BugStatusBadge status={row.original.status} />
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className='text-center'>
            <Button variant='ghost' size='sm' className='h-8 w-8 p-0' asChild>
              <Link href={`/my-bug-reports/${row.original.id}`}>
                <Eye className='w-4 h-4' />
              </Link>
            </Button>
          </div>
        )
      }
    ],
    []
  );

  return (
    <ContentLayout title='My Bug Reports'>
      <div className='space-y-6'>
        {/* Header with Live Indicator */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>
              My Bug Reports
            </h1>
            <p className='text-muted-foreground mt-1'>
              Track your contributions to platform improvement
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <Button
              variant='outline'
              size='sm'
              asChild
              className='hidden sm:flex'
            >
              <Link href='/bug-leaderboard'>
                <Trophy className='w-4 h-4 mr-2' />
                View Leaderboard
              </Link>
            </Button>
            <Button variant='ghost' size='icon' asChild className='sm:hidden'>
              <Link href='/bug-leaderboard'>
                <Trophy className='w-4 h-4' />
              </Link>
            </Button>
            {isFetching && !isLoading && (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
                <span className='hidden sm:inline'>Updating...</span>
              </div>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          <Card className='bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Reports
              </CardTitle>
              <Bug className='h-4 w-4 text-blue-600' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-700 dark:text-blue-300'>
                {stats.total}
              </div>
              <p className='text-xs text-blue-600 dark:text-blue-400'>
                Bugs reported
              </p>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Resolved</CardTitle>
              <CheckCircle className='h-4 w-4 text-green-600' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-700 dark:text-green-300'>
                {stats.resolved}
              </div>
              <p className='text-xs text-green-600 dark:text-green-400'>
                Successfully fixed
              </p>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900 border-yellow-200 dark:border-yellow-800'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>In Progress</CardTitle>
              <Clock className='h-4 w-4 text-yellow-600' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-700 dark:text-yellow-300'>
                {stats.inProgress + stats.seen}
              </div>
              <p className='text-xs text-yellow-600 dark:text-yellow-400'>
                Being worked on
              </p>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Success Rate
              </CardTitle>
              <TrendingUp className='h-4 w-4 text-purple-600' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-purple-700 dark:text-purple-300'>
                {stats.successRate}%
              </div>
              <p className='text-xs text-purple-600 dark:text-purple-400'>
                Resolution rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Achievement Section */}
        {stats.total > 0 && (
          <Card className='bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 border-orange-200 dark:border-orange-800'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-orange-700 dark:text-orange-300'>
                <Trophy className='w-5 h-5' />
                Your Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center justify-between'>
                <div className='space-y-1'>
                  <p className='text-sm text-orange-600 dark:text-orange-400'>
                    Thank you for helping improve our platform!
                  </p>
                  <div className='flex items-center gap-4 text-sm'>
                    <div className='flex items-center gap-1'>
                      <Target className='w-4 h-4 text-orange-500' />
                      <span>{stats.total} reports submitted</span>
                    </div>
                    <div className='flex items-center gap-1'>
                      <CheckCircle className='w-4 h-4 text-green-500' />
                      <span>{stats.resolved} issues resolved</span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant='outline'
                  className='bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700'
                >
                  Bug Hunter
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading and Error States */}
        {isLoading && (
          <Card>
            <CardContent className='flex items-center justify-center py-12'>
              <div className='text-center space-y-2'>
                <div className='w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto'></div>
                <p className='text-muted-foreground'>Loading your reports...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className='border-red-200 dark:border-red-800'>
            <CardContent className='flex items-center justify-center py-12'>
              <div className='text-center space-y-2'>
                <XCircle className='w-12 h-12 text-red-500 mx-auto' />
                <p className='text-red-600 dark:text-red-400'>
                  Error loading your reports: {error.message}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reports Table using DataTable */}
        {!isLoading && !error && (
          <Card>
            <CardHeader>
              <CardTitle>
                Report History ({reports?.length || 0} reports)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={reports || []}
                onRefresh={refetch}
                searchPlaceholder='Search bug reports...'
                filterColumn='description'
              />

              {(!reports || reports.length === 0) && (
                <div className='text-center py-12 space-y-4 mt-4'>
                  <Bug className='w-16 h-16 text-muted-foreground mx-auto' />
                  <div className='space-y-2'>
                    <h3 className='text-lg font-medium'>No bug reports yet</h3>
                    <p className='text-muted-foreground'>
                      When you submit bug reports, they&apos;ll appear here.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
