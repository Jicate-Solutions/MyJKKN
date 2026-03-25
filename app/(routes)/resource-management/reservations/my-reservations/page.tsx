// app/(routes)/resource-management/reservations/my-reservations/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReservationFilters } from './_components/reservation-filters';
import { ReservationCard } from './_components/reservation-card';
import { useAuth } from '@/hooks/use-auth';
import { useMyReservations } from '@/hooks/reservation/use-reservations';
import {
  useCancelReservation,
  useCheckInReservation,
  useCheckOutReservation
} from '@/hooks/reservation/use-reservation-operations';
import { ReservationStatus } from '@/types/reservation';
import { useRouter } from 'next/navigation';

export default function MyReservationsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Fetch reservations
  const { data: reservations = [], isLoading } = useMyReservations(
    user?.id || ''
  );

  // Mutations
  const cancelReservation = useCancelReservation();
  const checkInReservation = useCheckInReservation();
  const checkOutReservation = useCheckOutReservation();

  // Filter reservations
  const filteredReservations = useMemo(() => {
    let filtered = [...reservations];

    // Tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter((r) => r.status === activeTab);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.resource?.name?.toLowerCase().includes(query) ||
          r.purpose?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Date filter
    const now = new Date();
    if (dateFilter === 'upcoming') {
      filtered = filtered.filter((r) => new Date(r.start_time) > now);
    } else if (dateFilter === 'past') {
      filtered = filtered.filter((r) => new Date(r.end_time) < now);
    } else if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      filtered = filtered.filter(
        (r) =>
          new Date(r.start_time) >= today && new Date(r.start_time) < tomorrow
      );
    } else if (dateFilter === 'this_week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      filtered = filtered.filter(
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
      filtered = filtered.filter(
        (r) =>
          new Date(r.start_time) >= monthStart &&
          new Date(r.start_time) < monthEnd
      );
    }

    // Sort by start time (newest first)
    return filtered.sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );
  }, [reservations, activeTab, searchQuery, statusFilter, dateFilter]);

  // Count reservations by status
  const counts = useMemo(() => {
    return {
      all: reservations.length,
      pending: reservations.filter(
        (r) => r.status === ReservationStatus.PENDING
      ).length,
      approved: reservations.filter(
        (r) => r.status === ReservationStatus.APPROVED
      ).length,
      completed: reservations.filter(
        (r) => r.status === ReservationStatus.COMPLETED
      ).length,
      cancelled: reservations.filter(
        (r) =>
          r.status === ReservationStatus.CANCELLED ||
          r.status === ReservationStatus.REJECTED
      ).length
    };
  }, [reservations]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFilter('all');
  };

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

      {/* Header Actions */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold'>My Reservations</h1>
          <p className='text-muted-foreground'>
            Manage and track your resource reservations
          </p>
        </div>
        <Button
          onClick={() => router.push('/resource-management/reservations/new')}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Reservation
        </Button>
      </div>

      {/* Filters */}
      <div className='mb-6'>
        <ReservationFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-6'
      >
        <TabsList className='grid w-full grid-cols-5'>
          <TabsTrigger value='all'>All ({counts.all})</TabsTrigger>
          <TabsTrigger value='pending'>Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value='approved'>
            Approved ({counts.approved})
          </TabsTrigger>
          <TabsTrigger value='completed'>
            Completed ({counts.completed})
          </TabsTrigger>
          <TabsTrigger value='cancelled'>
            Cancelled ({counts.cancelled})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className='space-y-6'>
          {/* Results Count */}
          <div className='flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>
              {isLoading ? (
                'Loading reservations...'
              ) : (
                <>
                  <span className='font-semibold'>
                    {filteredReservations.length}
                  </span>{' '}
                  reservation{filteredReservations.length !== 1 ? 's' : ''}{' '}
                  found
                </>
              )}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className='h-[200px]' />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredReservations.length === 0 && (
            <div className='py-12 text-center'>
              <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
                <Plus className='h-8 w-8 text-muted-foreground' />
              </div>
              <h3 className='mb-2 text-lg font-semibold'>
                No reservations found
              </h3>
              <p className='text-sm text-muted-foreground mb-4'>
                {searchQuery || statusFilter !== 'all' || dateFilter !== 'all'
                  ? 'Try adjusting your filters or search query'
                  : 'Get started by creating your first reservation'}
              </p>
              <Button
                onClick={() =>
                  router.push('/resource-management/reservations/new')
                }
              >
                <Plus className='mr-2 h-4 w-4' />
                Create Reservation
              </Button>
            </div>
          )}

          {/* Reservations Grid */}
          {!isLoading && filteredReservations.length > 0 && (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {filteredReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  onCancel={handleCancel}
                  onCheckIn={handleCheckIn}
                  onCheckOut={handleCheckOut}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}
