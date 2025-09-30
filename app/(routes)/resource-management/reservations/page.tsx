'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Calendar, Filter, Download } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useReservations } from '@/hooks/reservation/use-reservations';
import { Reservation, ReservationStatus } from '@/types/reservation';

export default function ReservationsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: reservations, isLoading } = useReservations({
    status:
      statusFilter === 'all' ? undefined : (statusFilter as ReservationStatus)
  });

  const getStatusBadgeVariant = (
    status: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case ReservationStatus.APPROVED:
        return 'default';
      case ReservationStatus.PENDING:
        return 'secondary';
      case ReservationStatus.REJECTED:
      case ReservationStatus.CANCELLED:
        return 'destructive';
      case ReservationStatus.COMPLETED:
        return 'outline';
      default:
        return 'outline';
    }
  };

  // Filter reservations by search query
  const filteredReservations = reservations?.filter(
    (reservation) =>
      reservation.purpose?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.resource?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  const stats = [
    {
      title: 'Total Reservations',
      value: reservations?.length || 0,
      icon: Calendar
    },
    {
      title: 'Pending',
      value:
        reservations?.filter(
          (r: Reservation) => r.status === ReservationStatus.PENDING
        ).length || 0,
      icon: Filter
    },
    {
      title: 'Approved',
      value:
        reservations?.filter(
          (r: Reservation) => r.status === ReservationStatus.APPROVED
        ).length || 0,
      icon: Calendar
    },
    {
      title: 'Completed',
      value:
        reservations?.filter(
          (r: Reservation) => r.status === ReservationStatus.COMPLETED
        ).length || 0,
      icon: Calendar
    }
  ];

  return (
    <ContentLayout title='Reservations'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/resources'>
                Resource Management
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Reservations</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-6'>
        {/* Stats Cards */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <Skeleton className='h-4 w-[100px]' />
                    <Skeleton className='h-4 w-4' />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className='h-8 w-[60px]' />
                  </CardContent>
                </Card>
              ))
            : stats.map((stat) => (
                <Card key={stat.title}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>
                      {stat.title}
                    </CardTitle>
                    <stat.icon className='h-4 w-4 text-muted-foreground' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold'>{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Actions */}
        <div className='flex justify-between items-center'>
          <div className='flex gap-2'>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </Button>
            <Button
              variant={statusFilter === 'approved' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('approved')}
            >
              Approved
            </Button>
            <Button
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('completed')}
            >
              Completed
            </Button>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' size='sm'>
              <Download className='mr-2 h-4 w-4' />
              Export
            </Button>
            <Button
              onClick={() =>
                router.push('/resource-management/reservations/new')
              }
            >
              <Plus className='mr-2 h-4 w-4' />
              New Reservation
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Reservations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='mb-4'>
              <Input
                placeholder='Search by purpose or resource...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='max-w-sm'
              />
            </div>
            {isLoading ? (
              <div className='space-y-4'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-16 w-full' />
                ))}
              </div>
            ) : (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Reserved By</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations && filteredReservations.length > 0 ? (
                      filteredReservations.map((reservation) => (
                        <TableRow key={reservation.id}>
                          <TableCell>
                            <div>
                              <div className='font-medium'>
                                {reservation.resource?.name}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                {reservation.resource?.parent_category?.name} →{' '}
                                {reservation.resource?.subcategory?.name}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className='font-medium'>
                                {reservation.user?.full_name || 'Unknown'}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                {reservation.user?.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className='font-medium'>
                                {format(
                                  new Date(reservation.start_time),
                                  'PPP'
                                )}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                {format(new Date(reservation.start_time), 'p')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className='font-medium'>
                                {format(new Date(reservation.end_time), 'PPP')}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                {format(new Date(reservation.end_time), 'p')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div
                              className='max-w-[200px] truncate'
                              title={reservation.purpose}
                            >
                              {reservation.purpose}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getStatusBadgeVariant(
                                reservation.status
                              )}
                            >
                              {reservation.status
                                .replace('_', ' ')
                                .toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() =>
                                router.push(
                                  `/resource-management/reservations/${reservation.id}`
                                )
                              }
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className='h-24 text-center'>
                          No reservations found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
