'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useMyAllocation,
  useMyBookings,
  useCancelBooking,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { useBookableTypes } from '@/hooks/campus-living/use-housekeeping-types';
import {
  canLearnerCancel,
  quotaWindowStart,
} from '@/lib/services/campus-living/housekeeping-rules';
import { TypePicker } from './_components/type-picker';
import { SlotGrid } from './_components/slot-grid';
import { RateCleaningCard } from './_components/rate-cleaning-card';
import type { CleaningTypeWithDetail } from '@/types/campus-living/housekeeping';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MyHousekeepingPage() {
  // useAuth() exposes only { profile, isLoading, error }; profile.id IS the
  // auth.uid() / profiles.id that hostel_cleaning_feedback.learner_id expects.
  const { profile } = useAuth();
  const [selectedType, setSelectedType] = useState<CleaningTypeWithDetail | null>(null);

  const { data: allocation, isLoading: allocLoading } = useMyAllocation();
  const { data: types = [], isLoading: typesLoading } = useBookableTypes(allocation?.room_id);
  const { data: bookings = [], isLoading: bookingsLoading } = useMyBookings(allocation?.room_id);
  const cancel = useCancelBooking();

  const today = todayLocal();

  /** Live booking that currently locks the room, if any. */
  const liveBooking = useMemo(
    () =>
      bookings.find((b) =>
        ['booked', 'assigned', 'in_progress', 'awaiting_feedback'].includes(b.status),
      ) ?? null,
    [bookings],
  );

  /** The one awaiting a rating — the most urgent thing on this page. */
  const awaitingFeedback = useMemo(
    () => bookings.find((b) => b.status === 'awaiting_feedback') ?? null,
    [bookings],
  );

  /**
   * Remaining quota per type, counted PER ROOM over the type's own rolling
   * window. Mirrors fn_cl_housekeeping_book step 6; the RPC remains the
   * authority, this only avoids a pointless round trip.
   */
  const remainingByType = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of types) {
      const windowStart = quotaWindowStart(today, t.usage_period);
      const used = bookings.filter(
        (b) =>
          b.type_id === t.id &&
          b.status !== 'cancelled' &&
          b.booking_date >= windowStart &&
          b.booking_date <= today,
      ).length;
      out.set(t.id, Math.max(0, t.usage_limit_count - used));
    }
    return out;
  }, [types, bookings, today]);

  if (allocLoading) {
    return (
      <ContentLayout title='Room Cleaning'>
        <p className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> Loading your room…
        </p>
      </ContentLayout>
    );
  }

  if (!allocation) {
    return (
      <ContentLayout title='Room Cleaning'>
        <PageBreadcrumb
          items={[
            { label: 'My Hostel', href: '/campus-living/my-hostel' },
            { label: 'Room Cleaning' },
          ]}
        />
        <Card>
          <CardContent className='p-10 text-center text-sm text-muted-foreground'>
            You do not have a hostel room right now, so there is nothing to clean here.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Room Cleaning'>
      <PageBreadcrumb
        items={[
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Room Cleaning' },
        ]}
      />

      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Room Cleaning</h1>
          <p className='text-sm text-muted-foreground'>
            Room {allocation.room_number ?? '—'} · bookings and limits are shared with your
            roommates.
          </p>
        </div>

        {/* 1. Rate — the most urgent thing when it exists */}
        {awaitingFeedback && (
          <RateCleaningCard
            booking={awaitingFeedback}
            allocation={allocation}
            learnerId={profile?.id ?? ''}
            isOverdue={awaitingFeedback.booking_date < today}
          />
        )}

        {/* 2. Book */}
        <section className='space-y-3'>
          <h2 className='text-sm font-semibold'>Book a cleaning</h2>

          {liveBooking ? (
            <Card>
              <CardContent className='space-y-2 p-4 text-sm'>
                <p>
                  A cleaning is already booked for your room —{' '}
                  <strong>{liveBooking.type_name}</strong> on {liveBooking.booking_date} at{' '}
                  {liveBooking.slot_start?.slice(0, 5)}. Only one at a time.
                </p>
                {canLearnerCancel(liveBooking.status) && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate({ bookingId: liveBooking.id })}
                  >
                    Cancel it
                  </Button>
                )}
                {!canLearnerCancel(liveBooking.status) && liveBooking.status !== 'awaiting_feedback' && (
                  <p className='text-muted-foreground'>
                    A cleaner is on the way, so this can no longer be cancelled here.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : typesLoading ? (
            <p className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading cleaning types…
            </p>
          ) : types.length === 0 ? (
            <Card>
              <CardContent className='flex flex-col items-center gap-2 p-8 text-center'>
                <Sparkles className='h-6 w-6 text-muted-foreground' />
                <p className='text-sm text-muted-foreground'>
                  No cleaning is offered for your room type yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <TypePicker
                types={types}
                remainingByType={remainingByType}
                selectedId={selectedType?.id ?? null}
                onSelect={setSelectedType}
              />
              {selectedType && (
                <SlotGrid
                  roomId={allocation.room_id}
                  type={selectedType}
                  onBooked={() => setSelectedType(null)}
                />
              )}
            </>
          )}
        </section>

        {/* 3. History */}
        <section className='space-y-3'>
          <h2 className='text-sm font-semibold'>Your bookings</h2>
          {bookingsLoading && (
            <p className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </p>
          )}
          {!bookingsLoading && bookings.length === 0 && (
            <p className='text-sm text-muted-foreground'>Nothing booked yet.</p>
          )}
          <div className='space-y-2'>
            {bookings.map((b) => (
              <Card key={b.id}>
                <CardContent className='flex flex-wrap items-center justify-between gap-2 p-3 text-sm'>
                  <div>
                    <span className='font-medium'>{b.type_name}</span>
                    <span className='text-muted-foreground'>
                      {' '}
                      · {b.booking_date} at {b.slot_start?.slice(0, 5)}
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Badge variant={b.status === 'cancelled' ? 'outline' : 'secondary'}>
                      {b.status.replace(/_/g, ' ')}
                    </Badge>
                    {canLearnerCancel(b.status) && (
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ bookingId: b.id })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </ContentLayout>
  );
}
