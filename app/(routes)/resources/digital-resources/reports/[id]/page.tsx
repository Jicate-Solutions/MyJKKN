'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  BarChart3,
  Eye,
  Clock,
  Calendar
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useDigitalReports } from '@/hooks/resource/digital/use-digital-reports';
import { DigitalUsageReport } from '@/types/digital-resources';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { useRouter } from 'next/navigation';

// Helper function to get status badge
function getStatusBadge(status: DigitalUsageReport['status']) {
  switch (status) {
    case 'completed':
      return (
        <Badge className='bg-green-100 text-green-800 hover:bg-green-200'>
          <CheckCircle className='h-3.5 w-3.5 mr-1' />
          Completed
        </Badge>
      );
    case 'pending':
      return (
        <Badge className='bg-blue-100 text-blue-800 hover:bg-blue-200'>
          <Clock className='h-3.5 w-3.5 mr-1' />
          Pending
        </Badge>
      );
    case 'processing':
      return (
        <Badge className='bg-yellow-100 text-yellow-800 hover:bg-yellow-200'>
          <AlertTriangle className='h-3.5 w-3.5 mr-1' />
          Processing
        </Badge>
      );
    case 'failed':
      return (
        <Badge className='bg-red-100 text-red-800 hover:bg-red-200'>
          <XCircle className='h-3.5 w-3.5 mr-1' />
          Failed
        </Badge>
      );
    default:
      return null;
  }
}

