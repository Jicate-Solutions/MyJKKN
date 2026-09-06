'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { Building2, UtensilsCrossed, Loader2, CalendarClock, Info } from 'lucide-react';
import { RoomCategoryUpgradeCard } from './room-category-upgrade-card';
import { MessCategoryUpgradeCard } from './mess-category-upgrade-card';
import { RoomChangeCard } from './room-change-card';
import { useMyUpgradeWaitlist } from '@/hooks/campus-living/use-category-upgrade';

// ---------------------------------------------------------------------------
// CategoryFeesTab
// ---------------------------------------------------------------------------
export function CategoryFeesTab() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const { data: summary, isLoading } = useMyHostelSummary();
  // Optimistic upgrade: the category is already flipped to the new one. An active hold whose
  // target equals the current category means the upgrade is provisional — pay the fee by the
  // deadline or the hourly job reverts it. fn_my_upgrade_waitlist returns the learner's holds.
  const { data: myWaitlist = [] } = useMyUpgradeWaitlist();
  const provisionalHold = myWaitlist.find(
    (w) => w.status === 'waiting' && w.target_category_id === summary?.hostelCategory?.id,
  );

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

  // Book-vs-upgrade is driven by the current category's ALLOCATION MODE. MANUAL
  // categories (e.g. Premium) are self-booked, so those residents get "Book a Room";
  // AUTO categories (Classic/Deluxe) are office-allocated. An allocated resident
  // never books a first room, so booking is gated on having none.
  //
  // 2026-08-20: upgrades open as soon as BOTH categories are assigned, with or without a
  // room. An upgrade acts on the category the office allocates you INTO, so doing it before
  // allocation is the point, not a bug -- you land straight in the upgraded category instead
  // of being moved twice. Without an allocation the room-level path stays closed
  // (categoryOnly below): _cl_upgrade_room_category routes a room pick with no allocation to
  // _cl_execute_first_booking, which seats the learner WITHOUT billing the upgrade or moving
  // the category -- a free Premium bed. _cl_upgrade_category_only bills correctly and leaves
  // the room to the office. Learners with no categories yet still get an explanatory note.
  const currentCategory = summary?.hostelCategory ?? null;
  const showBook = currentCategory?.allocation_mode === 'manual' && !hasAllocation;
  const upgradesEnabled = !!summary?.hostelCategory?.upgrades_enabled;
  const categoriesAssigned = !!summary?.hostelCategory?.id && !!summary?.messCategory?.id;

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
              {provisionalHold && (
                <Badge
                  variant='outline'
                  className='mt-1.5 border-amber-400 text-amber-700 dark:text-amber-400'
                >
                  <CalendarClock className='mr-1 h-3 w-3' />
                  {provisionalHold.upgrade_bill_id && (provisionalHold.upgrade_fee_amount ?? 0) > 0
                    ? `Upgrade billed — pay ₹${Math.max(0, (provisionalHold.upgrade_fee_amount ?? 0) - (provisionalHold.upgrade_fee_paid ?? 0)).toLocaleString('en-IN')}`
                    : 'Upgraded — payment due'}
                  {provisionalHold.hold_expires_at
                    ? ` by ${new Date(provisionalHold.hold_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : ''}
                  ; unpaid amounts join your fee dues
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

      {/* Self-service upgrades — available from the moment both categories are set.
          categoryOnly hides room picking until a room exists (see the note above). */}
      {upgradesEnabled && categoriesAssigned && (
        <RoomCategoryUpgradeCard
          currentCategoryName={summary?.hostelCategory?.name ?? null}
          mode='upgrade'
          categoryOnly={!hasAllocation}
        />
      )}
      {/* One-time same-category room change (Premium / Premium + AC). Self-gating:
          the card renders nothing unless the resident's category allows it. Needs a
          room to move out of, so it follows the same allocation gate as upgrades. */}
      {hasAllocation && <RoomChangeCard />}

      {upgradesEnabled && !categoriesAssigned && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Building2 className='h-5 w-5 text-primary' /> Upgrade Room Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='flex items-start gap-2 text-sm text-muted-foreground'>
              <Info className='mt-0.5 h-4 w-4 shrink-0' />
              Your room and mess categories are still being assigned. Upgrade options appear
              here once both are set — you can upgrade before your room is allocated.
            </p>
          </CardContent>
        </Card>
      )}
      {summary?.messCategory?.upgrades_enabled && (
        <MessCategoryUpgradeCard
          currentMessName={summary?.messCategory?.name ?? null}
        />
      )}
    </div>
  );
}
