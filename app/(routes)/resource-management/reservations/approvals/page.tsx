// app/(routes)/resource-management/reservations/approvals/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ApprovalStatsCards } from './_components/approval-stats-cards';
import { ApprovalFilters } from './_components/approval-filters';
import { PendingApprovalCard } from './_components/pending-approval-card';
import { ApprovalActionsDialog } from './_components/approval-actions-dialog';
import {
  usePendingApprovals,
  useApprovalStats
} from '@/hooks/reservation/use-reservations';
import { useAuth } from '@/hooks/use-auth';
import type { Reservation, ReservationPriority } from '@/types/reservation';
import { CheckCircle2 } from 'lucide-react';

export default function ApprovalsPage() {
  const { profile: user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  // Fetch pending approvals and statistics
  const { data: reservations = [], isLoading } = usePendingApprovals();
  const { data: stats, isLoading: loadingStats } = useApprovalStats();

  // Use real-time stats from the hook
  const approvalStats = {
    pending_approvals: stats?.pending_approvals || 0,
    approved_today: stats?.approved_today || 0,
    rejected_today: stats?.rejected_today || 0,
    overdue_approvals: stats?.overdue_approvals || 0
  };

  // Filter and sort reservations
  const filteredReservations = useMemo(() => {
    let filtered = [...reservations];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.resource?.name?.toLowerCase().includes(query) ||
          r.purpose?.toLowerCase().includes(query) ||
          r.user?.full_name?.toLowerCase().includes(query)
      );
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(
        (r) => r.priority === parseInt(priorityFilter)
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'start_time':
          return (
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          );
        case 'priority':
          return b.priority - a.priority; // High priority first
        case 'created_at':
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });

    return filtered;
  }, [reservations, searchQuery, priorityFilter, sortBy]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setSortBy('created_at');
  };

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

      {/* Filters */}
      <div className='mb-6'>
        <ApprovalFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Results Count */}
      <div className='flex items-center justify-between mb-4'>
        <p className='text-sm text-muted-foreground'>
          {isLoading ? (
            'Loading approvals...'
          ) : (
            <>
              <span className='font-semibold'>
                {filteredReservations.length}
              </span>{' '}
              approval{filteredReservations.length !== 1 ? 's' : ''} pending
            </>
          )}
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className='h-[280px]' />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredReservations.length === 0 && (
        <div className='py-12 text-center'>
          <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50'>
            <CheckCircle2 className='h-8 w-8 text-green-600' />
          </div>
          <h3 className='mb-2 text-lg font-semibold'>
            {searchQuery || priorityFilter !== 'all'
              ? 'No approvals found'
              : 'All caught up!'}
          </h3>
          <p className='text-sm text-muted-foreground'>
            {searchQuery || priorityFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'There are no pending approvals at the moment'}
          </p>
        </div>
      )}

      {/* Approvals Grid */}
      {!isLoading && filteredReservations.length > 0 && (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {filteredReservations.map((reservation) => (
            <PendingApprovalCard
              key={reservation.id}
              reservation={reservation}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {/* Approval Actions Dialog */}
      <ApprovalActionsDialog
        reservation={selectedReservation}
        action={action}
        onClose={handleCloseDialog}
      />
    </ContentLayout>
  );
}
