'use client';
// app/(routes)/resource-management/reservations/approvals/page.tsx

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { ApprovalFilters } from './_components/approval-filters';
import {
  usePendingApprovals,
  useApprovalStats,
  useMyApprovalStatuses
} from '@/hooks/reservation/use-reservations';
import {
  useApproveReservation,
  useRejectReservation
} from '@/hooks/reservation/use-reservation-operations';
import { useAuth } from '@/hooks/use-auth';
import { evaluateApprovalTurn } from '@/lib/services/reservation/approval-chain';
import type { ApprovalRecordLike } from '@/lib/services/reservation/approval-chain';
import { logger } from '@/lib/utils/enhanced-logger';
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

/**
 * Approval-chain rows for the reservations currently on screen.
 *
 * BUG-004008: the queue selects reservations by status='pending' alone, so
 * without these rows the Actions column cannot tell whether it is this
 * approver's turn. A level-2 approver was shown a live Approve button while
 * level 1 had not acted, and the database refused the click.
 */
function useQueueApprovalRows(reservationIds: string[]) {
  const idKey = [...reservationIds].sort().join(',');

  return useQuery({
    // Shares the 'reservation-approvals' key prefix, so the approve/reject
    // mutations' existing invalidation refreshes this queue too.
    queryKey: ['reservation-approvals', 'queue', idKey],
    queryFn: async (): Promise<Map<string, ApprovalRecordLike[]>> => {
      const byReservation = new Map<string, ApprovalRecordLike[]>();
      if (reservationIds.length === 0) return byReservation;

      const supabase = (
        await import('@/lib/supabase/client')
      ).createClientSupabaseClient();

      const { data, error } = await (supabase as any)
        .from('resource_approvals')
        .select('reservation_id, approver_user_id, approval_level, status')
        .in('reservation_id', reservationIds);

      if (error) {
        logger.error(
          'resource-management/reservations',
          'Error fetching approval chain for approvals queue',
          error
        );
        return byReservation;
      }

      for (const row of (data || []) as (ApprovalRecordLike & {
        reservation_id: string;
      })[]) {
        const list = byReservation.get(row.reservation_id) ?? [];
        list.push(row);
        byReservation.set(row.reservation_id, list);
      }

      return byReservation;
    },
    enabled: reservationIds.length > 0,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    retry: 3
  });
}