export default function ReportDetailPage({
  params
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Get report data using hook
  const { useGetReportById, downloadReport } = useDigitalReports();
  const {
    data: report,
    isLoading: reportLoading,
    error
  } = useGetReportById(params.id);

  // Combined loading state
  const isLoading = authLoading || permissionsLoading || reportLoading;

  // Specific permission check
  const canViewReports =
    isSuperAdmin || canAccess('digital_resources.reports', 'view');

  // Initialize Supabase and check auth state
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // Check auth on component mount
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session) {
          console.log(
            'Report Detail: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log('Report Detail: No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Report Detail: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Report Detail: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Report Detail: Auth check error:', error);
        setUser(null);
        setAuthError('Authentication error. Please try again.');
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Report Detail: Auth state changed:', event);
        if (session) {
          console.log('Report Detail: New session user:', session.user.id);
          setUser(session.user);
        } else {
          setUser(null);
        }
      }
    );

    // Cleanup
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Debug permissions once they're loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Report Detail permissions debug:', {
        isSuperAdmin,
        canViewReports: canAccess('digital_resources.reports', 'view')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to view reports
  useEffect(() => {
    if (!isLoading && (!user || !canViewReports)) {
      if (!user) {
        toast.error('You must be logged in to view digital resource reports');
        router.push('/login');
      } else if (!canViewReports) {
        toast.error(
          'You do not have permission to view digital resource reports'
        );
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canViewReports, router]);

  // Handle "not found" case
  useEffect(() => {
    if (error && !isLoading && user && canViewReports) {
      console.error('Error fetching report:', error);

      // Don't call notFound() immediately, let the error state be handled in the UI
      if (
        error.message?.includes('not found') ||
        error.message?.includes('does not exist')
      ) {
        // Will show the not found UI that's already defined in the component
      } else {
        toast.error(`Error: ${error.message || 'Failed to load report'}`);
      }
    }
  }, [error, isLoading, user, canViewReports]);

  const handleDownloadPdf = async () => {
    if (!canViewReports) {
      toast.error('You do not have permission to download reports');
      return;
    }

    try {
      setDownloadingPdf(true);
      await downloadReport(params.id, 'pdf');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF report');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!canViewReports) {
      toast.error('You do not have permission to download reports');
      return;
    }

    try {
      setDownloadingCsv(true);
      await downloadReport(params.id, 'csv');
    } catch (error) {
      console.error('Error downloading CSV:', error);
      toast.error('Failed to export CSV data');
    } finally {
      setDownloadingCsv(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Loading Report...'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/reports'>
                  Usage Reports
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Loading...</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex justify-center items-center min-h-[400px]'>
          <div className='animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full' />
          <span className='ml-2'>Loading report details...</span>
        </div>
      </ContentLayout>
    );
  }

  // Auth error state
  if (authError) {
    return (
      <ContentLayout title='Error'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/reports'>
                  Usage Reports
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Error</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Error</p>
          <p className='text-muted-foreground mb-4'>{authError}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/login')}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // If not authenticated, show error state
  if (!user) {
    return (
      <ContentLayout title='Authentication Required'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/reports'>
                  Usage Reports
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Authentication Required</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to view digital resource reports
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // If no permission to view reports
  if (!canViewReports) {
    return (
      <ContentLayout title='Access Denied'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/reports'>
                  Usage Reports
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Access Denied</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view digital resource reports
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/digital-resources'>
              Return to Digital Resources
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // If there's an error fetching the report
  if (error || !report) {
    return (
      <ContentLayout title='Report Not Found'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/reports'>
                  Usage Reports
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Report Not Found</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8 mt-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Report Not Found
          </p>
          <p className='text-muted-foreground mb-4'>
            {error?.message ||
              'The requested report does not exist or has been deleted.'}
          </p>
          <Button asChild className='mt-4'>
            <Link href='/resources/digital-resources/reports'>
              Return to Reports
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={
        isLoading
          ? 'Loading Report...'
          : `Report: ${
              report?.digital_resource?.digital_resource_name ||
              'Unknown Resource'
            }`
      }
    >
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/reports'>
                Usage Reports
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {isLoading
                ? 'Loading...'
                : `Report #${params.id.substring(0, 8)}`}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6 space-y-6'>
        {isLoading ? (
          <div className='space-y-6'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-8 w-64' />
              <Skeleton className='h-10 w-24' />
            </div>

            <Card>
              <CardHeader>
                <Skeleton className='h-6 w-48 mb-2' />
                <Skeleton className='h-4 w-72' />
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <Skeleton className='h-24 w-full' />
                  <Skeleton className='h-24 w-full' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className='h-6 w-48 mb-2' />
                <Skeleton className='h-4 w-72' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-64 w-full' />
              </CardContent>
            </Card>
          </div>
        ) : report ? (
          <>
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-2xl font-bold mb-1'>
                  {report.digital_resource?.digital_resource_name ||
                    'Unknown Resource'}
                </h2>
                <div className='flex items-center gap-3'>
                  <span className='text-muted-foreground'>
                    {report.report_type === 'detailed'
                      ? 'Detailed Report'
                      : 'Standard Report'}
                  </span>
                  {getStatusBadge(report.status)}
                </div>
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleDownloadCsv}
                  disabled={report.status !== 'completed' || downloadingCsv}
                  className='flex items-center gap-1'
                >
                  {downloadingCsv ? (
                    <>
                      <span className='animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1' />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FileText className='h-4 w-4' />
                      Export CSV
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDownloadPdf}
                  disabled={report.status !== 'completed' || downloadingPdf}
                  className='flex items-center gap-1'
                >
                  {downloadingPdf ? (
                    <>
                      <span className='animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1' />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className='h-4 w-4' />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Report Information</CardTitle>
                <CardDescription>
                  Details about this usage report
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div className='space-y-4'>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Resource
                      </h4>
                      <p className='text-lg'>
                        {report.digital_resource?.digital_resource_name ||
                          'Unknown Resource'}
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        {report.digital_resource?.type || 'Unknown Type'}
                      </p>
                    </div>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Report ID
                      </h4>
                      <p>{report.id}</p>
                    </div>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Report Type
                      </h4>
                      <p className='capitalize'>{report.report_type}</p>
                    </div>
                  </div>

                  <div className='space-y-4'>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Date Period
                      </h4>
                      <div className='flex items-center gap-2'>
                        <Calendar className='h-4 w-4 text-muted-foreground' />
                        <span>
                          {format(new Date(report.start_date), 'MMM d, yyyy')} -{' '}
                          {format(new Date(report.end_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Generated On
                      </h4>
                      <div className='flex items-center gap-2'>
                        <Calendar className='h-4 w-4 text-muted-foreground' />
                        <span>
                          {format(new Date(report.generated_at), 'PPP p')}
                        </span>
                      </div>
                    </div>
                    <div>
                      <h4 className='text-sm font-semibold text-muted-foreground mb-1'>
                        Status
                      </h4>
                      <div className='flex items-center gap-2'>
                        {getStatusBadge(report.status)}
                        {report.status === 'failed' && report.error_message && (
                          <span className='text-sm text-red-500'>
                            {report.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {report.status === 'completed' && report.summary && (
              <Tabs defaultValue='overview' className='w-full'>
                <TabsList className='w-full md:w-auto'>
                  <TabsTrigger
                    value='overview'
                    className='flex items-center gap-1'
                  >
                    <Eye className='h-4 w-4' />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value='analytics'
                    className='flex items-center gap-1'
                  >
                    <BarChart3 className='h-4 w-4' />
                    Usage Analytics
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='overview' className='mt-6'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Usage Summary</CardTitle>
                      <CardDescription>
                        Summary of usage metrics for the selected period
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6'>
                        <div className='bg-primary/5 p-4 rounded-lg'>
                          <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                            Total Views
                          </h3>
                          <p className='text-3xl font-bold'>
                            {report.summary.total_views.toLocaleString()}
                          </p>
                        </div>
                        <div className='bg-primary/5 p-4 rounded-lg'>
                          <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                            Total Downloads
                          </h3>
                          <p className='text-3xl font-bold'>
                            {report.summary.total_downloads.toLocaleString()}
                          </p>
                        </div>
                        <div className='bg-primary/5 p-4 rounded-lg'>
                          <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                            Unique Users
                          </h3>
                          <p className='text-3xl font-bold'>
                            {report.summary.unique_users.toLocaleString()}
                          </p>
                        </div>
                        <div className='bg-primary/5 p-4 rounded-lg'>
                          <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                            Peak Usage
                          </h3>
                          <p className='text-3xl font-bold'>
                            {report.summary.peak_usage_count?.toLocaleString() ||
                              'N/A'}
                          </p>
                          {report.summary.peak_usage_day && (
                            <p className='text-xs text-muted-foreground'>
                              on{' '}
                              {format(
                                new Date(report.summary.peak_usage_day),
                                'MMM d, yyyy'
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className='mt-8'>
                        <h3 className='text-lg font-semibold mb-4'>
                          Key Insights
                        </h3>
                        <ul className='space-y-2'>
                          <li className='flex items-start gap-2'>
                            <CheckCircle className='h-5 w-5 text-green-500 mt-0.5' />
                            <span>
                              Average of{' '}
                              {Math.round(
                                report.summary.total_views /
                                  (Math.ceil(
                                    (new Date(report.end_date).getTime() -
                                      new Date(report.start_date).getTime()) /
                                      (1000 * 60 * 60 * 24)
                                  ) || 30)
                              )}
                              views per day during the reporting period.
                            </span>
                          </li>
                          <li className='flex items-start gap-2'>
                            <CheckCircle className='h-5 w-5 text-green-500 mt-0.5' />
                            <span>
                              Download to view ratio of{' '}
                              {Math.round(
                                (report.summary.total_downloads /
                                  (report.summary.total_views || 1)) *
                                  100
                              )}
                              %, indicating{' '}
                              {report.summary.total_downloads /
                                (report.summary.total_views || 1) >
                              0.3
                                ? 'high'
                                : 'moderate'}
                              engagement with content.
                            </span>
                          </li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='analytics' className='mt-6'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Usage Analytics</CardTitle>
                      <CardDescription>
                        Detailed usage analytics for the selected period
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {report.report_type === 'detailed' ? (
                        <div className='space-y-8'>
                          <div>
                            <h3 className='text-lg font-semibold mb-4'>
                              Usage by Device Type
                            </h3>
                            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                              <div className='bg-primary/5 p-4 rounded-lg'>
                                <h4 className='text-sm font-medium text-muted-foreground mb-1'>
                                  Desktop
                                </h4>
                                <p className='text-2xl font-bold'>
                                  {report.summary.device_breakdown?.desktop ||
                                    'N/A'}
                                </p>
                                <p className='text-xs text-muted-foreground'>
                                  {report.summary.device_breakdown?.desktop
                                    ? Math.round(
                                        (report.summary.device_breakdown
                                          .desktop /
                                          report.summary.total_views) *
                                          100
                                      )
                                    : 0}
                                  % of total views
                                </p>
                              </div>
                              <div className='bg-primary/5 p-4 rounded-lg'>
                                <h4 className='text-sm font-medium text-muted-foreground mb-1'>
                                  Mobile
                                </h4>
                                <p className='text-2xl font-bold'>
                                  {report.summary.device_breakdown?.mobile ||
                                    'N/A'}
                                </p>
                                <p className='text-xs text-muted-foreground'>
                                  {report.summary.device_breakdown?.mobile
                                    ? Math.round(
                                        (report.summary.device_breakdown
                                          .mobile /
                                          report.summary.total_views) *
                                          100
                                      )
                                    : 0}
                                  % of total views
                                </p>
                              </div>
                              <div className='bg-primary/5 p-4 rounded-lg'>
                                <h4 className='text-sm font-medium text-muted-foreground mb-1'>
                                  Tablet
                                </h4>
                                <p className='text-2xl font-bold'>
                                  {report.summary.device_breakdown?.tablet ||
                                    'N/A'}
                                </p>
                                <p className='text-xs text-muted-foreground'>
                                  {report.summary.device_breakdown?.tablet
                                    ? Math.round(
                                        (report.summary.device_breakdown
                                          .tablet /
                                          report.summary.total_views) *
                                          100
                                      )
                                    : 0}
                                  % of total views
                                </p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className='text-lg font-semibold mb-4'>
                              Top Referring Sources
                            </h3>
                            <div className='space-y-3'>
                              {report.summary.referrers &&
                              report.summary.referrers.length > 0 ? (
                                report.summary.referrers
                                  .slice(0, 5)
                                  .map((referrer, index) => (
                                    <div
                                      key={index}
                                      className='flex items-center justify-between border-b pb-2'
                                    >
                                      <span className='font-medium'>
                                        {referrer.source || 'Direct'}
                                      </span>
                                      <div className='flex items-center gap-2'>
                                        <span>{referrer.count}</span>
                                        <span className='text-xs text-muted-foreground'>
                                          (
                                          {Math.round(
                                            (referrer.count /
                                              (report.summary?.total_views ||
                                                1)) *
                                              100
                                          )}
                                          %)
                                        </span>
                                      </div>
                                    </div>
                                  ))
                              ) : (
                                <p className='text-muted-foreground'>
                                  No referrer data available
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <h3 className='text-lg font-semibold mb-4'>
                              User Demographics
                            </h3>
                            {report.summary.user_demographics ? (
                              <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
                                <div>
                                  <h4 className='text-sm font-medium mb-2'>
                                    By Role
                                  </h4>
                                  <div className='space-y-2'>
                                    {Object.entries(
                                      report.summary.user_demographics
                                        .by_role || {}
                                    ).map(([role, count]) => (
                                      <div
                                        key={role}
                                        className='flex items-center justify-between'
                                      >
                                        <span className='capitalize'>
                                          {role}
                                        </span>
                                        <span>{count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h4 className='text-sm font-medium mb-2'>
                                    By Department
                                  </h4>
                                  <div className='space-y-2'>
                                    {Object.entries(
                                      report.summary.user_demographics
                                        .by_department || {}
                                    ).map(([dept, count]) => (
                                      <div
                                        key={dept}
                                        className='flex items-center justify-between'
                                      >
                                        <span>{dept || 'Unspecified'}</span>
                                        <span>{count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className='text-muted-foreground'>
                                No demographic data available
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className='text-center py-8'>
                          <AlertTriangle className='h-8 w-8 text-amber-500 mx-auto mb-2' />
                          <p>
                            Detailed analytics are only available for detailed
                            reports
                          </p>
                          <p className='text-sm text-muted-foreground mt-1'>
                            This is a standard report. Generate a detailed
                            report to see advanced analytics.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </>
        ) : null}
      </div>
    </ContentLayout>
  );
}
