'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useBugReport,
  useUpdateBugReportStatus,
  useDeleteBugReport
} from '@/hooks/bug-reports/use-bug-reports';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { BugReportStatus } from '@/types/bugs';
import Link from 'next/link';
import Image from 'next/image';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Monitor,
  User,
  Bug,
  FileImage,
  Terminal,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Loader2,
  Download,
  Trash2,
  Building,
  GraduationCap
} from 'lucide-react';
import { BugReportChat } from '../_components/bug-report-chat';
import { ConsoleOutput } from '../_components/console-output';

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const configs = {
    new: {
      variant: 'default' as const,
      className:
        'bg-blue-100 hover:text-white text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200',
      icon: AlertCircle
    },
    seen: {
      variant: 'secondary' as const,
      className:
        'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200',
      icon: Eye
    },
    in_progress: {
      variant: 'outline' as const,
      className:
        'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
      icon: Loader2
    },
    resolved: {
      variant: 'default' as const,
      className:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
      icon: CheckCircle
    },
    wont_fix: {
      variant: 'destructive' as const,
      className:
        'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
      icon: XCircle
    }
  } as const;

  const config = configs[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className='w-3 h-3 mr-1' />
      {status.replace(/_/g, ' ')}
    </Badge>
  );
};

const LoadingSkeleton = () => (
  <div className='space-y-6'>
    <div className='flex items-center gap-4'>
      <Skeleton className='h-10 w-10' />
      <div className='space-y-2'>
        <Skeleton className='h-4 w-48' />
        <Skeleton className='h-3 w-32' />
      </div>
    </div>
    <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
      <div className='lg:col-span-2 space-y-4'>
        <Skeleton className='h-48 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
      <div className='space-y-4'>
        <Skeleton className='h-64 w-full' />
      </div>
    </div>
  </div>
);

