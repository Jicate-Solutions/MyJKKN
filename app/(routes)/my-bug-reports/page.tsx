'use client';

import { useState, useMemo } from 'react';
import { useMyBugReports } from '@/hooks/bug-reports/use-bug-reports';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { BugReportStatus, BugReport } from '@/types/bugs';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import Image from 'next/image';
import {
  Eye,
  Bug,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Trophy,
  Target,
  TrendingUp,
  Calendar,
  Monitor,
  Terminal,
  ExternalLink,
  FileImage
} from 'lucide-react';

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

const BugDetailsDialog = ({ bug }: { bug: BugReport }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
          <Eye className='w-4 h-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Bug className='w-5 h-5' />
            Bug Report Details - {bug.display_id}
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Status and Basic Info */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm'>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <BugStatusBadge status={bug.status} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm'>Reported</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex items-center gap-2 text-sm'>
                  <Calendar className='w-4 h-4 text-muted-foreground' />
                  {new Date(bug.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm'>Page URL</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={bug.page_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 truncate'
                >
                  <ExternalLink className='w-3 h-3 shrink-0' />
                  <span className='truncate'>{bug.page_url}</span>
                </a>
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <FileImage className='w-5 h-5' />
                Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-sm leading-relaxed whitespace-pre-wrap'>
                {bug.description}
              </p>
            </CardContent>
          </Card>

          {/* Screenshot */}
          {bug.screenshot_url && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Monitor className='w-5 h-5' />
                  Screenshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='relative rounded-lg overflow-hidden border bg-muted'>
                  <Image
                    src={bug.screenshot_url}
                    alt='Bug report screenshot'
                    width={800}
                    height={600}
                    className='w-full h-auto max-h-96 object-contain'
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Console Logs */}
          {bug.console_logs && bug.console_logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Terminal className='w-5 h-5' />
                  Console Logs
                  <Badge variant='outline' className='ml-2'>
                    {bug.console_logs.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type='single' collapsible>
                  <AccordionItem value='console-logs'>
                    <AccordionTrigger className='text-sm'>
                      View Console Output
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className='rounded-md bg-slate-950 dark:bg-slate-900 p-4 overflow-x-auto'>
                        <pre className='text-xs text-slate-100 font-mono'>
                          <code>
                            {JSON.stringify(bug.console_logs, null, 2)}
                          </code>
                        </pre>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* System Info */}
          {bug.metadata && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Monitor className='w-5 h-5' />
                  System Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    User Agent
                  </label>
                  <p className='text-xs mt-1 break-all'>
                    {(bug.metadata as any).userAgent || 'Unknown'}
                  </p>
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Screen Resolution
                  </label>
                  <p className='text-sm mt-1'>
                    {(bug.metadata as any).screenResolution || 'Unknown'}
                  </p>
                </div>
                {(bug.metadata as any).viewport && (
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Viewport
                    </label>
                    <p className='text-sm mt-1'>
                      {(bug.metadata as any).viewport}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
            <BugDetailsDialog bug={row.original} />
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
          {isFetching && !isLoading && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
              <span>Updating...</span>
            </div>
          )}
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
