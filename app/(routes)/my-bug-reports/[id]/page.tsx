'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useBugReport } from '@/hooks/bug-reports/use-bug-reports';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BugReportUserChat } from '../_components/bug-report-user-chat';
import {
  Bug,
  Calendar,
  ExternalLink,
  Monitor,
  Terminal,
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { BugReportStatus } from '@/types/bugs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const statusConfig: Record<
    BugReportStatus,
    {
      colorClass: string;
      icon: React.ElementType;
    }
  > = {
    new: {
      colorClass:
        'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200',
      icon: AlertCircle
    },
    seen: {
      colorClass:
        'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200',
      icon: Eye
    },
    in_progress: {
      colorClass:
        'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
      icon: Clock
    },
    resolved: {
      colorClass:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
      icon: CheckCircle
    },
    wont_fix: {
      colorClass:
        'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
      icon: XCircle
    }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge className={config.colorClass}>
      <Icon className='w-3 h-3 mr-1' />
      {status.replace('_', ' ')}
    </Badge>
  );
};

export default function BugReportDetailPage() {
  const params = useParams();
  const reportId = params.id as string;
  const supabase = createClientSupabaseClient();

  const { data: bugReport, isLoading, error, refetch } = useBugReport(reportId);

  // Set up real-time subscription for this specific bug report
  useEffect(() => {
    if (!reportId) return;

    const channel = supabase
      .channel(`bug_report_${reportId}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'bug_reports',
          filter: `id=eq.${reportId}`
        },
        (payload) => {
          console.log('Bug report detail change detected:', payload);

          if (payload.eventType === 'DELETE') {
            // If the bug report was deleted, redirect back to list
            window.location.href = '/my-bug-reports';
          } else {
            // For updates, refetch the data
            refetch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportId, supabase, refetch]);

  if (isLoading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='flex items-center justify-center py-12'>
          <div className='text-center space-y-2'>
            <div className='w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto'></div>
            <p className='text-muted-foreground'>Loading bug report...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (error || !bugReport) {
    // Check if it's a specific error type
    const isNotFound = error?.message?.includes('404') || error?.message?.includes('not found');
    const isAccessDenied = error?.message?.includes('access denied');

    return (
      <ContentLayout title='Error'>
        <div className='text-center py-12'>
          <Bug className='w-16 h-16 text-muted-foreground mx-auto mb-4' />
          <h2 className='text-xl font-semibold mb-2'>
            {isNotFound ? 'Bug Report Not Found' :
             isAccessDenied ? 'Access Denied' :
             'Error Loading Bug Report'}
          </h2>
          <p className='text-muted-foreground mb-4'>
            {isNotFound ?
              'This bug report may have been deleted by an administrator.' :
             isAccessDenied ?
              'You do not have permission to access this bug report.' :
              'The bug report you\'re looking for doesn\'t exist or you don\'t have access to it.'}
          </p>
          <Button asChild>
            <Link href='/my-bug-reports'>
              <ArrowLeft className='w-4 h-4 mr-2' />
              Back to My Reports
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Bug Report - ${bugReport.display_id}`}>
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <Button variant='ghost' size='sm' asChild>
              <Link href='/my-bug-reports'>
                <ArrowLeft className='w-4 h-4 mr-2' />
              </Link>
            </Button>
            <Separator orientation='vertical' className='h-6' />
            <div>
              <h1 className='text-2xl font-bold'>{bugReport.display_id}</h1>
              <p className='text-muted-foreground'>
                Submitted {new Date(bugReport.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <BugStatusBadge status={bugReport.status} />
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Left Column - Bug Report Details */}
          <div className='space-y-6'>
            {/* Status and Basic Info */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm'>Reported</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='flex items-center gap-2 text-sm'>
                    <Calendar className='w-4 h-4 text-muted-foreground' />
                    {new Date(bugReport.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm'>Page URL</CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={bugReport.page_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 truncate'
                  >
                    <ExternalLink className='w-3 h-3 shrink-0' />
                    <span className='truncate'>{bugReport.page_url}</span>
                  </a>
                </CardContent>
              </Card>
            </div>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Bug className='w-5 h-5' />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm leading-relaxed whitespace-pre-wrap'>
                  {bugReport.description}
                </p>
              </CardContent>
            </Card>

            {/* Screenshot */}
            {bugReport.screenshot_url && (
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
                      src={bugReport.screenshot_url}
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
            {bugReport.console_logs && bugReport.console_logs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Terminal className='w-5 h-5' />
                    Console Logs
                    <Badge variant='outline' className='ml-2'>
                      {bugReport.console_logs.length}
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
                              {JSON.stringify(bugReport.console_logs, null, 2)}
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
            {bugReport.metadata && (
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
                      {(bugReport.metadata as any).userAgent || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Screen Resolution
                    </label>
                    <p className='text-sm mt-1'>
                      {(bugReport.metadata as any).screenResolution ||
                        'Unknown'}
                    </p>
                  </div>
                  {(bugReport.metadata as any).viewport && (
                    <div>
                      <label className='text-sm font-medium text-muted-foreground'>
                        Viewport
                      </label>
                      <p className='text-sm mt-1'>
                        {(bugReport.metadata as any).viewport}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Chat/Communication */}
          <div className='space-y-6'>
            <BugReportUserChat
              reportId={reportId}
              reportStatus={bugReport.status}
            />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
