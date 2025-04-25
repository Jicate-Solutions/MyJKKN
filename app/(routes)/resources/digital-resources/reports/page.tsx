'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  Loader2,
  Plus,
  FileBarChart,
  Search,
  Calendar,
  FileDown,
  RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { useDigitalReports } from '@/hooks/resource/digital/use-digital-reports';
import { DigitalUsageReport } from '@/types/digital-resources';

export default function ReportsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [digitalResources, setDigitalResources] = useState<
    { id: string; digital_resource_name: string }[]
  >([]);
  const [loadingResources, setLoadingResources] = useState(true);

  // Use the custom hook for reports
  const {
    reports,
    metadata,
    isLoadingReports,
    reportsError,
    filters,
    updateFilters,
    refetchReports
  } = useDigitalReports();

  // Fetch digital resources for dropdown
  useEffect(() => {
    const fetchResources = async () => {
      try {
        setLoadingResources(true);
        const response = await DigitalResourceService.getDigitalResources();
        setDigitalResources(response.data);
      } catch (error) {
        console.error('Error fetching digital resources:', error);
      } finally {
        setLoadingResources(false);
      }
    };

    fetchResources();
  }, []);

  // Apply filters
  useEffect(() => {
    const debounce = setTimeout(() => {
      const newFilters: any = {
        page: 1 // Reset to first page when filters change
      };

      if (searchTerm) {
        newFilters.search = searchTerm;
      }

      if (statusFilter !== 'all') {
        newFilters.status = statusFilter;
      }

      if (resourceFilter !== 'all') {
        newFilters.digital_resource_id = resourceFilter;
      }

      // Handle sort order
      newFilters.sortBy = 'generated_at';
      newFilters.sortDirection = sortOrder === 'newest' ? 'desc' : 'asc';

      updateFilters(newFilters);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm, statusFilter, resourceFilter, sortOrder, updateFilters]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refetchReports();
      toast.success('Reports refreshed');
    } catch (error) {
      console.error('Error refreshing reports:', error);
      toast.error('Failed to refresh reports');
    } finally {
      setRefreshing(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  // Get badge variant based on status
  const getStatusBadge = (status: DigitalUsageReport['status']) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'processing':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <ContentLayout title='Digital Resource Usage Reports'>
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
            <BreadcrumbPage>Usage Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6'>
        <Card>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <div>
                <CardTitle className='text-xl'>Usage Reports</CardTitle>
                <CardDescription>
                  View and manage digital resource usage reports
                </CardDescription>
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleRefresh}
                  disabled={refreshing || isLoadingReports}
                >
                  {refreshing ? (
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  ) : (
                    <RefreshCw className='h-4 w-4 mr-2' />
                  )}
                  Refresh
                </Button>
                <Button
                  size='sm'
                  onClick={() =>
                    router.push('/resources/digital-resources/reports/new')
                  }
                >
                  <Plus className='h-4 w-4 mr-2' />
                  Generate New Report
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <div className='flex flex-col sm:flex-row gap-4'>
                <div className='relative flex-grow'>
                  <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                  <Input
                    placeholder='Search reports...'
                    className='pl-8'
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder='Status' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Statuses</SelectItem>
                      <SelectItem value='completed'>Completed</SelectItem>
                      <SelectItem value='processing'>Processing</SelectItem>
                      <SelectItem value='failed'>Failed</SelectItem>
                      <SelectItem value='pending'>Pending</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={resourceFilter}
                    onValueChange={setResourceFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Resource' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Resources</SelectItem>
                      {loadingResources ? (
                        <SelectItem value='loading' disabled>
                          <Loader2 className='h-4 w-4 animate-spin mr-2 inline' />
                          Loading...
                        </SelectItem>
                      ) : (
                        digitalResources.map((resource) => (
                          <SelectItem key={resource.id} value={resource.id}>
                            {resource.digital_resource_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger>
                      <SelectValue placeholder='Sort by' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='newest'>Newest First</SelectItem>
                      <SelectItem value='oldest'>Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoadingReports ? (
                <div className='flex items-center justify-center h-40'>
                  <Loader2 className='h-8 w-8 animate-spin text-primary' />
                </div>
              ) : reports.length > 0 ? (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Generated</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report: DigitalUsageReport) => (
                        <TableRow key={report.id}>
                          <TableCell className='font-medium'>
                            {report.digital_resource?.digital_resource_name ||
                              report.digital_resource_name ||
                              'Unknown Resource'}
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center'>
                              <Calendar className='h-4 w-4 mr-2 text-muted-foreground' />
                              <span>
                                {formatDate(report.start_date)} to{' '}
                                {formatDate(report.end_date)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(
                              new Date(report.generated_at),
                              'MMM d, yyyy'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant='outline'>
                              {report.report_type === 'detailed'
                                ? 'Detailed'
                                : 'Standard'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(report.status)}>
                              {report.status.charAt(0).toUpperCase() +
                                report.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {report.status === 'completed' && report.summary ? (
                              <div className='flex items-center gap-2'>
                                <div className='flex items-center'>
                                  <FileBarChart className='h-4 w-4 mr-1 text-muted-foreground' />
                                  <span>{report.summary.total_views}</span>
                                </div>
                                <div className='flex items-center'>
                                  <FileDown className='h-4 w-4 mr-1 text-muted-foreground' />
                                  <span>{report.summary.total_downloads}</span>
                                </div>
                              </div>
                            ) : (
                              <span className='text-muted-foreground'>-</span>
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Button
                              variant='ghost'
                              size='sm'
                              disabled={report.status !== 'completed'}
                              onClick={() =>
                                router.push(
                                  `/resources/digital-resources/reports/${report.id}`
                                )
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {metadata && metadata.totalPages > 1 && (
                    <div className='flex items-center justify-between p-4 border-t'>
                      <div className='text-sm text-muted-foreground'>
                        Showing {reports.length} of {metadata.total} reports
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={filters.page === 1}
                          onClick={() =>
                            updateFilters({ page: (filters.page || 1) - 1 })
                          }
                        >
                          Previous
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={
                            (filters.page || 1) >= (metadata.totalPages || 1)
                          }
                          onClick={() =>
                            updateFilters({ page: (filters.page || 1) + 1 })
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className='text-center p-8 border rounded-md'>
                  <FileBarChart className='h-12 w-12 mx-auto text-muted-foreground' />
                  <h3 className='mt-4 text-lg font-semibold'>
                    No reports found
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {searchTerm ||
                    statusFilter !== 'all' ||
                    resourceFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'Generate a new report to get started'}
                  </p>
                  {!searchTerm &&
                    statusFilter === 'all' &&
                    resourceFilter === 'all' && (
                      <Button
                        className='mt-4'
                        onClick={() =>
                          router.push(
                            '/resources/digital-resources/reports/new'
                          )
                        }
                      >
                        <Plus className='h-4 w-4 mr-2' />
                        Generate New Report
                      </Button>
                    )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
