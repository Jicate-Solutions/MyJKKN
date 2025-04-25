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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Get report data using hook
  const { useGetReportById, downloadReport } = useDigitalReports();
  const { data: report, isLoading, error } = useGetReportById(params.id);

  // Handle "not found" case
  useEffect(() => {
    if (error) {
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
  }, [error]);

  const handleDownloadPdf = async () => {
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
                          <li className='flex items-start gap-2'>
                            <CheckCircle className='h-5 w-5 text-green-500 mt-0.5' />
                            <span>
                              Each user accessed content approximately{' '}
                              {Math.round(
                                report.summary.total_views /
                                  (report.summary.unique_users || 1)
                              )}
                              times on average.
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
                        Detailed analysis of resource usage patterns
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='h-[300px] flex items-center justify-center bg-muted/30 rounded-md border border-dashed'>
                        <div className='text-center'>
                          <BarChart3 className='h-12 w-12 mx-auto text-muted-foreground' />
                          <h3 className='mt-2 font-medium'>
                            Usage Analytics Visualization
                          </h3>
                          <p className='text-sm text-muted-foreground'>
                            In a real implementation, this would display charts
                            and graphs showing usage patterns over time
                          </p>
                        </div>
                      </div>

                      <div className='mt-8 space-y-6'>
                        <div>
                          <h3 className='text-lg font-semibold mb-2'>
                            User Demographics
                          </h3>
                          <p className='text-muted-foreground mb-4'>
                            Breakdown of users accessing this resource by
                            department and role
                          </p>
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <div className='bg-primary/5 p-4 rounded-lg'>
                              <h4 className='font-medium mb-2'>
                                Top Departments
                              </h4>
                              <ul className='space-y-2'>
                                <li className='flex justify-between'>
                                  <span>Computer Science</span>
                                  <span className='font-medium'>32%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Engineering</span>
                                  <span className='font-medium'>28%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Business School</span>
                                  <span className='font-medium'>15%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Other</span>
                                  <span className='font-medium'>25%</span>
                                </li>
                              </ul>
                            </div>
                            <div className='bg-primary/5 p-4 rounded-lg'>
                              <h4 className='font-medium mb-2'>User Roles</h4>
                              <ul className='space-y-2'>
                                <li className='flex justify-between'>
                                  <span>Students</span>
                                  <span className='font-medium'>65%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Faculty</span>
                                  <span className='font-medium'>20%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Researchers</span>
                                  <span className='font-medium'>12%</span>
                                </li>
                                <li className='flex justify-between'>
                                  <span>Staff</span>
                                  <span className='font-medium'>3%</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className='text-lg font-semibold mb-2'>
                            Content Popularity
                          </h3>
                          <p className='text-muted-foreground mb-4'>
                            Most accessed content within this digital resource
                          </p>
                          <div className='overflow-x-auto'>
                            <table className='w-full border-collapse'>
                              <thead>
                                <tr className='border-b'>
                                  <th className='text-left py-2 font-medium'>
                                    Content Title
                                  </th>
                                  <th className='text-right py-2 font-medium'>
                                    Views
                                  </th>
                                  <th className='text-right py-2 font-medium'>
                                    Downloads
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className='border-b'>
                                  <td className='py-2'>
                                    Advanced Machine Learning Techniques
                                  </td>
                                  <td className='text-right py-2'>245</td>
                                  <td className='text-right py-2'>87</td>
                                </tr>
                                <tr className='border-b'>
                                  <td className='py-2'>
                                    Introduction to Neural Networks
                                  </td>
                                  <td className='text-right py-2'>198</td>
                                  <td className='text-right py-2'>62</td>
                                </tr>
                                <tr className='border-b'>
                                  <td className='py-2'>
                                    Blockchain Technology in Finance
                                  </td>
                                  <td className='text-right py-2'>156</td>
                                  <td className='text-right py-2'>43</td>
                                </tr>
                                <tr className='border-b'>
                                  <td className='py-2'>
                                    Sustainable Energy Solutions
                                  </td>
                                  <td className='text-right py-2'>132</td>
                                  <td className='text-right py-2'>38</td>
                                </tr>
                                <tr>
                                  <td className='py-2'>
                                    Quantum Computing: Current State
                                  </td>
                                  <td className='text-right py-2'>118</td>
                                  <td className='text-right py-2'>29</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            {report.status === 'processing' && (
              <Card>
                <CardHeader>
                  <CardTitle>Report Processing</CardTitle>
                  <CardDescription>
                    Your report is being generated
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col items-center justify-center py-12'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4'></div>
                  <h3 className='text-xl font-semibold mb-2'>
                    Processing Report
                  </h3>
                  <p className='text-muted-foreground text-center max-w-md'>
                    This report is currently being generated. It might take a
                    few minutes to complete. You can check back later or wait on
                    this page.
                  </p>
                </CardContent>
              </Card>
            )}

            {report.status === 'failed' && (
              <Card className='border-red-200'>
                <CardHeader>
                  <CardTitle className='text-red-700'>
                    Report Generation Failed
                  </CardTitle>
                  <CardDescription>
                    There was an error generating this report
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='bg-red-50 p-4 rounded-md border border-red-200 mb-4'>
                    <div className='flex items-start gap-3'>
                      <XCircle className='h-5 w-5 text-red-500 mt-0.5' />
                      <div>
                        <h3 className='font-medium text-red-700 mb-1'>
                          Error Message
                        </h3>
                        <p className='text-red-600'>
                          {report.error_message ||
                            'An unknown error occurred during report generation.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className='space-y-4'>
                    <h3 className='font-medium'>Possible solutions:</h3>
                    <ul className='space-y-2'>
                      <li className='flex items-start gap-2'>
                        <span className='h-5 w-5 bg-muted text-primary rounded-full flex items-center justify-center text-xs font-bold'>
                          1
                        </span>
                        <span>
                          Try regenerating the report with a different date
                          range
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <span className='h-5 w-5 bg-muted text-primary rounded-full flex items-center justify-center text-xs font-bold'>
                          2
                        </span>
                        <span>
                          Check if the digital resource provider is currently
                          experiencing issues
                        </span>
                      </li>
                      <li className='flex items-start gap-2'>
                        <span className='h-5 w-5 bg-muted text-primary rounded-full flex items-center justify-center text-xs font-bold'>
                          3
                        </span>
                        <span>Contact support if the problem persists</span>
                      </li>
                    </ul>
                  </div>

                  <div className='mt-6'>
                    <Button asChild>
                      <Link href='/resources/digital-resources/reports/new'>
                        Try Again
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className='bg-muted/50 p-8 rounded-lg border border-dashed flex flex-col items-center justify-center'>
            <XCircle className='h-12 w-12 text-muted-foreground mb-3' />
            <h3 className='text-xl font-semibold mb-1'>Report Not Found</h3>
            <p className='text-muted-foreground text-center max-w-md mb-6'>
              The report you are looking for does not exist or has been deleted.
            </p>
            <Button asChild>
              <Link href='/resources/digital-resources/reports'>
                Return to Reports
              </Link>
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
