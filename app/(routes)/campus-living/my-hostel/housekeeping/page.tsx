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
  typeQuota,
} from '@/lib/services/campus-living/housekeeping-rules';
import { CurrentBookingCard } from './_components/current-booking-card';
import {
  LEARNER_STATUS_LABEL,
  LEARNER_STATUS_TONE,
  bookingDateLabel,
  hhmm,
} from './_components/learner-booking-status';
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
   * Quota per type, counted PER ROOM. typeQuota mirrors fn_cl_housekeeping_book
   * step 6 -- crucially including the fact that the window is anchored on the
   * date being BOOKED, not on today, so a booking made for tomorrow still counts.
   */
  const quotaByType = useMemo(() => {
    const out = new Map<string, ReturnType<typeof typeQuota>>();
    for (const t of types) {
      out.set(
        t.id,
        typeQuota({
          bookings,
          typeId: t.id,
          usageLimit: t.usage_limit_count,
          usagePeriod: t.usage_period,
          today,
        }),
      );
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
          <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>Room Cleaning</h1>
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

        {/* 2. The live booking, or the booking flow. Never both — the room lock
            allows exactly one open cleaning at a time. */}
        <section className='space-y-3'>
          <h2 className='text-sm font-semibold'>
            {liveBooking ? 'Your current cleaning' : 'Book a cleaning'}
          </h2>

          {liveBooking ? (
            <CurrentBookingCard
              booking={liveBooking}
              today={today}
              cancelling={cancel.isPending}
              onCancel={(bookingId) => cancel.mutate({ bookingId })}
            />
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
                quotaByType={quotaByType}
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
          {/* One column on a phone: the date and status stack under the type
              name rather than being squeezed onto one line. */}
          <div className='space-y-2'>
            {bookings.map((b) => (
              <Card key={b.id}>
                <CardContent className='flex items-start justify-between gap-3 p-3'>
                  <div className='min-w-0 space-y-0.5'>
                    <p className='text-sm font-medium'>{b.type_name}</p>
                    <p className='text-xs text-muted-foreground'>
                      {bookingDateLabel(b.booking_date)} · {hhmm(b.slot_start)}–
                      {hhmm(b.slot_end)}
                    </p>
                    {b.cleaner_name && (
                      <p className='text-xs text-muted-foreground'>
                        Cleaner: {b.cleaner_name}
                      </p>
                    )}
                    {b.status === 'completed' && b.average_rating != null && (
                      <p className='text-xs text-muted-foreground'>
                        Rated {b.average_rating} / 5
                      </p>
                    )}
                  </div>
                  <div className='flex shrink-0 flex-col items-end gap-1.5'>
                    <Badge
                      className={LEARNER_STATUS_TONE[b.status]}
                      variant='secondary'
                    >
                      {LEARNER_STATUS_LABEL[b.status]}
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
