'use client';

import { useState, useMemo } from 'react';
import { useMyBugReports } from '@/hooks/bug-reports/use-bug-reports';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { BugReportStatus, BugReport } from '@/types/bugs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FileImage,
  RefreshCw,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const statusConfig: Record<
    BugReportStatus,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      colorClass?: string;
      icon: React.ElementType;
      mobileLabel: string;
    }
  > = {
    new: {
      variant: 'default',
      colorClass:
        'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200',
      icon: AlertCircle,
      mobileLabel: 'New'
    },
    seen: {
      variant: 'secondary',
      colorClass:
        'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200',
      icon: Eye,
      mobileLabel: 'Seen'
    },
    in_progress: {
      variant: 'outline',
      colorClass:
        'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
      icon: Clock,
      mobileLabel: 'Progress'
    },
    resolved: {
      variant: 'default',
      colorClass:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
      icon: CheckCircle,
      mobileLabel: 'Fixed'
    },
    wont_fix: {
      variant: 'destructive',
      colorClass:
        'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
      icon: XCircle,
      mobileLabel: 'Closed'
    }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`${config.colorClass} text-xs`}>
      <Icon className='w-3 h-3 mr-1' />
      <span className='hidden sm:inline'>{status.replace('_', ' ')}</span>
      <span className='sm:hidden'>{config.mobileLabel}</span>
    </Badge>
  );
};

