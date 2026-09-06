'use client';
// app/(routes)/resource-management/reservations/my-reservations/page.tsx

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { ReservationFilters } from './_components/reservation-filters';
import { useAuth } from '@/hooks/use-auth';
import { useMyReservations } from '@/hooks/reservation/use-reservations';
import {
  useCancelReservation,
  useCheckInReservation,
  useCheckOutReservation
} from '@/hooks/reservation/use-reservation-operations';
import { ReservationStatus } from '@/types/reservation';
import type { Reservation } from '@/types/reservation';
import { format } from 'date-fns';
import {
  Plus,
  Eye,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LogIn,
  LogOut,
  Trash2
} from 'lucide-react';

export default function MyReservationsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const {
    data: reservations = [],
    isLoading,
    refetch
  } = useMyReservations(user?.id || '');

  const cancelReservation = useCancelReservation();
  const checkInReservation = useCheckInReservation();
  const checkOutReservation = useCheckOutReservation();

  // Status counts for the header badges
  const counts = useMemo(() => {
    return {
      all: reservations.length,
      pending: reservations.filter((r) => r.status === ReservationStatus.PENDING).length,
      approved: reservations.filter((r) => r.status === ReservationStatus.APPROVED).length,
      completed: reservations.filter((r) => r.status === ReservationStatus.COMPLETED).length,
      cancelled: reservations.filter(
        (r) =>
          r.status === ReservationStatus.CANCELLED ||
          r.status === ReservationStatus.REJECTED
      ).length
    };
  }, [reservations]);

  // Filter reservations
  const filteredData = useMemo(() => {
    let rows = [...reservations];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.resource?.name?.toLowerCase().includes(q) ||
          r.purpose?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    const now = new Date();
    if (dateFilter === 'upcoming') {
      rows = rows.filter((r) => new Date(r.start_time) > now);
    } else if (dateFilter === 'past') {
      rows = rows.filter((r) => new Date(r.end_time) < now);
    } else if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      rows = rows.filter(
        (r) =>
          new Date(r.start_time) >= today && new Date(r.start_time) < tomorrow
      );
    } else if (dateFilter === 'this_week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      rows = rows.filter(
        (r) =>
          new Date(r.start_time) >= weekStart &&
          new Date(r.start_time) < weekEnd
      );
    } else if (dateFilter === 'this_month') {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      rows = rows.filter(
        (r) =>
          new Date(r.start_time) >= monthStart &&
          new Date(r.start_time) < monthEnd
      );
    }

    return rows.sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );
  }, [reservations, searchQuery, statusFilter, dateFilter]);

  // Pagination
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFilter('all');
    setCurrentPage(1);
  }, []);

  const handleCancel = (id: string) => {
    if (!user) return;
    cancelReservation.mutate({
      reservation_id: id,
      user_id: user.id,
      cancellation_reason: 'Cancelled by user'
    });
  };

  const handleCheckIn = (id: string) => {
    if (!user) return;
    checkInReservation.mutate({
      reservation_id: id,
      checked_in_by: user.id
    });
  };

  const handleCheckOut = (id: string) => {
    if (!user) return;
    checkOutReservation.mutate({
      reservation_id: id,
      checked_out_by: user.id
    });
  };

  // Format helpers
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'hh:mm a');
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className='bg-green-100 text-green-700 border-green-200 hover:bg-green-100 gap-1'>
            <CheckCircle2 className='h-3 w-3' />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 gap-1'>
            <Clock className='h-3 w-3' />
            Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className='bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1'>
            <XCircle className='h-3 w-3' />
            Rejected
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className='bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 gap-1'>
            <XCircle className='h-3 w-3' />
            Cancelled
          </Badge>
        );
      case 'completed':
        return (
          <Badge className='bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 gap-1'>
            <CheckCircle2 className='h-3 w-3' />
            Completed
          </Badge>
        );
      case 'no_show':
        return (
          <Badge className='bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 gap-1'>
            <AlertCircle className='h-3 w-3' />
            No Show
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return <Badge variant='destructive'>High</Badge>;
      case 2:
        return <Badge variant='default'>Normal</Badge>;
      case 1:
        return <Badge variant='secondary'>Low</Badge>;
      default:
        return <Badge variant='outline'>-</Badge>;
    }
  };

  // DataTable columns
  const columns = [
    {
      id: 'resource',
      header: 'Resource',
      accessorFn: (row: Reservation) => row.resource?.name,
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        return (
          <div className='flex flex-col gap-1'>
            <span className='font-medium text-sm'>
              {reservation.resource?.name}
            </span>
            <span className='text-xs text-muted-foreground line-clamp-1 max-w-[200px]'>
              {reservation.purpose}
            </span>
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
              {formatDate(reservation.start_time)}
            </div>
            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Clock className='h-3 w-3' />
              {formatTime(reservation.start_time)} -{' '}
              {formatTime(reservation.end_time)}
            </div>
          </div>
        );
      }
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (row: Reservation) => row.status,
      cell: ({ row }: { row: any }) => {
        return getStatusBadge(row.original.status);
      }
    },
    {
      id: 'priority',
      header: 'Priority',
      accessorFn: (row: Reservation) => row.priority,
      cell: ({ row }: { row: any }) => {
        return getPriorityBadge(row.getValue('priority') as number);
      }
    },
    {
      id: 'quantity',
      header: 'Qty',
      accessorFn: (row: Reservation) => row.quantity,
      cell: ({ row }: { row: any }) => (
        <span className='text-sm'>{row.getValue('quantity')}</span>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: { row: any }) => {
        const reservation = row.original;
        const canCancel =
          reservation.status === 'pending' || reservation.status === 'approved';
        const canCheckIn =
          reservation.status === 'approved' && !reservation.checked_in_at;
        const canCheckOut =
          reservation.status === 'approved' &&
          reservation.checked_in_at &&
          !reservation.checked_out_at;

        return (
          <div
            className='flex items-center justify-end gap-2'
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size='sm'
              variant='outline'
              className='gap-1'
              onClick={() =>
                router.push(
                  `/resource-management/reservations/${reservation.id}`
                )
              }
            >
              <Eye className='h-3 w-3' />
              View
            </Button>
            {canCheckIn && (
              <Button
                size='sm'
                variant='default'
                className='gap-1'
                onClick={() => handleCheckIn(reservation.id)}
              >
                <LogIn className='h-3 w-3' />
                Check In
              </Button>
            )}
            {canCheckOut && (
              <Button
                size='sm'
                variant='outline'
                className='gap-1'
                onClick={() => handleCheckOut(reservation.id)}
              >
                <LogOut className='h-3 w-3' />
                Check Out
              </Button>
            )}
            {canCancel && (
              <Button
                size='sm'
                variant='destructive'
                className='gap-1'
                onClick={() => handleCancel(reservation.id)}
              >
                <Trash2 className='h-3 w-3' />
                Cancel
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  ];

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
    <ContentLayout title='My Reservations'>
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
          <BreadcrumbPage>My Reservations</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold'>My Reservations</h1>
          <p className='text-muted-foreground'>
            Manage and track your resource reservations
          </p>
        </div>
        <Button
          className='shrink-0'
          onClick={() => router.push('/resource-management/reservations/new')}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Reservation
        </Button>
      </div>

      {/* Status Summary Badges */}
      <div className='flex items-center gap-3 mb-6 flex-wrap'>
        <Badge
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          className='cursor-pointer px-3 py-1.5 text-sm'
          onClick={() => setStatusFilter('all')}
        >
          All ({counts.all})
        </Badge>
        <Badge
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          className='cursor-pointer px-3 py-1.5 text-sm'
          onClick={() =>
            setStatusFilter(
              statusFilter === 'pending' ? 'all' : 'pending'
            )
          }
        >
          <Clock className='h-3 w-3 mr-1' />
          Pending ({counts.pending})
        </Badge>
        <Badge
          variant={statusFilter === 'approved' ? 'default' : 'outline'}
          className='cursor-pointer px-3 py-1.5 text-sm'
          onClick={() =>
            setStatusFilter(
              statusFilter === 'approved' ? 'all' : 'approved'
            )
          }
        >
          <CheckCircle2 className='h-3 w-3 mr-1' />
          Approved ({counts.approved})
        </Badge>
        <Badge
          variant={statusFilter === 'completed' ? 'default' : 'outline'}
          className='cursor-pointer px-3 py-1.5 text-sm'
          onClick={() =>
            setStatusFilter(
              statusFilter === 'completed' ? 'all' : 'completed'
            )
          }
        >
          <CheckCircle2 className='h-3 w-3 mr-1' />
          Completed ({counts.completed})
        </Badge>
        <Badge
          variant={
            statusFilter === 'cancelled' || statusFilter === 'rejected'
              ? 'default'
              : 'outline'
          }
          className='cursor-pointer px-3 py-1.5 text-sm'
          onClick={() =>
            setStatusFilter(
              statusFilter === 'cancelled' ? 'all' : 'cancelled'
            )
          }
        >
          <XCircle className='h-3 w-3 mr-1' />
          Cancelled ({counts.cancelled})
        </Badge>
      </div>

      {/* Filters */}
      <Card className='mb-6'>
        <CardContent className='p-6'>
          <ReservationFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
      </Card>

      {/* DataTable */}
      <Card>
        <CardContent className='p-6'>
          <DataTable
            columns={columns}
            data={paginatedData}
            getRowId={(row) => row.id}
            onRefresh={refetch}
            showRefresh={true}
            serverSidePagination={serverSidePagination}
          />
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
