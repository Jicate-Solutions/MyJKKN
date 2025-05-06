'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { BeatLoader } from 'react-spinners';
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
import { usePermissions } from '@/hooks/use-permissions';

export default function ReservationsPage() {
  const router = useRouter();
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
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canViewReservations =
    isSuperAdmin || canAccess('physical_resources.reservations', 'view');
  const canCreateReservations =
    isSuperAdmin || canAccess('physical_resources.reservations', 'create');
  const canEditReservations =
    isSuperAdmin || canAccess('physical_resources.reservations', 'edit');
  const canDeleteReservations =
    isSuperAdmin || canAccess('physical_resources.reservations', 'delete');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Reservations List permissions debug:', {
        isSuperAdmin,
        canViewReservations: canAccess(
          'physical_resources.reservations',
          'view'
        ),
        canCreateReservations: canAccess(
          'physical_resources.reservations',
          'create'
        ),
        canEditReservations: canAccess(
          'physical_resources.reservations',
          'edit'
        ),
        canDeleteReservations: canAccess(
          'physical_resources.reservations',
          'delete'
        )
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

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
    if (!canViewReservations) return;

    try {
      setRefreshing(true);
      await fetchReservationsFromHook();
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchReservationsFromHook, canViewReservations]);

  useEffect(() => {
    // Only proceed if permissions are loaded
    if (!permissionsLoaded) return;

    if (!canViewReservations) {
      console.log('User does not have permission to view reservations');
      router.push('/unauthorized');
      return;
    }

    fetchReservations();
  }, [permissionsLoaded, canViewReservations, fetchReservations, router]);

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
    if (!canDeleteReservations) {
      toast.error('You do not have permission to delete reservations');
      return;
    }
    setReservationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!reservationToDelete || !canDeleteReservations) return;

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

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Reservations'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading permissions...</span>
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canViewReservations) {
    return (
      <ContentLayout title='Reservations'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view reservations
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/physical-resources/dashboard'>
              Back to Resource Management
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

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
              <Link href='/resources/physical-resources/dashboard'>
                Resource Management
              </Link>
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
        {canCreateReservations && (
          <Link href='/resources/physical-resources/reservations/new'>
            <Button>
              <PlusCircle className='mr-2 h-4 w-4' />
              New Reservation
            </Button>
          </Link>
        )}
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
            <div className='w-full sm:w-48'>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder='Filter by status' />
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='outline'
                      size='icon'
                      onClick={handleRefresh}
                      disabled={refreshing}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${
                          refreshing ? 'animate-spin' : ''
                        }`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh reservations</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <Button
                variant='outline'
                className='w-full'
                onClick={handleSearch}
              >
                Search
              </Button>
            </div>
          </div>

          {loading && !refreshing ? (
            <div className='flex justify-center items-center p-8'>
              <Loader2 className='h-8 w-8 animate-spin mr-2' />
              <span>Loading reservations...</span>
            </div>
          ) : error ? (
            <div className='text-center p-8 text-destructive'>
              <p>{error}</p>
              <Button
                variant='outline'
                onClick={handleRefresh}
                className='mt-4'
              >
                Try Again
              </Button>
            </div>
          ) : reservations.length === 0 ? (
            <div className='text-center p-8 border rounded-md'>
              <p className='text-muted-foreground mb-4'>
                No reservations found
              </p>
              {canCreateReservations && (
                <Link href='/resources/physical-resources/reservations/new'>
                  <Button>
                    <PlusCircle className='mr-2 h-4 w-4' />
                    Create Reservation
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className='border rounded-md overflow-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map((reservation) => (
                      <TableRow key={reservation.id}>
                        <TableCell className='font-medium'>
                          {reservation.title}
                        </TableCell>
                        <TableCell>
                          {reservation.resource?.resource_name ||
                            'Resource Not Found'}
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant='ghost' size='sm'>
                                <MoreHorizontal className='h-4 w-4' />
                                <span className='sr-only'>Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/resources/physical-resources/reservations/${reservation.id}`}
                                >
                                  <Eye className='mr-2 h-4 w-4' />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              {canEditReservations && (
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/resources/physical-resources/reservations/${reservation.id}/edit`}
                                  >
                                    <PenSquare className='mr-2 h-4 w-4' />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {canDeleteReservations && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    openDeleteDialog(reservation.id)
                                  }
                                  className='text-destructive focus:text-destructive'
                                >
                                  <Trash2 className='mr-2 h-4 w-4' />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className='flex justify-between items-center mt-4'>
                <div className='text-sm text-muted-foreground'>
                  Showing {(currentPage - 1) * filters.limit! + 1} to{' '}
                  {Math.min(currentPage * filters.limit!, totalReservations)} of{' '}
                  {totalReservations} reservations
                </div>
                <div className='flex items-center space-x-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className='h-4 w-4' />
                    <span className='sr-only'>Previous Page</span>
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
                    <span className='sr-only'>Next Page</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <AlertTriangle className='h-5 w-5 text-destructive mr-2' />
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
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
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
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
