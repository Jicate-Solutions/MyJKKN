'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useBugReports,
  useUpdateBugReportStatus
} from '@/hooks/bug-reports/use-bug-reports';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { BugReport, BugReportStatus } from '@/types/bugs';
import { useToast } from '@/hooks/use-toast';
import { MoreHorizontalIcon } from '@/components/icons';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import {
  Users,
  Bug,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const variant = {
    new: 'default',
    seen: 'secondary',
    in_progress: 'outline',
    resolved: 'default', // A 'success' variant would be better
    wont_fix: 'destructive'
  }[status] as 'default' | 'secondary' | 'destructive' | 'outline';

  const colorClass = status === 'resolved' ? 'bg-green-500 text-white' : '';

  return (
    <Badge
      variant={variant}
      className={`${colorClass} text-xs px-1 py-0.5 sm:px-2 sm:py-1`}
    >
      <span className='sm:hidden'>
        {status === 'in_progress' ? 'Progress' : status.replace(/_/g, ' ')}
      </span>
      <span className='hidden sm:inline'>{status.replace(/_/g, ' ')}</span>
    </Badge>
  );
};

// Statistics Card Component
const StatCard = ({
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
  trend = 'neutral'
}: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  trend?: 'up' | 'down' | 'neutral';
}) => {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-100',
    green: 'bg-green-500 text-green-100',
    red: 'bg-red-500 text-red-100',
    yellow: 'bg-yellow-500 text-yellow-100',
    purple: 'bg-purple-500 text-purple-100'
  };

  const bgColorClasses = {
    blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
    green:
      'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
    red: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
    yellow:
      'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
    purple:
      'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800'
  };

  return (
    <Card className={`${bgColorClasses[color]} transition-all hover:shadow-lg`}>
      <CardContent className='p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>{title}</p>
            <p className='text-2xl font-bold'>{value}</p>
            {change && (
              <div className='flex items-center mt-1'>
                {trend === 'up' && (
                  <TrendingUp className='w-4 h-4 text-green-500 mr-1' />
                )}
                {trend === 'down' && (
                  <TrendingDown className='w-4 h-4 text-red-500 mr-1' />
                )}
                <span
                  className={`text-sm ${
                    trend === 'up'
                      ? 'text-green-600'
                      : trend === 'down'
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {change}
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className='w-6 h-6' />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function AdminBugReportsPage() {
  const [filters, setFilters] = useState<{
    status?: BugReportStatus;
    page: number;
    limit: number;
  }>({
    page: 1,
    limit: 10
  });
  const [allReports, setAllReports] = useState<BugReport[]>([]);
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useBugReports(filters);
  const updateStatusMutation = useUpdateBugReportStatus();

  // Fetch all reports for statistics
  const { data: allReportsData, refetch: refetchAll } = useBugReports({
    page: 1,
    limit: 1000
  });

  useEffect(() => {
    if (allReportsData?.data) {
      setAllReports(allReportsData.data);
    }
  }, [allReportsData]);

  // Calculate statistics safely
  const statistics = useMemo(() => {
    const total = allReports.length;
    if (total === 0) {
      return {
        total: 0,
        resolved: 0,
        inProgress: 0,
        newReports: 0,
        resolutionRate: '0.0',
        reportsTrend: { value: '0.0', direction: 'neutral' as const },
        recentReports: 0
      };
    }

    const resolved = allReports.filter((r) => r.status === 'resolved').length;
    const inProgress = allReports.filter(
      (r) => r.status === 'in_progress'
    ).length;
    const newReports = allReports.filter((r) => r.status === 'new').length;

    const resolutionRate = ((resolved / total) * 100).toFixed(1);

    // Trend calculation
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentReports = allReports.filter(
      (r) => new Date(r.created_at) >= last7Days
    ).length;
    const previousReports = allReports.filter(
      (r) =>
        new Date(r.created_at) >= previous7Days &&
        new Date(r.created_at) < last7Days
    ).length;

    const trendValue =
      previousReports > 0
        ? ((recentReports - previousReports) / previousReports) * 100
        : recentReports > 0
        ? 100
        : 0;

    const reportsTrend = trendValue.toFixed(1);

    return {
      total,
      resolved,
      inProgress,
      newReports,
      resolutionRate,
      recentReports,
      reportsTrend: {
        value: reportsTrend,
        direction:
          trendValue > 0
            ? ('up' as const)
            : trendValue < 0
            ? ('down' as const)
            : ('neutral' as const)
      }
    };
  }, [allReports]);

  const handleStatusChange = useCallback(
    async (reportId: string, status: BugReportStatus) => {
      try {
        await updateStatusMutation.mutateAsync({ reportId, status });
        toast({
          title: 'Status Updated',
          description: `Report status changed to ${status}.`
        });
        refetch();
        refetchAll(); // Also refetch all reports for stats
      } catch (err) {
        toast({
          title: 'Update Failed',
          description: 'Could not update the report status.',
          variant: 'destructive'
        });
      }
    },
    [updateStatusMutation, toast, refetch, refetchAll]
  );

  const columns: ColumnDef<BugReport>[] = useMemo(
    () => [
      {
        accessorKey: 'display_id',
        header: 'Bug ID',
        cell: ({ row }) => (
          <span className='font-mono font-medium text-xs sm:text-sm'>
            {row.original.display_id}
          </span>
        )
      },
      {
        accessorKey: 'reporter',
        header: 'Reporter',
        cell: ({ row }) => {
          const reporter = row.original.reporter;
          return (
            <div className='text-xs sm:text-sm min-w-[120px]'>
              {reporter ? (
                <div>
                  <div className='font-medium text-gray-900 dark:text-gray-100'>
                    {reporter.full_name || 'Unknown User'}
                  </div>
                  <div className='text-gray-500 dark:text-gray-400 text-xs truncate max-w-[150px]'>
                    {reporter.email || 'No email'}
                  </div>
                </div>
              ) : (
                <div className='text-gray-500 dark:text-gray-400'>
                  <div>Unknown User</div>
                  <div className='text-xs'>No details</div>
                </div>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm'>
            <div className='sm:hidden'>
              {new Date(row.original.created_at).toLocaleDateString()}
            </div>
            <div className='hidden sm:block'>
              {new Date(row.original.created_at).toLocaleString()}
            </div>
          </div>
        )
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className='max-w-[150px] sm:max-w-xs truncate text-xs sm:text-sm'>
            {row.original.description}
          </div>
        )
      },
      {
        accessorKey: 'page_url',
        header: 'Page',
        cell: ({ row }) => (
          <Link
            href={row.original.page_url}
            target='_blank'
            className='text-blue-500 hover:underline text-xs sm:text-sm'
          >
            <span className='sm:hidden'>View</span>
            <span className='hidden sm:inline'>View Page</span>
          </Link>
        )
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <BugStatusBadge status={row.original.status} />
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className='text-right'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreHorizontalIcon className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/bug-reports/${row.original.id}`}>
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange(row.original.id, 'seen')}
                >
                  Mark as Seen
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'in_progress')
                  }
                >
                  Mark as In Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'resolved')
                  }
                >
                  Mark as Resolved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'wont_fix')
                  }
                >
                  {"Mark as Won't Fix"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      }
    ],
    [handleStatusChange]
  );

  const reports = data?.data ?? [];
  const metadata = data?.metadata;

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: newPageSize, page: 1 }));
  };

  return (
    <AdminPermissionGuard
      fallback={<div>You do not have permission to view this page.</div>}
    >
      <ContentLayout title='Bug Reports Analytics'>
        <div className='space-y-6'>
          {/* Header */}
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                Bug Reports Dashboard
              </h1>
              <p className='text-muted-foreground'>
                Comprehensive analytics and management
              </p>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard
              title='Total Reports'
              value={statistics.total}
              change={`${Math.abs(
                parseFloat(statistics.reportsTrend.value)
              )}% vs last week`}
              icon={Bug}
              color='blue'
              trend={statistics.reportsTrend.direction}
            />
            <StatCard
              title='Resolution Rate'
              value={`${statistics.resolutionRate}%`}
              change={`${statistics.resolved}/${statistics.total} resolved`}
              icon={CheckCircle}
              color='green'
              trend='up'
            />
            <StatCard
              title='In Progress'
              value={statistics.inProgress}
              change={`${
                statistics.total > 0
                  ? ((statistics.inProgress / statistics.total) * 100).toFixed(
                      1
                    )
                  : '0.0'
              }% of total`}
              icon={Clock}
              color='yellow'
              trend='neutral'
            />
            <StatCard
              title='New Reports'
              value={statistics.newReports}
              change={`${statistics.recentReports} this week`}
              icon={AlertTriangle}
              color='red'
              trend={statistics.reportsTrend.direction}
            />
          </div>

          {/* Data Table Section */}
          <Card>
            <CardHeader className='w-full flex flex-col lg:flex-row justify-between'>
              <CardTitle className='flex items-center gap-2'>
                <Users className='w-5 h-5' />
                Bug Reports List
              </CardTitle>
              <div className='w-full sm:w-48'>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status:
                        value === 'all'
                          ? undefined
                          : (value as BugReportStatus),
                      page: 1
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Filter by status...' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Statuses</SelectItem>
                    <SelectItem value='new'>New</SelectItem>
                    <SelectItem value='seen'>Seen</SelectItem>
                    <SelectItem value='in_progress'>In Progress</SelectItem>
                    <SelectItem value='resolved'>Resolved</SelectItem>
                    <SelectItem value='wont_fix'>Won&apos;t Fix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <div className='min-w-[800px]'>
                  <DataTable
                    columns={columns}
                    data={reports}
                    permissions={{
                      module: 'system',
                      actions: { view: true }
                    }}
                    onRefresh={refetch}
                    serverSidePagination={{
                      currentPage: filters.page,
                      pageSize: filters.limit,
                      totalPages: metadata?.totalPages ?? 1,
                      totalItems: metadata?.total ?? 0,
                      onPageChange: handlePageChange,
                      onPageSizeChange: handlePageSizeChange,
                      isLoading: isLoading,
                      hasPreviousPage: filters.page > 1,
                      hasNextPage: filters.page < (metadata?.totalPages ?? 1)
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
