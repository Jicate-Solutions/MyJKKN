// app/(routes)/resource-management/reservations/approvals/page.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DataTable } from '@/components/ui/data-table';
import { ApprovalStatsCards } from './_components/approval-stats-cards';
import { ApprovalActionsDialog } from './_components/approval-actions-dialog';
import {
  usePendingApprovals,
  useApprovalStats
} from '@/hooks/reservation/use-reservations';
import {
  useApproveReservation,
  useRejectReservation
} from '@/hooks/reservation/use-reservation-operations';
import { useAuth } from '@/hooks/use-auth';
import type { Reservation } from '@/types/reservation';
import {
  CheckCircle2,
  XCircle,
  Eye,
  User,
  Calendar,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

export default function ApprovalsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  // Fetch pending approvals and statistics
  const { data: reservations = [], isLoading, refetch } = usePendingApprovals();
  const { data: stats, isLoading: loadingStats } = useApprovalStats();

  const approveReservation = useApproveReservation();
  const rejectReservation = useRejectReservation();

  // Use real-time stats from the hook
  const approvalStats = {
    pending_approvals: stats?.pending_approvals || 0,
    approved_today: stats?.approved_today || 0,
    rejected_today: stats?.rejected_today || 0,
    overdue_approvals: stats?.overdue_approvals || 0
  };

  // Client-side pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return reservations.slice(startIndex, endIndex);
  }, [reservations, currentPage, pageSize]);

  const totalPages = Math.ceil(reservations.length / pageSize);

  const handleApprove = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setAction('approve');
  };

  const handleReject = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setAction('reject');
  };

  const handleCloseDialog = () => {
    setSelectedReservation(null);
    setAction(null);
  };

  // Handle bulk approve
  const handleBulkApprove = useCallback(
    async (selectedRows: Reservation[]) => {
      if (!user?.id) return;

      for (const reservation of selectedRows) {
        await approveReservation.mutateAsync({
          reservation_id: reservation.id
        });
      }
      refetch();
    },
    [approveReservation, user, refetch]
  );

  // Check if reservation is overdue
  const isOverdue = (createdAt: string): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24;
  };

  // Get priority badge
  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return (
          <Badge variant='destructive' className='gap-1'>
            <AlertTriangle className='h-3 w-3' />
            High
          </Badge>
        );
      case 2:
        return <Badge variant='default'>Normal</Badge>;
      case 1:
        return <Badge variant='secondary'>Low</Badge>;
      default:
        return <Badge variant='outline'>Unknown</Badge>;
    }
  };

  // Format date/time
  const formatDateTime = (dateStr: string): string => {
    return format(new Date(dateStr), 'MMM dd, yyyy');
  };

  const formatTime = (dateStr: string): string => {
    return format(new Date(dateStr), 'hh:mm a');
  };

  // Define columns for the DataTable
  const columns = [
    {
      id: 'resource',
      header: 'Resource',
      accessorFn: (row: Reservation) => row.resource?.name,
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        return (
          <div className='flex flex-col gap-1'>
            <span className='font-medium text-sm'>{reservation.resource?.name}</span>
            <span className='text-xs text-muted-foreground'>
              Qty: {reservation.quantity}
            </span>
          </div>
        );
      }
    },
    {
      id: 'requested_by',
      header: 'Requested By',
      accessorFn: (row: Reservation) => row.user?.full_name,
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        return (
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10'>
              <User className='h-4 w-4 text-primary' />
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-medium'>{reservation.user?.full_name}</span>
              <span className='text-xs text-muted-foreground'>
                {reservation.user?.email}
              </span>
            </div>
          </div>
        );
      }
    },
    {
      id: 'datetime',
      header: 'Date & Time',
      accessorFn: (row: Reservation) => row.start_time,
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        return (
          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-1 text-sm'>
              <Calendar className='h-3 w-3 text-muted-foreground' />
              {formatDateTime(reservation.start_time)}
            </div>
            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Clock className='h-3 w-3' />
              {formatTime(reservation.start_time)} - {formatTime(reservation.end_time)}
            </div>
          </div>
        );
      }
    },
    {
      id: 'purpose',
      header: 'Purpose',
      accessorFn: (row: Reservation) => row.purpose,
      cell: ({ row }: { row: any }) => {
        const purpose = row.getValue('purpose') as string;
        return (
          <p className='max-w-[250px] truncate text-sm text-muted-foreground'>
            {purpose}
          </p>
        );
      }
    },
    {
      id: 'priority',
      header: 'Priority',
      accessorFn: (row: Reservation) => row.priority,
      cell: ({ row }: { row: any }) => {
        const priority = row.getValue('priority') as number;
        return <div className='text-center'>{getPriorityBadge(priority)}</div>;
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        const overdue = isOverdue(reservation.created_at);

        return (
          <div className='flex items-center justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='gap-1'
              onClick={() =>
                router.push(`/resource-management/reservations/${reservation.id}`)
              }
            >
              <Eye className='h-3 w-3' />
              View
            </Button>
            <Button
              size='sm'
              variant='default'
              className='gap-1'
              onClick={() => handleApprove(reservation)}
            >
              <CheckCircle2 className='h-3 w-3' />
              Approve
            </Button>
            <Button
              size='sm'
              variant='destructive'
              className='gap-1'
              onClick={() => handleReject(reservation)}
            >
              <XCircle className='h-3 w-3' />
              Reject
            </Button>
            {overdue && (
              <Badge variant='destructive' className='text-xs'>
                Overdue
              </Badge>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  ];

  // Server-side pagination configuration (using client-side data)
  const serverSidePagination = {
    currentPage,
    totalPages,
    pageSize,
    totalItems: reservations.length,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    onPageChange: setCurrentPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
    isLoading
  };

  return (
    <ContentLayout title='Approval Dashboard'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/reservations'>
              Reservations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Approvals</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='mb-6'>
        <h1 className='text-3xl font-bold'>Approval Dashboard</h1>
        <p className='text-muted-foreground'>
          Review and manage pending reservation requests
        </p>
      </div>

      {/* Statistics Cards */}
      <div className='mb-6'>
        <ApprovalStatsCards
          stats={approvalStats || null}
          isLoading={isLoading || loadingStats}
        />
      </div>

      {/* Approvals Table */}
      <Card>
        <CardContent className='p-6'>
          <DataTable
            columns={columns}
            data={paginatedData}
            searchPlaceholder='Search by resource, user, or purpose...'
            onSearch={(query) => {
              // Client-side search handled by DataTable
            }}
            getRowId={(row) => row.id}
            onRefresh={refetch}
            showRefresh={true}
            serverSidePagination={serverSidePagination}
            onBulkAction={handleBulkApprove}
            bulkActionConfig={{
              label: 'Approve Selected',
              confirmTitle: 'Approve Multiple Reservations',
              confirmDescription:
                'Are you sure you want to approve the selected reservations? This action will immediately grant access to the resources.',
              variant: 'default',
              successMessage: 'Successfully approved {count} reservations',
              errorMessage: 'Failed to approve reservations'
            }}
          />
        </CardContent>
      </Card>

      {/* Approval Actions Dialog */}
      <ApprovalActionsDialog
        reservation={selectedReservation}
        action={action}
        onClose={handleCloseDialog}
      />
    </ContentLayout>
  );
}