export default function BugReportDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const { isSuperAdmin } = usePermissions();
  const [isDownloading, setIsDownloading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: report, isLoading, error, refetch } = useBugReport(id);
  const updateStatusMutation = useUpdateBugReportStatus();
  const deleteReportMutation = useDeleteBugReport();
  const supabase = createClientSupabaseClient();

  // Set up real-time subscription for this specific bug report
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`admin_bug_report_${id}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'bug_reports',
          filter: `id=eq.${id}`
        },
        (payload) => {
          console.log('Admin: Bug report change detected:', payload);

          if (payload.eventType === 'DELETE') {
            // If the bug report was deleted, redirect back to list
            toast({
              title: 'Bug Report Deleted',
              description: 'This bug report was deleted. Redirecting to list...',
              variant: 'destructive',
            });
            setTimeout(() => {
              router.push('/admin/bug-reports');
            }, 2000);
          } else if (payload.eventType === 'UPDATE') {
            // For updates, refetch the data to get latest changes
            refetch();

            // Show notification for status changes
            const newStatus = payload.new?.status;
            const oldStatus = payload.old?.status;
            if (newStatus !== oldStatus) {
              toast({
                title: 'Status Updated',
                description: `Bug report status changed to: ${newStatus.replace('_', ' ')}`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase, refetch, router, toast]);

  const handleStatusChange = async (status: BugReportStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ reportId: id, status });
      toast({
        title: 'Status Updated',
        description: `Report status changed to ${status.replace(/_/g, ' ')}.`
      });
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: 'Could not update the report status.',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteReport = async () => {
    try {
      await deleteReportMutation.mutateAsync(id);
      toast({
        title: 'Bug Report Deleted',
        description: 'The bug report and its associated data have been removed.'
      });
      router.push('/admin/bug-reports');
    } catch (err) {
      toast({
        title: 'Delete Failed',
        description:
          err instanceof Error
            ? err.message
            : 'Could not delete the bug report.',
        variant: 'destructive'
      });
    }
  };

  const handleGoBack = () => {
    router.push('/admin/bug-reports');
  };

  const handleDownloadScreenshot = async () => {
    if (!report?.screenshot_url || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(report.screenshot_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `bug-report-${id}-screenshot.png`;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Download Started',
        description: 'The screenshot download has started.'
      });
    } catch (downloadError) {
      console.error('Download failed:', downloadError);
      toast({
        title: 'Download Failed',
        description: 'Could not download the screenshot.',
        variant: 'destructive'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <AdminPermissionGuard>
        <ContentLayout title='Bug Report Details'>
          <LoadingSkeleton />
        </ContentLayout>
      </AdminPermissionGuard>
    );
  }

  if (error) {
    return (
      <AdminPermissionGuard>
        <ContentLayout title='Bug Report Details'>
          <div className='flex flex-col items-center justify-center py-12'>
            <Bug className='w-16 h-16 text-muted-foreground mb-4' />
            <h2 className='text-2xl font-semibold mb-2'>
              Error Loading Report
            </h2>
            <p className='text-muted-foreground mb-6'>{error.message}</p>
            <div className='flex gap-4'>
              <Button onClick={handleGoBack} variant='outline'>
                <ArrowLeft className='w-4 h-4 mr-2' />
                Go Back
              </Button>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          </div>
        </ContentLayout>
      </AdminPermissionGuard>
    );
  }

  if (!report) {
    return (
      <AdminPermissionGuard>
        <ContentLayout title='Bug Report Details'>
          <div className='flex flex-col items-center justify-center py-12'>
            <Bug className='w-16 h-16 text-muted-foreground mb-4' />
            <h2 className='text-2xl font-semibold mb-2'>Report Not Found</h2>
            <p className='text-muted-foreground mb-6'>
              The bug report you&apos;re looking for doesn&apos;t exist or has
              been removed.
            </p>
            <Button onClick={handleGoBack} variant='outline'>
              <ArrowLeft className='w-4 h-4 mr-2' />
              Go Back
            </Button>
          </div>
        </ContentLayout>
      </AdminPermissionGuard>
    );
  }

  return (
    <AdminPermissionGuard>
      <ContentLayout title='Bug Report Details'>
        <div className='space-y-6'>
          {/* Header with Breadcrumbs and Back Button */}
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div className='space-y-2'>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href='/admin'>Admin</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href='/admin/bug-reports'>
                      Bug Reports
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Report Details</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className='flex items-center gap-3 py-4'>
                <Button
                  onClick={handleGoBack}
                  variant='outline'
                  size='sm'
                  className='shrink-0'
                >
                  <ArrowLeft className='w-4 h-4' />
                </Button>
                <div className='flex items-center gap-2'>
                  <Bug className='w-5 h-5 text-muted-foreground' />
                  <span className='text-sm text-muted-foreground font-mono'>
                    {report.display_id}
                  </span>
                </div>
              </div>
            </div>
            <div className='flex items-center gap-2 hover:text-white'>
              <BugStatusBadge status={report.status} />
            </div>
          </div>

          {/* Main Content Grid */}
          <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
            {/* Report Content - Takes up more space on larger screens */}
            <div className='xl:col-span-2 space-y-6'>
              {/* Description Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <FileImage className='w-5 h-5' />
                    Report Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='prose prose-sm max-w-none dark:prose-invert'>
                    <p className='whitespace-pre-wrap text-sm leading-relaxed'>
                      {report.description}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Screenshot Card */}
              {report.screenshot_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <Monitor className='w-5 h-5' />
                        Screenshot
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={handleDownloadScreenshot}
                        disabled={isDownloading}
                        className='flex items-center gap-2'
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className='w-4 h-4' />
                            Download
                          </>
                        )}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a
                      href={report.screenshot_url}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      <div className='relative rounded-lg overflow-hidden border bg-muted cursor-pointer hover:opacity-90 transition-opacity'>
                        <Image
                          src={report.screenshot_url}
                          alt='Bug report screenshot'
                          width={1200}
                          height={800}
                          className='w-full h-auto'
                          style={{ maxHeight: '600px', objectFit: 'contain' }}
                        />
                        <div className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity'>
                          <div className='flex items-center gap-2 rounded-md bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 dark:bg-slate-900/90 dark:text-slate-50'>
                            <ExternalLink className='h-4 w-4' />
                            View in new tab
                          </div>
                        </div>
                      </div>
                    </a>
                  </CardContent>
                </Card>
              )}

              {/* Console Logs Card */}
              {report.console_logs && report.console_logs.length > 0 && (
                <ConsoleOutput consoleLogs={report.console_logs} />
              )}
            </div>

            {/* Sidebar - Metadata and Actions */}
            <div className='xl:col-span-1 space-y-6'>
              {/* Status & Actions Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-lg'>Status & Actions</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Current Status
                    </label>
                    <div className='mt-1'>
                      <BugStatusBadge status={report.status} />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <label className='text-sm font-medium text-muted-foreground mb-3 block'>
                      Update Status
                    </label>
                    <div className='grid grid-cols-1 gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => handleStatusChange('seen')}
                        disabled={updateStatusMutation.isPending}
                        className='justify-start'
                      >
                        <Eye className='w-4 h-4 mr-2' />
                        Mark Seen
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => handleStatusChange('in_progress')}
                        disabled={updateStatusMutation.isPending}
                        className='justify-start'
                      >
                        <Loader2 className='w-4 h-4 mr-2' />
                        In Progress
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => handleStatusChange('resolved')}
                        disabled={updateStatusMutation.isPending}
                        className='justify-start'
                      >
                        <CheckCircle className='w-4 h-4 mr-2' />
                        Resolved
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => handleStatusChange('wont_fix')}
                        disabled={updateStatusMutation.isPending}
                        className='justify-start'
                      >
                        <XCircle className='w-4 h-4 mr-2' />
                        Won&apos;t Fix
                      </Button>
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <>
                      <Separator />
                      <div>
                        <label className='text-sm font-medium text-muted-foreground mb-3 block'>
                          Danger Zone
                        </label>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setDeleteConfirmOpen(true)}
                          disabled={deleteReportMutation.isPending}
                          className='w-full justify-start border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground'
                        >
                          <Trash2 className='w-4 h-4 mr-2' />
                          Delete Report
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Reporter Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2 text-lg'>
                    <User className='w-5 h-5' />
                    Reporter Info
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Name
                    </label>
                    <p className='text-sm mt-1'>
                      {report.reporter?.full_name || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Email
                    </label>
                    <p className='text-sm mt-1'>
                      {report.reporter?.email || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
                      <Building className='w-4 h-4' />
                      Institution
                    </label>
                    <p className='text-sm mt-1'>
                      {report.institution_name || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
                      <GraduationCap className='w-4 h-4' />
                      Department
                    </label>
                    <p className='text-sm mt-1'>
                      {report.department_name || 'Not specified'}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Page URL
                    </label>
                    <Link
                      href={report.page_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-1 flex items-center gap-1 break-all'
                    >
                      {report.page_url}
                      <ExternalLink className='w-3 h-3 shrink-0' />
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Timestamps Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2 text-lg'>
                    <Clock className='w-5 h-5' />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
                      <Calendar className='w-4 h-4' />
                      Reported At
                    </label>
                    <p className='text-sm mt-1'>
                      {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>
                  {report.resolved_at && (
                    <div>
                      <label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
                        <CheckCircle className='w-4 h-4' />
                        Resolved At
                      </label>
                      <p className='text-sm mt-1'>
                        {new Date(report.resolved_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* System Info Card */}
              {report.metadata && (
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2 text-lg'>
                      <Monitor className='w-5 h-5' />
                      System Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div>
                      <label className='text-sm font-medium text-muted-foreground'>
                        User Agent
                      </label>
                      <p className='text-xs mt-1 break-all'>
                        {(report.metadata as any).userAgent || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <label className='text-sm font-medium text-muted-foreground'>
                        Screen Resolution
                      </label>
                      <p className='text-sm mt-1'>
                        {(report.metadata as any).screenResolution || 'Unknown'}
                      </p>
                    </div>
                    {(report.metadata as any).viewport && (
                      <div>
                        <label className='text-sm font-medium text-muted-foreground'>
                          Viewport
                        </label>
                        <p className='text-sm mt-1'>
                          {(report.metadata as any).viewport}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Chat Section */}
          <div className='mt-8'>
            <BugReportChat reportId={id} reportStatus={report.status} />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                bug report &quot;{report.display_id}&quot; and remove any
                associated screenshot from storage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteReport}
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