export default function ApprovalsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  // Advanced filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [institutionFilter, setInstitutionFilter] = useState('all');

  // Institution narrows the server-side fetch; the rest are client-side.
  // RLS still scopes by institution for users without multi-institution
  // access, so a same-institution approver gets only their queue
  // regardless of what they pick here.
  const { data: reservations = [], isLoading, refetch } = usePendingApprovals(
    institutionFilter !== 'all'
      ? { institution_id: institutionFilter }
      : undefined
  );
  const { data: stats, isLoading: loadingStats } = useApprovalStats();
  const { data: myApprovalData } = useMyApprovalStatuses(user?.id);
  const myApprovalStatuses = myApprovalData?.statusMap;

  const approveReservation = useApproveReservation();
  const rejectReservation = useRejectReservation();

  // Use real-time stats from the hook
  const approvalStats = {
    pending_approvals: stats?.pending_approvals || 0,
    approved_today: stats?.approved_today || 0,
    rejected_today: stats?.rejected_today || 0,
    overdue_approvals: stats?.overdue_approvals || 0
  };

  const myStats = myApprovalData
    ? {
        my_pending: myApprovalData.myPending,
        my_approved_total: myApprovalData.myApprovedTotal,
        my_approved_today: myApprovalData.myApprovedToday,
        my_rejected_total: myApprovalData.myRejectedTotal,
        my_rejected_today: myApprovalData.myRejectedToday
      }
    : null;

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilter('all');
    setSortBy('created_at');
    setInstitutionFilter('all');
    setCurrentPage(1);
  }, []);

  // Apply search + priority filter + sort (client-side over the
  // server-narrowed institution dataset).
  const filteredData = useMemo(() => {
    let rows = reservations;

    // Never show the current user's own requests in the approval queue —
    // a requester must not be able to approve or reject their own submission.
    rows = rows.filter((r) => r.user_id !== user?.id);

    if (priorityFilter !== 'all') {
      const p = Number(priorityFilter);
      rows = rows.filter((r) => Number(r.priority) === p);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((r) => {
        return (
          r.resource?.name?.toLowerCase().includes(q) ||
          r.user?.full_name?.toLowerCase().includes(q) ||
          r.user?.email?.toLowerCase().includes(q) ||
          r.purpose?.toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'start_time':
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        case 'priority':
          return Number(b.priority || 0) - Number(a.priority || 0);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sorted;
  }, [reservations, priorityFilter, searchQuery, sortBy, user?.id]);

  // Client-side pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  // Whose turn is it? Load the approval chain for the rows on screen so the
  // Actions column can disable out-of-turn approvals instead of letting the
  // database refuse them (BUG-004008).
  const visibleReservationIds = useMemo(
    () => paginatedData.map((r) => r.id),
    [paginatedData]
  );
  const { data: approvalRowsByReservation } =
    useQueueApprovalRows(visibleReservationIds);
  const isSuperAdmin =
    (user as any)?.is_super_admin === true ||
    (user as any)?.role === 'super_admin';

  // Reset to page 1 whenever filters change so the user never lands
  // on an empty page after narrowing the result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, sortBy, institutionFilter]);

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
        // Skip rows where a lower approval level has not acted yet — the
        // database would refuse them and abort the rest of the batch.
        const turn = evaluateApprovalTurn({
          approvalConfig: reservation.resource?.approval_config,
          approvals: approvalRowsByReservation?.get(reservation.id),
          userId: user?.id,
          isSuperAdmin
        });
        if (turn.state === 'waiting_for_level') continue;

        await approveReservation.mutateAsync({
          reservation_id: reservation.id
        });
      }
      refetch();
    },
    [approveReservation, user, refetch, approvalRowsByReservation, isSuperAdmin]
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
        const isOwnRequest = reservation.user_id === user?.id;
        const myStatus = myApprovalStatuses?.get(reservation.id);
        const alreadyActed = myStatus === 'approved' || myStatus === 'rejected';

        // Sequential chains: a higher-level approver must wait for the lower
        // levels. Keep the row visible (hiding it would make the queue look
        // empty) but disable the actions and name the level being waited on.
        const turn = evaluateApprovalTurn({
          approvalConfig: reservation.resource?.approval_config,
          approvals: approvalRowsByReservation?.get(reservation.id),
          userId: user?.id,
          isSuperAdmin
        });
        const waitingForLevel =
          turn.state === 'waiting_for_level' ? turn.waiting_for_level : null;
        const waitingLabel =
          waitingForLevel !== null
            ? `Waiting for Level ${waitingForLevel} approval — you can act once the preceding approver has.`
            : undefined;

        return (
          <div className='flex items-center justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='gap-1'
              onClick={() =>
                router.push(
                  // Carry the queue we came from so the detail page sends the
                  // approver back here, not to My Reservations.
                  `/resource-management/reservations/${reservation.id}?returnTo=${encodeURIComponent(
                    '/resource-management/reservations/approvals'
                  )}`
                )
              }
            >
              <Eye className='h-3 w-3' />
              View
            </Button>
            {isOwnRequest ? (
              <Badge variant='secondary'>Your Request</Badge>
            ) : alreadyActed ? (
              <Badge
                className={
                  myStatus === 'approved'
                    ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100'
                }
              >
                {myStatus === 'approved' ? (
                  <><CheckCircle2 className='h-3 w-3 mr-1' />You Approved</>
                ) : (
                  <><XCircle className='h-3 w-3 mr-1' />You Rejected</>
                )}
              </Badge>
            ) : waitingForLevel !== null ? (
              <span
                className='flex items-center gap-2'
                title={waitingLabel}
              >
                <Badge className='bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs'>
                  <Clock className='h-3 w-3 mr-1' />
                  Waiting for Level {waitingForLevel}
                </Badge>
                <Button size='sm' variant='default' className='gap-1' disabled>
                  <CheckCircle2 className='h-3 w-3' />
                  Approve
                </Button>
                <Button
                  size='sm'
                  variant='destructive'
                  className='gap-1'
                  disabled
                >
                  <XCircle className='h-3 w-3' />
                  Reject
                </Button>
              </span>
            ) : (
              <>
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
              </>
            )}
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
    totalItems: filteredData.length,
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
          myStats={myStats}
          isLoading={isLoading || loadingStats}
        />
      </div>

      {/* Advanced Filters */}
      <Card className='mb-6'>
        <CardContent className='p-6'>
          <ApprovalFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            priorityFilter={priorityFilter}
            onPriorityChange={setPriorityFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            institutionFilter={institutionFilter}
            onInstitutionChange={setInstitutionFilter}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
      </Card>

      {/* Approvals Table */}
      <Card>
        <CardContent className='p-6'>
          <DataTable
            columns={columns}
            data={paginatedData}
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
