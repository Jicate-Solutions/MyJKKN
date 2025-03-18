'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlusCircle,
  Search,
  RefreshCw,
  Eye,
  PenSquare,
  Trash2,
  MoreHorizontal,
  AlertTriangle
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useReservations } from '@/hooks/resource/physical/use-reservations';
import type {
  Reservation,
  ReservationFilters,
  ReservationStatus
} from '@/types/resources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'react-hot-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

export default function ReservationsPage() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<ReservationFilters>({
    limit: 10,
    page: 1
  });
  const [status, setStatus] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<string | null>(
    null
  );

  const {
    reservations,
    loading,
    error,
    metadata: { total: totalReservations, totalPages },
    fetchReservations: fetchReservationsFromHook,
    updateFilters,
    deleteReservation
  } = useReservations(filters);

  const fetchReservations = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchReservationsFromHook();
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchReservationsFromHook]);

  useEffect(() => {
    fetchReservations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchReservations();
  };

  const handleSearch = () => {
    updateFilters({ search: searchQuery, page: 1 });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    if (value === 'all') {
      updateFilters({ status: undefined, page: 1 });
    } else {
      updateFilters({
        status: value as ReservationStatus,
        page: 1
      });
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    updateFilters({ page: newPage });
  };

  const getStatusBadge = (status: string) => {
    const variantMap: Record<
      string,
      'default' | 'secondary' | 'destructive' | 'outline' | 'success'
    > = {
      pending: 'outline',
      approved: 'success',
      rejected: 'destructive',
      canceled: 'secondary',
      completed: 'default'
    };

    return (
      <Badge variant={variantMap[status] || 'default'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy h:mm a');
  };

  const openDeleteDialog = (id: string) => {
    setReservationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!reservationToDelete) return;

    try {
      setDeleting(true);
      const success = await deleteReservation(reservationToDelete);
      if (success) {
        toast.success('Reservation deleted successfully');
        setDeleteDialogOpen(false);
        setReservationToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting reservation:', error);
      toast.error('Failed to delete reservation');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ContentLayout title='Reservations'>
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
              <Link href='/resources/physical-resources/dashboard'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Reservations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex justify-between items-center mt-6'>
        <h1 className='text-2xl font-bold'>Resource Reservations</h1>
        <Link href='/resources/physical-resources/reservations/new'>
          <Button>
            <PlusCircle className='mr-2 h-4 w-4' />
            New Reservation
          </Button>
        </Link>
      </div>

      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Reservations</CardTitle>
          <CardDescription>
            View and manage all resource reservations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col sm:flex-row gap-4 mb-6'>
            <div className='flex-1'>
              <div className='relative'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  type='search'
                  placeholder='Search reservations...'
                  className='pl-8'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
            <div className='w-full sm:w-[180px]'>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Statuses</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='approved'>Approved</SelectItem>
                  <SelectItem value='rejected'>Rejected</SelectItem>
                  <SelectItem value='canceled'>Canceled</SelectItem>
                  <SelectItem value='completed'>Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button
                variant='outline'
                size='icon'
                onClick={handleRefresh}
                disabled={loading || refreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className='flex justify-center items-center py-8'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : reservations.length === 0 ? (
            <div className='text-center py-8'>
              <Calendar className='h-12 w-12 mx-auto text-muted-foreground' />
              <h3 className='mt-4 text-lg font-medium'>
                No reservations found
              </h3>
              <p className='mt-2 text-sm text-muted-foreground'>
                {searchQuery || status
                  ? 'Try adjusting your filters'
                  : 'Get started by creating a new reservation'}
              </p>
              {!searchQuery && !status && (
                <Button className='mt-4' asChild>
                  <Link href='/resources/physical-resources/reservations/new'>
                    <PlusCircle className='mr-2 h-4 w-4' />
                    New Reservation
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>S.No</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map((reservation, index) => (
                      <TableRow key={reservation.id}>
                        <TableCell className='font-medium'>
                          {index + 1}
                        </TableCell>
                        <TableCell className='font-medium'>
                          <Link
                            href={`/resources/physical-resources/reservations/${reservation.id}`}
                            className='hover:underline'
                          >
                            {reservation.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {reservation.resource ? (
                            <Link
                              href={`/resources/${reservation.resource_id}`}
                              className='hover:underline'
                            >
                              {reservation.resource.resource_name}
                            </Link>
                          ) : (
                            'Unknown Resource'
                          )}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.start_datetime)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.end_datetime)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(reservation.status)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <TooltipProvider>
                            <DropdownMenu>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant='ghost'
                                      className='h-8 w-8 p-0'
                                    >
                                      <span className='sr-only'>Open menu</span>
                                      <MoreHorizontal className='h-4 w-4' />
                                    </Button>
                                  </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Reservation Actions</p>
                                </TooltipContent>
                              </Tooltip>
                              <DropdownMenuContent align='end'>
                                <Link
                                  href={`/resources/physical-resources/reservations/${reservation.id}`}
                                >
                                  <DropdownMenuItem>
                                    <Eye className='h-4 w-4 mr-2' />
                                    View
                                  </DropdownMenuItem>
                                </Link>
                                {/* Note: The edit page needs to be created at /resources/reservations/[id]/edit */}
                                <Link
                                  href={`/resources/physical-resources/reservations/${reservation.id}/edit`}
                                >
                                  <DropdownMenuItem>
                                    <PenSquare className='h-4 w-4 mr-2' />
                                    Edit
                                  </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                  className='text-red-600'
                                  onClick={() =>
                                    openDeleteDialog(reservation.id)
                                  }
                                >
                                  <Trash2 className='h-4 w-4 mr-2' />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className='flex justify-between items-center mt-4'>
                  <div className='text-sm text-muted-foreground'>
                    Showing {(currentPage - 1) * filters.limit! + 1} to{' '}
                    {Math.min(currentPage * filters.limit!, totalReservations)}{' '}
                    of {totalReservations} reservations
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </Button>
                    <div className='text-sm'>
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this reservation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setDeleteDialogOpen(false);
                setReservationToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete Reservation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
