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
  RefreshCw,
  AlertTriangle
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
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

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

  // Combined loading state
  const isLoading = authLoading || permissionsLoading || isLoadingReports;

  // Specific permission checks
  const canViewReports =
    isSuperAdmin || canAccess('digital_resources.reports', 'view');
  const canCreateReports =
    isSuperAdmin || canAccess('digital_resources.reports', 'create');

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
            'Digital Reports: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log('Digital Reports: No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Digital Reports: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Digital Reports: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Digital Reports: Auth check error:', error);
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
        console.log('Digital Reports: Auth state changed:', event);
        if (session) {
          console.log('Digital Reports: New session user:', session.user.id);
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
      console.log('Digital Reports permissions debug:', {
        isSuperAdmin,
        canViewReports: canAccess('digital_resources.reports', 'view'),
        canCreateReports: canAccess('digital_resources.reports', 'create')
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

  // Fetch digital resources for dropdown
  useEffect(() => {
    const fetchResources = async () => {
      if (!user || !canViewReports) return;

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

    if (!isLoading && user && canViewReports) {
      fetchResources();
    }
  }, [user, isLoading, canViewReports]);

  // Apply filters
  useEffect(() => {
    if (!user || !canViewReports) return;

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
  }, [
    searchTerm,
    statusFilter,
    resourceFilter,
    sortOrder,
    updateFilters,
    user,
    canViewReports
  ]);

  const handleRefresh = async () => {
    if (!canViewReports) {
      toast.error('You do not have permission to refresh reports');
      return;
    }

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

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Digital Resource Usage Reports'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  // Auth error state
  if (authError) {
    return (
      <ContentLayout title='Digital Resource Usage Reports'>
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
      <ContentLayout title='Digital Resource Usage Reports'>
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
      <ContentLayout title='Digital Resource Usage Reports'>
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
                {canCreateReports && (
                  <Button
                    size='sm'
                    onClick={() =>
                      router.push('/resources/digital-resources/reports/new')
                    }
                  >
                    <Plus className='h-4 w-4 mr-2' />
                    Generate New Report
                  </Button>
                )}
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
              ) : reportsError ? (
                <div className='text-center py-8'>
                  <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
                  <p className='text-destructive text-xl font-medium'>Error</p>
                  <p className='text-muted-foreground mb-4'>
                    {reportsError instanceof Error
                      ? reportsError.message
                      : String(reportsError)}
                  </p>
                  <Button
                    variant='outline'
                    onClick={handleRefresh}
                    className='mt-4'
                  >
                    Try Again
                  </Button>
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
                    resourceFilter === 'all' &&
                    canCreateReports && (
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