// Mobile-optimized bug details component using Sheet
const BugDetailsSheet = ({ bug }: { bug: BugReport }) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='ghost' size='sm' className='h-8 px-2'>
          <Eye className='w-4 h-4 mr-1' />
          <span className='hidden sm:inline'>View</span>
        </Button>
      </SheetTrigger>
      <SheetContent side='bottom' className='h-[80vh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2 text-base'>
            <Bug className='w-4 h-4' />
            {bug.display_id}
          </SheetTitle>
        </SheetHeader>

        <div className='mt-4 space-y-4'>
          {/* Status and Date in compact view */}
          <div className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg'>
            <BugStatusBadge status={bug.status} />
            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Calendar className='w-3 h-3' />
              {new Date(bug.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className='text-sm font-medium mb-2'>Description</h4>
            <p className='text-sm text-muted-foreground'>{bug.description}</p>
          </div>

          {/* Page URL */}
          <div>
            <h4 className='text-sm font-medium mb-2'>Page</h4>
            <a
              href={bug.page_url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800'
            >
              <ExternalLink className='w-3 h-3' />
              <span className='truncate'>{bug.page_url}</span>
            </a>
          </div>

          {/* Screenshot */}
          {bug.screenshot_url && (
            <div>
              <h4 className='text-sm font-medium mb-2'>Screenshot</h4>
              <div className='rounded-lg overflow-hidden border'>
                <Image
                  src={bug.screenshot_url}
                  alt='Bug screenshot'
                  width={400}
                  height={300}
                  className='w-full h-auto'
                />
              </div>
            </div>
          )}

          {/* Console Logs in Accordion */}
          {bug.console_logs && bug.console_logs.length > 0 && (
            <Accordion type='single' collapsible>
              <AccordionItem value='logs'>
                <AccordionTrigger className='text-sm'>
                  Console Logs ({bug.console_logs.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className='rounded bg-slate-950 p-3 overflow-x-auto'>
                    <pre className='text-xs text-slate-100'>
                      <code>{JSON.stringify(bug.console_logs, null, 2)}</code>
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default function LearnerBugReportsPage() {
  const {
    data: reports,
    isLoading,
    error,
    isFetching,
    refetch
  } = useMyBugReports();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter reports based on selected status
  const filteredReports = useMemo(() => {
    if (!reports) return [];
    if (statusFilter === 'all') return reports;
    return reports.filter((report) => report.status === statusFilter);
  }, [reports, statusFilter]);

  // Calculate statistics
  const stats = reports
    ? {
        total: reports.length,
        new: reports.filter((r) => r.status === 'new').length,
        resolved: reports.filter((r) => r.status === 'resolved').length,
        inProgress: reports.filter(
          (r) => r.status === 'in_progress' || r.status === 'seen'
        ).length,
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
        resolved: 0,
        inProgress: 0,
        successRate: 0
      };

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-950'>
      <div className='p-4 pb-20'>
        {/* Header */}
        <div className='mb-6'>
          <div className='flex items-center justify-between mb-2'>
            <h1 className='text-2xl font-bold'>My Bug Reports</h1>
            <div className='flex items-center gap-2'>
              <Button variant='outline' size='sm' asChild>
                <Link href='/learner/bug-leaderboard'>
                  <Trophy className='w-4 h-4 mr-1' />
                  <span className='hidden sm:inline'>Leaderboard</span>
                </Link>
              </Button>
              <Button
                variant='ghost'
                size='icon'
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  <RefreshCw className='w-4 h-4' />
                )}
              </Button>
            </div>
          </div>
          <p className='text-sm text-muted-foreground'>
            Track your contributions
          </p>
        </div>

        {/* Stats Grid - Mobile Optimized */}
        <div className='grid grid-cols-2 gap-3 mb-6'>
          <Card className='bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-0'>
            <CardHeader className='p-4 pb-2'>
              <CardTitle className='text-xs text-blue-600 dark:text-blue-400'>
                Total Reports
              </CardTitle>
            </CardHeader>
            <CardContent className='p-4 pt-0'>
              <div className='text-2xl font-bold text-blue-700 dark:text-blue-300'>
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-0'>
            <CardHeader className='p-4 pb-2'>
              <CardTitle className='text-xs text-green-600 dark:text-green-400'>
                Resolved
              </CardTitle>
            </CardHeader>
            <CardContent className='p-4 pt-0'>
              <div className='text-2xl font-bold text-green-700 dark:text-green-300'>
                {stats.resolved}
              </div>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900 border-0'>
            <CardHeader className='p-4 pb-2'>
              <CardTitle className='text-xs text-yellow-600 dark:text-yellow-400'>
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent className='p-4 pt-0'>
              <div className='text-2xl font-bold text-yellow-700 dark:text-yellow-300'>
                {stats.inProgress}
              </div>
            </CardContent>
          </Card>

          <Card className='bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-0'>
            <CardHeader className='p-4 pb-2'>
              <CardTitle className='text-xs text-purple-600 dark:text-purple-400'>
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent className='p-4 pt-0'>
              <div className='text-2xl font-bold text-purple-700 dark:text-purple-300'>
                {stats.successRate}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Achievement Banner */}
        {stats.total > 0 && (
          <Card className='mb-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 border-orange-200'>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <Trophy className='w-5 h-5 text-orange-500' />
                  <div>
                    <p className='text-sm font-medium'>Bug Hunter</p>
                    <p className='text-xs text-muted-foreground'>
                      {stats.resolved} issues resolved
                    </p>
                  </div>
                </div>
                <Badge variant='outline' className='bg-orange-100'>
                  Level {Math.floor(stats.total / 5) + 1}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Filter Tabs */}
        <Tabs
          value={statusFilter}
          onValueChange={setStatusFilter}
          className='mb-4'
        >
          <TabsList className='grid grid-cols-4 w-full h-10'>
            <TabsTrigger value='all' className='text-xs'>
              All ({stats.total})
            </TabsTrigger>
            <TabsTrigger value='new' className='text-xs'>
              New ({stats.new})
            </TabsTrigger>
            <TabsTrigger value='in_progress' className='text-xs'>
              Progress ({stats.inProgress})
            </TabsTrigger>
            <TabsTrigger value='resolved' className='text-xs'>
              Fixed ({stats.resolved})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Reports List */}
        {isLoading ? (
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='w-8 h-8 animate-spin text-primary' />
          </div>
        ) : error ? (
          <Card className='border-red-200'>
            <CardContent className='p-6 text-center'>
              <XCircle className='w-12 h-12 text-red-500 mx-auto mb-2' />
              <p className='text-sm text-red-600'>Error loading reports</p>
            </CardContent>
          </Card>
        ) : filteredReports.length === 0 ? (
          <Card>
            <CardContent className='p-8 text-center'>
              <Bug className='w-12 h-12 text-muted-foreground mx-auto mb-3' />
              <p className='text-sm font-medium'>
                {statusFilter === 'all'
                  ? 'No bug reports yet'
                  : `No ${statusFilter.replace('_', ' ')} reports`}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                {statusFilter === 'all' &&
                  'Start reporting bugs to see them here'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className='space-y-3'>
            {filteredReports.map((report) => (
              <Card key={report.id} className='overflow-hidden'>
                <CardContent className='p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 mb-1'>
                        <span className='text-xs font-mono text-muted-foreground'>
                          {report.display_id}
                        </span>
                        <BugStatusBadge status={report.status} />
                      </div>
                      <p className='text-sm line-clamp-2 mb-2'>
                        {report.description}
                      </p>
                      <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                        <div className='flex items-center gap-1'>
                          <Calendar className='w-3 h-3' />
                          {new Date(report.created_at).toLocaleDateString()}
                        </div>
                        {report.screenshot_url && (
                          <div className='flex items-center gap-1'>
                            <FileImage className='w-3 h-3' />
                            <span>Screenshot</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <BugDetailsSheet bug={report} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
