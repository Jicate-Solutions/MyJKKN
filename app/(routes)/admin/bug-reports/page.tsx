'use client';

import { useState, useMemo, useCallback } from 'react';
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
import Link from 'next/link';
import { BugReport, BugReportStatus } from '@/types/bugs';
import { useToast } from '@/hooks/use-toast';
import { MoreHorizontalIcon } from '@/components/icons';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';

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
    <Badge variant={variant} className={colorClass}>
      {status.replace(/_/g, ' ')}
    </Badge>
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
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useBugReports(filters);
  const updateStatusMutation = useUpdateBugReportStatus();

  const handleStatusChange = useCallback(
    async (reportId: string, status: BugReportStatus) => {
      try {
        await updateStatusMutation.mutateAsync({ reportId, status });
        toast({
          title: 'Status Updated',
          description: `Report status changed to ${status}.`
        });
      } catch (err) {
        toast({
          title: 'Update Failed',
          description: 'Could not update the report status.',
          variant: 'destructive'
        });
      }
    },
    [updateStatusMutation, toast]
  );

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
        header: 'Created At',
        cell: ({ row }) => new Date(row.original.created_at).toLocaleString()
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className='max-w-xs truncate'>{row.original.description}</div>
        )
      },
      {
        accessorKey: 'page_url',
        header: 'Page URL',
        cell: ({ row }) => (
          <Link
            href={row.original.page_url}
            target='_blank'
            className='text-blue-500 hover:underline'
          >
            View Page
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
      <ContentLayout title='Bug Reports'>
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
          tableTools={
            <div className='w-48'>
              <Select
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: value as BugReportStatus,
                    page: 1
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Filter by status...' />
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
          }
        />
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
