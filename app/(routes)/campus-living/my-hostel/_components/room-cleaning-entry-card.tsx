'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, ChevronRight, Star } from 'lucide-react';
import {
  useMyAllocation,
  useMyBookings,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { useBookableTypes } from '@/hooks/campus-living/use-housekeeping-types';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';

/**
 * My Hostel entry card for room cleaning.
 *
 * Renders NOTHING unless the resident's category actually has a bookable
 * cleaning type. This is the one idea worth keeping from the old module: never
 * advertise a feature the next page would refuse. Eligibility is decided by the
 * resident's BILLED category, the same axis fn_cl_housekeeping_book uses since
 * 2026-11-28 — a Premium resident seated in a Deluxe room keeps Premium
 * benefits, so the seated room is the wrong axis to ask.
 */
export function RoomCleaningEntryCard() {
  const { data: allocation } = useMyAllocation();
  const { data: summary } = useMyHostelSummary();
  const { data: types = [], isLoading } = useBookableTypes(summary?.hostelCategory?.id);
  const { data: bookings = [] } = useMyBookings(allocation?.room_id);

  if (isLoading || !allocation || types.length === 0) return null;

  const awaiting = bookings.find((b) => b.status === 'awaiting_feedback');
  const live = bookings.find((b) =>
    ['booked', 'assigned', 'in_progress'].includes(b.status),
  );

  return (
    <Link href='/campus-living/my-hostel/housekeeping' className='block'>
      <Card className='transition-colors hover:bg-accent'>
        <CardContent className='flex items-center justify-between gap-3 p-4'>
          <div className='flex items-center gap-3'>
            <Brush className='h-5 w-5 text-muted-foreground' />
            <div>
              <p className='font-medium'>Room Cleaning</p>
              <p className='text-sm text-muted-foreground'>
                {awaiting
                  ? 'Rate your last cleaning to release attendance'
                  : live
                    ? `${live.type_name} booked for ${live.booking_date}`
                    : `${types.length} cleaning ${types.length === 1 ? 'type' : 'types'} available to book`}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            {awaiting && (
              <Badge variant='destructive'>
                <Star className='mr-1 h-3 w-3' /> Rating due
              </Badge>
            )}
            <ChevronRight className='h-4 w-4 text-muted-foreground' />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
