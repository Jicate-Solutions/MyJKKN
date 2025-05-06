'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { format, isValid, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import {
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Download,
  CalendarIcon
} from 'lucide-react';
import { useDigitalReservations } from '@/hooks/resource/digital/use-digital-reservations';
import {
  ReservationStatus,
  RESERVATION_STATUSES
} from '@/types/digital-resources';
import { cn } from '@/lib/utils';

// Custom Ellipsis component for pagination
const PaginationEllipsis = ({ className }: { className?: string }) => (
  <div
    className={`flex h-9 w-9 items-center justify-center ${className}`}
    aria-hidden='true'
  >
    <MoreHorizontal className='h-4 w-4' />
    <span className='sr-only'>More pages</span>
  </div>
);

// Type to match the hook's expected status values
type HookReservationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'completed';

export function DigitalReservationsTable() {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<string | null>(
    null
  );
  const searchParams = useSearchParams();
  const [page, setPage] = useState<number>(
    Number(searchParams.get('page')) || 1
  );
  const [pageSize, setPageSize] = useState<number>(
    Number(searchParams.get('pageSize')) || 10
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get('search') || ''
  );
  const [selectedStatus, setSelectedStatus] = useState<string>('all-statuses');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const {
    reservations,
    metadata,
    loading,
    error,
    fetchReservations,
    deleteReservation
  } = useDigitalReservations({
    search: searchQuery,
    page,
    limit: pageSize,
    status:
      selectedStatus !== 'all-statuses'
        ? (selectedStatus as HookReservationStatus)
        : undefined,
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined
  });

  const handleSearch = () => {
    fetchReservations({
      search: searchQuery,
      page: 1,
      status:
        selectedStatus !== 'all-statuses'
          ? (selectedStatus as HookReservationStatus)
          : undefined,
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    fetchReservations({
      search: searchQuery,
      status:
        value === 'all-statuses' ? undefined : (value as HookReservationStatus),
      page: 1,
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all-statuses');
    setStartDate(undefined);
    setEndDate(undefined);
    fetchReservations({
      search: undefined,
      status: undefined,
      page: 1,
      startDate: undefined,
      endDate: undefined
    });
  };

  const handleDelete = (id: string) => {
    setReservationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (reservationToDelete) {
      await deleteReservation(reservationToDelete);
      setDeleteDialogOpen(false);
      setReservationToDelete(null);
    }
  };

  const handleEdit = (id: string) => {
    router.push(`/resources/digital-resources/reservations/edit/${id}`);
  };

  const handleView = (id: string) => {
    router.push(`/resources/digital-resources/reservations/${id}`);
  };

  const handleCreateNew = () => {
    router.push('/resources/digital-resources/reservations/new');
  };

  const renderPagination = () => {
    const { page, totalPages } = metadata;

    if (totalPages <= 1) return null;

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={page > 1 ? () => handlePageChange(page - 1) : undefined}
              className={
                page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              }
            />
          </PaginationItem>

          {Array.from({ length: totalPages }).map((_, i) => {
            // Only show a few page links to avoid clutter
            const pageNum = i + 1;

            // Always show first page, last page, current page, and pages around current
            if (
              pageNum === 1 ||
              pageNum === totalPages ||
              (pageNum >= page - 1 && pageNum <= page + 1)
            ) {
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    isActive={page === pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className='cursor-pointer'
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            }

            // Show ellipsis for breaks in sequence
            if (pageNum === 2 && page > 3) {
              return (
                <PaginationItem key='ellipsis-start'>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }

            if (pageNum === totalPages - 1 && page < totalPages - 2) {
              return (
                <PaginationItem key='ellipsis-end'>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }

            return null;
          })}

          <PaginationItem>
            <PaginationNext
              onClick={
                page < metadata.totalPages
                  ? () => handlePageChange(page + 1)
                  : undefined
              }
              className={
                page === metadata.totalPages
                  ? 'pointer-events-none opacity-50'
                  : 'cursor-pointer'
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchReservations({
      search: searchQuery,
      page: newPage,
      status:
        selectedStatus !== 'all-statuses'
          ? (selectedStatus as HookReservationStatus)
          : undefined,
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined
    });
  };

  const getStatusBadge = (
    status: ReservationStatus | HookReservationStatus
  ) => {
    switch (status) {
      case 'pending':
        return (
          <Badge
            variant='outline'
            className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
          >
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge
            variant='outline'
            className='bg-green-100 text-green-800 hover:bg-green-100'
          >
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge
            variant='outline'
            className='bg-red-100 text-red-800 hover:bg-red-100'
          >
            Rejected
          </Badge>
        );
      case 'canceled':
      case 'active':
        return (
          <Badge
            variant='outline'
            className={
              status === 'canceled'
                ? 'bg-gray-100 text-gray-800 hover:bg-gray-100'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-100'
            }
          >
            {status === 'canceled' ? 'Canceled' : 'Active'}
          </Badge>
        );
      case 'completed':
        return (
          <Badge
            variant='outline'
            className='bg-blue-100 text-blue-800 hover:bg-blue-100'
          >
            Completed
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Digital Resource Reservations</CardTitle>
          <CardDescription>Error loading reservations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center justify-center text-center p-6'>
            <p className='text-red-500 mb-4'>{error}</p>
            <Button onClick={() => fetchReservations()}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-col md:flex-row justify-between md:items-center gap-4'>
          <div className='flex flex-col gap-2'>
            <CardTitle>Digital Resource Reservations</CardTitle>
            <CardDescription>
              {loading
                ? 'Loading reservations...'
                : `Showing ${reservations.length} of ${metadata.total} reservations`}
            </CardDescription>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                type='search'
                placeholder='Search reservations...'
                className='w-full sm:w-[200px] pl-8'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button
              variant='outline'
              size='icon'
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter className='h-4 w-4' />
            </Button>
            <Button variant='default' onClick={handleCreateNew}>
              <Plus className='mr-2 h-4 w-4' />
              New Reservation
            </Button>
          </div>
        </div>

        {isFilterOpen && (
          <div className='mt-4 grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div>
              <label htmlFor='status-filter' className='text-sm font-medium'>
                Status
              </label>
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger id='status-filter' className='w-full mt-1'>
                  <SelectValue placeholder='Filter by status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all-statuses'>All Statuses</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='approved'>Approved</SelectItem>
                  <SelectItem value='rejected'>Rejected</SelectItem>
                  <SelectItem value='canceled'>Canceled</SelectItem>
                  <SelectItem value='completed'>Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className='text-sm font-medium'>Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-full mt-1 justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {startDate ? format(startDate, 'PPP') : 'Pick a start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0'>
                  <Calendar
                    mode='single'
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className='text-sm font-medium'>End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-full mt-1 justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {endDate ? format(endDate, 'PPP') : 'Pick an end date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0'>
                  <Calendar
                    mode='single'
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className='md:col-span-3 flex justify-end gap-2'>
              <Button variant='outline' onClick={handleResetFilters}>
                Reset Filters
              </Button>
              <Button onClick={handleSearch}>Apply Filters</Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className='flex justify-center items-center py-8'>
            <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
          </div>
        ) : reservations.length === 0 ? (
          <div className='flex flex-col items-center justify-center text-center p-8'>
            <p className='text-muted-foreground mb-4'>No reservations found</p>
            <Button onClick={handleCreateNew}>
              Create your first reservation
            </Button>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No</TableHead>
                  <TableHead>Title/Purpose</TableHead>
                  <TableHead>Resource Name</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((reservation, index) => (
                  <TableRow key={reservation.id}>
                    <TableCell>{index + 1}</TableCell>

                    <TableCell>
                      <Link
                        href={`/resources/digital-resources/reservations/${reservation.id}`}
                        className='hover:underline'
                      >
                        {reservation.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {reservation.digital_resource ? (
                        <Link
                          href={`/resources/digital-resources/${reservation.digital_resource_id}`}
                          className='font-medium hover:underline'
                        >
                          {reservation.digital_resource.digital_resource_name}
                        </Link>
                      ) : (
                        <span className='text-muted-foreground'>
                          {reservation.digital_resource_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {reservation.user ? (
                        <div className='text-sm'>
                          <div>
                            {reservation.user.full_name || 'Unnamed User'}
                          </div>
                          <div className='text-muted-foreground'>
                            {reservation.user.email}
                          </div>
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>
                          {reservation.user_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isValid(parseISO(reservation.reservation_start)) &&
                      isValid(parseISO(reservation.reservation_end)) ? (
                        <div className='text-sm'>
                          <div>
                            {format(
                              parseISO(reservation.reservation_start),
                              'MMM d, yyyy'
                            )}
                          </div>
                          <div className='text-muted-foreground'>
                            to{' '}
                            {format(
                              parseISO(reservation.reservation_end),
                              'MMM d, yyyy'
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>
                          Invalid date
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                    <TableCell className='text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' size='icon'>
                            <MoreHorizontal className='h-4 w-4' />
                            <span className='sr-only'>Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleView(reservation.id)}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEdit(reservation.id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className='text-red-600'
                            onClick={() => handleDelete(reservation.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className='mt-4 flex items-center justify-center'>
          {renderPagination()}
        </div>
      </CardContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this reservation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant='destructive' onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
