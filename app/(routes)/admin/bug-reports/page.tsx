'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  useBugReports,
  useUpdateBugReportStatus,
  useDeleteBugReport,
  useBulkDeleteBugReports,
  useBulkUpdateBugReportsStatus,
  useInstitutions,
  useDepartments,
  useBugReportStats
} from '@/hooks/bug-reports/use-bug-reports';
import { usePermissions } from '@/hooks/use-permissions';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { BugReport, BugReportStatus, BugReportFilters } from '@/types/bugs';
import { MoreHorizontalIcon } from '@/components/icons';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { BugCategoryBadge } from '@/components/bug-reporter/bug-category-badge';
import {
  Users,
  Bug,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Trophy,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [filters, setFilters] = useState<BugReportFilters>({
    page: 1,
    limit: 10
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkStatusUpdateOpen, setBulkStatusUpdateOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] =
    useState<BugReportStatus>('seen');
  const [reporterSearch, setReporterSearch] = useState<string>('');
  const { isSuperAdmin } = usePermissions();

  const { data, isLoading, refetch } = useBugReports(filters);
  const updateStatusMutation = useUpdateBugReportStatus();
  const deleteReportMutation = useDeleteBugReport();
  const bulkDeleteMutation = useBulkDeleteBugReports();
  const bulkUpdateStatusMutation = useBulkUpdateBugReportsStatus();

  // Filter data
  const { data: institutions } = useInstitutions();
  const { data: departments } = useDepartments(filters.institution_id);

  // Use dedicated stats endpoint for real-time accurate statistics
  const { data: statsData, refetch: refetchStats } = useBugReportStats();

  // Statistics from dedicated endpoint - no limit, real-time counts
  const statistics = useMemo(() => {
    if (!statsData) {
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

    return {
      total: statsData.total,
      resolved: statsData.resolved,
      inProgress: statsData.inProgress,
      newReports: statsData.newReports,
      resolutionRate: statsData.resolutionRate,
      recentReports: statsData.recentReports,
      reportsTrend: statsData.reportsTrend
    };
  }, [statsData]);

  const handleStatusChange = useCallback(
    async (reportId: string, status: BugReportStatus) => {
      try {
        await updateStatusMutation.mutateAsync({ reportId, status });
        toast.success(`Report status changed to ${status.replace(/_/g, ' ')}.`);
        refetch();
        refetchStats(); // Refetch real-time statistics
      } catch (err: any) {
        toast.error('Could not update the report status.');
      }
    },
    [updateStatusMutation, refetch, refetchStats]
  );

  const handleDeleteReport = useCallback(async () => {
    if (!reportToDelete) return;

    try {
      await deleteReportMutation.mutateAsync(reportToDelete);
      toast.success('Bug Report Deleted');
      setDeleteConfirmOpen(false);
      setReportToDelete(null);
      refetch();
      refetchStats(); // Refetch real-time statistics
    } catch (err) {
      toast.error('Could not delete the bug report.');
    }
  }, [reportToDelete, deleteReportMutation, refetch, refetchStats]);

  const handleBulkDelete = useCallback(async () => {
    try {
      await bulkDeleteMutation.mutateAsync(selectedReports);
      toast.success(
        `${selectedReports.length} bug report(s) have been removed.`
      );
      setBulkDeleteConfirmOpen(false);
      setSelectedReports([]);
      refetch();
      refetchStats();
    } catch (err: any) {
      toast.error('Could not delete the selected bug reports.');
    }
  }, [selectedReports, bulkDeleteMutation, refetch, refetchStats]);

  const handleBulkStatusUpdate = useCallback(async () => {
    try {
      await bulkUpdateStatusMutation.mutateAsync({
        reportIds: selectedReports,
        status: bulkStatusValue
      });
      toast.success(
        `${
          selectedReports.length
        } bug report(s) status updated to ${bulkStatusValue.replace('_', ' ')}.`
      );
      setBulkStatusUpdateOpen(false);
      setSelectedReports([]);
      refetch();
      refetchStats();
    } catch (err: any) {
      toast.error('Could not update the status of selected bug reports.');
    }
  }, [
    selectedReports,
    bulkStatusValue,
    bulkUpdateStatusMutation,
    refetch,
    refetchStats
  ]);

  const reports = useMemo(() => {
    const allReports = data?.data ?? [];

    // Filter by reporter name/email if search query exists
    if (!reporterSearch.trim()) {
      return allReports;
    }

    const searchLower = reporterSearch.toLowerCase().trim();
    return allReports.filter((report) => {
      const reporterName = report.reporter?.full_name?.toLowerCase() || '';
      const reporterEmail = report.reporter?.email?.toLowerCase() || '';
      return (
        reporterName.includes(searchLower) ||
        reporterEmail.includes(searchLower)
      );
    });
  }, [data?.data, reporterSearch]);
  const metadata = data?.metadata;

  const handleSelectAll = useCallback(() => {
    if (selectedReports.length === reports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(reports.map((r) => r.id));
    }
  }, [selectedReports.length, reports]);

  const handleSelectReport = useCallback((reportId: string) => {
    setSelectedReports((prev) => {
      if (prev.includes(reportId)) {
        return prev.filter((id) => id !== reportId);
      } else {
        return [...prev, reportId];
      }
    });
  }, []);

  const columns: ColumnDef<BugReport>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () =>
          isSuperAdmin ? (
            <Checkbox
              checked={
                reports.length > 0 && selectedReports.length === reports.length
              }
              onCheckedChange={handleSelectAll}
              aria-label='Select all'
            />
          ) : null,
        cell: ({ row }) =>
          isSuperAdmin ? (
            <Checkbox
              checked={selectedReports.includes(row.original.id)}
              onCheckedChange={() => handleSelectReport(row.original.id)}
              aria-label='Select row'
            />
          ) : null,
        enableSorting: false,
        enableHiding: false
      },
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
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => (
          <BugCategoryBadge category={row.original.category} size='sm' />
        )
      },
      {
        accessorKey: 'reporter',
        header: 'Reporter',
        cell: ({ row }) => {
          const reporter = row.original.reporter;
          return (
            <div
              className='text-xs sm:text-sm min-w-[120px] cursor-pointer hover:text-primary transition-colors'
              onClick={() =>
                window.open(`/admin/bug-reports/${row.original.id}`, '_blank')
              }
            >
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
        accessorKey: 'institution_name',
        header: 'Institution',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm min-w-[100px]'>
            {row.original.institution_name || 'N/A'}
          </div>
        )
      },
      {
        accessorKey: 'department_name',
        header: 'Department',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm min-w-[100px]'>
            {row.original.department_name || 'N/A'}
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
                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setReportToDelete(row.original.id);
                        setDeleteConfirmOpen(true);
                      }}
                      className='text-destructive focus:text-destructive'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      Delete Report
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      }
    ],
    [
      handleStatusChange,
      isSuperAdmin,
      selectedReports,
      handleSelectAll,
      handleSelectReport,
      reports
    ]
  );

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
            <div className='flex gap-2'>
              {selectedReports.length > 0 && (
                <>
                  <Button
                    variant='outline'
                    onClick={() => setBulkStatusUpdateOpen(true)}
                  >
                    Update Status ({selectedReports.length})
                  </Button>
                  {isSuperAdmin && (
                    <Button
                      variant='destructive'
                      onClick={() => setBulkDeleteConfirmOpen(true)}
                    >
                      <Trash2 className='w-4 h-4 mr-2' />
                      Delete Selected ({selectedReports.length})
                    </Button>
                  )}
                </>
              )}
              <Button asChild variant='outline'>
                <Link href='/bug-leaderboard'>
                  <Trophy className='w-4 h-4 mr-2' />
                  View Leaderboard
                </Link>
              </Button>
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
            <CardHeader className='w-full flex flex-col justify-between'>
              <CardTitle className='flex items-center gap-2 py-4'>
                <Users className='w-5 h-5' />
                Bug Reports List
              </CardTitle>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='w-full sm:w-auto md:w-64'>
                  <div className='relative'>
                    <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      type='text'
                      placeholder='Search by reporter name or email...'
                      value={reporterSearch}
                      onChange={(e) => setReporterSearch(e.target.value)}
                      className='pl-8'
                    />
                  </div>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.status || 'all'}
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

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.category || 'all'}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        category: value === 'all' ? undefined : (value as any),
                        page: 1
                      }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by category...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Categories</SelectItem>
                      <SelectItem value='bug'>Bug/Issue</SelectItem>
                      <SelectItem value='feature_request'>
                        Feature Request
                      </SelectItem>
                      <SelectItem value='ui_design'>UI/Design</SelectItem>
                      <SelectItem value='performance'>Performance</SelectItem>
                      <SelectItem value='security'>Security</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.institution_id || 'all'}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        institution_id: value === 'all' ? undefined : value,
                        department_id: undefined, // Reset department when institution changes
                        page: 1
                      }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by institution...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Institutions</SelectItem>
                      {institutions?.map((institution) => (
                        <SelectItem key={institution.id} value={institution.id}>
                          {institution.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.department_id || 'all'}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        department_id: value === 'all' ? undefined : value,
                        page: 1
                      }))
                    }
                    disabled={!filters.institution_id}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by department...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Departments</SelectItem>
                      {filters.institution_id &&
                        departments?.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
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
                      currentPage: filters.page ?? 1,
                      pageSize: filters.limit ?? 10,
                      totalPages: metadata?.totalPages ?? 1,
                      totalItems: metadata?.total ?? 0,
                      onPageChange: handlePageChange,
                      onPageSizeChange: handlePageSizeChange,
                      isLoading: isLoading,
                      hasPreviousPage: (filters.page ?? 1) > 1,
                      hasNextPage:
                        (filters.page ?? 1) < (metadata?.totalPages ?? 1)
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the bug
              report and remove any associated screenshot from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReport}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedReports.length} bug report
              {selectedReports.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected bug reports and remove any associated screenshots from
              storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Update Dialog */}
      <AlertDialog
        open={bulkStatusUpdateOpen}
        onOpenChange={setBulkStatusUpdateOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Update Status for {selectedReports.length} bug report
              {selectedReports.length > 1 ? 's' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Select the new status for the selected bug reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-4'>
            <label className='text-sm font-medium text-muted-foreground mb-2 block'>
              New Status
            </label>
            <Select
              value={bulkStatusValue}
              onValueChange={(value) =>
                setBulkStatusValue(value as BugReportStatus)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select status...' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='new'>New</SelectItem>
                <SelectItem value='seen'>Seen</SelectItem>
                <SelectItem value='in_progress'>In Progress</SelectItem>
                <SelectItem value='resolved'>Resolved</SelectItem>
                <SelectItem value='wont_fix'>Won&apos;t Fix</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkStatusUpdate}
              disabled={bulkUpdateStatusMutation.isPending}
            >
              {bulkUpdateStatusMutation.isPending
                ? 'Updating...'
                : 'Update Status'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPermissionGuard>
  );
}
