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
  Search
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
import { ReservationService } from '@/lib/services/resource/reservation-service';
import type { Reservation, ReservationFilters, ReservationStatus } from '@/types/resources';

export default function ReservationsPage() {
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [totalReservations, setTotalReservations] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<ReservationFilters>({
    page: 1,
    limit: 10
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | string | undefined>('');

  const fetchReservations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await ReservationService.getReservations(filters);
      setReservations(response.data);
      setTotalReservations(response.metadata.total);
      setTotalPages(response.metadata.totalPages);
      setCurrentPage(response.metadata.page);
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleSearch = () => {
    setFilters({
      ...filters,
      search: searchQuery,
      page: 1
    });
  };

  const handleStatusChange = (value: string) => {
    // Convert "all" or "undefined" to undefined
    const typedValue = value === "all" || value === "undefined" 
      ? undefined 
      : value as ReservationStatus;
    
    setStatusFilter(typedValue);
    setFilters({
      ...filters,
      status: typedValue,
      page: 1
    });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setFilters({
      ...filters,
      page: newPage
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
      canceled: { color: 'bg-gray-100 text-gray-800', label: 'Canceled' },
      completed: { color: 'bg-blue-100 text-blue-800', label: 'Completed' }
    };

    const { color, label } = statusMap[status] || {
      color: 'bg-gray-100 text-gray-800',
      label: status
    };

    return <Badge className={color}>{label}</Badge>;
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy h:mm a');
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
              <Link href='/resources'>Resource Management</Link>
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
        <Link href='/resources/reservations/new'>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
              </div>
            </div>
            <div className='w-full sm:w-[180px]'>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='approved'>Approved</SelectItem>
                  <SelectItem value='rejected'>Rejected</SelectItem>
                  <SelectItem value='canceled'>Canceled</SelectItem>
                  <SelectItem value='completed'>Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className='flex justify-center items-center py-8'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : reservations.length === 0 ? (
            <div className='text-center py-8'>
              <Calendar className='h-12 w-12 mx-auto text-muted-foreground' />
              <h3 className='mt-4 text-lg font-medium'>No reservations found</h3>
              <p className='mt-2 text-sm text-muted-foreground'>
                {filters.search || filters.status
                  ? 'Try adjusting your filters'
                  : 'Get started by creating a new reservation'}
              </p>
              {!filters.search && !filters.status && (
                <Button className='mt-4' asChild>
                  <Link href='/resources/reservations/new'>
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
                          <Link
                            href={`/resources/reservations/${reservation.id}`}
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
                          <Link
                            href={`/resources/reservations/${reservation.id}`}
                          >
                            <Button variant='outline' size='sm'>
                              View
                            </Button>
                          </Link>
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
                    {Math.min(
                      currentPage * filters.limit!,
                      totalReservations
                    )}{' '}
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
    </ContentLayout>
  );
}
