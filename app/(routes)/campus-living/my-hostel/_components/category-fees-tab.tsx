'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { Building2, UtensilsCrossed, Loader2, CalendarClock } from 'lucide-react';
import { RoomCategoryUpgradeCard } from './room-category-upgrade-card';
import { MessCategoryUpgradeCard } from './mess-category-upgrade-card';

// ---------------------------------------------------------------------------
// CategoryFeesTab
// ---------------------------------------------------------------------------
export function CategoryFeesTab() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const { data: summary, isLoading } = useMyHostelSummary();

  // Same key the page/overview use — React Query dedupes. Drives book vs upgrade.
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', profileId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(profileId, true),
    enabled: !!profileId,
  });
  const hasAllocation = ((allocations ?? []) as unknown[]).length > 0;

  if (isLoading || allocLoading) {
    return (
      <div className='flex items-center justify-center min-h-[200px]'>
        <Loader2 className='h-6 w-6 animate-spin text-primary' />
      </div>
    );
  }

  // Book-vs-upgrade is driven by the current category's ALLOCATION MODE, not by
  // whether a room is held. MANUAL categories (e.g. Premium) are self-booked, so
  // those residents get "Book a Room"; AUTO categories (Classic/Deluxe) are
  // office-allocated, so those residents only ever see upgrade options — even
  // before they hold a room (Classic → Deluxe / Premium). An allocated resident
  // never books a first room, so booking is additionally gated on having none.
  const currentCategory = summary?.hostelCategory ?? null;
  const showBook = currentCategory?.allocation_mode === 'manual' && !hasAllocation;

  if (showBook) {
    return (
      <div className='space-y-6'>
        <div>
          <h2 className='text-lg font-semibold'>Book Your Room</h2>
          <p className='text-sm text-muted-foreground'>
            You don&apos;t have a hostel room yet. Pick one below to book it instantly — your room
            and mess category are set automatically once booked.
          </p>
        </div>
        <RoomCategoryUpgradeCard currentCategoryName={currentCategory?.name ?? null} mode='book' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Category summary */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5 text-primary' />
            Your Category Assignment
          </CardTitle>
          <CardDescription>Room and mess categories linked to your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <Building2 className='h-4 w-4' />
                Room Category
              </div>
              <p className='font-medium'>{summary?.hostelCategory?.name ?? '—'}</p>
              {summary?.pendingHostelCategory && (
                <Badge
                  variant='outline'
                  className='mt-1.5 border-amber-400 text-amber-700 dark:text-amber-400'
                >
                  <CalendarClock className='mr-1 h-3 w-3' />
                  Upgrading to {summary.pendingHostelCategory.name} · pending payment
                </Badge>
              )}
            </div>

            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <UtensilsCrossed className='h-4 w-4' />
                Mess Category
              </div>
              <p className='font-medium'>{summary?.messCategory?.name ?? '—'}</p>
            </div>

            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <Building2 className='h-4 w-4' />
                Hostel Type
              </div>
              <p className='font-medium capitalize'>
                {summary?.hostelCategory?.type ?? '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Self-service upgrades */}
      <RoomCategoryUpgradeCard
        currentCategoryName={summary?.hostelCategory?.name ?? null}
        mode='upgrade'
      />
      <MessCategoryUpgradeCard
        currentMessName={summary?.messCategory?.name ?? null}
      />
    </div>
  );
}
