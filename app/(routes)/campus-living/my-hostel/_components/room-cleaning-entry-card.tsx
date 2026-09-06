'use client';

// ============================================================================
// ROOM CLEANING ENTRY — only for residents whose room category includes it
// ============================================================================
// Created: 2026-08-25
//
// My Hostel used to show every resident an unconditional "Book a 10-minute
// housekeeping slot for your room" card. Slot booking is a Premium-room
// feature, so for the 585 residents in a Classic or Deluxe category that card
// was a promise the next page immediately refused.
//
// Self-gating follows PremiumInviteEntryCard next door: render nothing unless
// the resident is actually entitled, so nobody is sent to a page that will
// turn them away. The upgrade funnel is untouched — the "Room Cleaning" nav
// chip still opens the page, and the page still shows the upsell card that
// links to /campus-living/my-hostel/premium.
//
// Entitlement comes from useMyEntitlement() → fn_housekeeping_my_entitlement,
// the same SECURITY DEFINER answer the booking page and fn_housekeeping_book_slot
// use, on the same React Query key — so this card costs no extra request once
// the resident opens Room Cleaning.
// ============================================================================

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMyEntitlement } from '@/hooks/campus-living/use-housekeeping-bookings';
import { Brush, ChevronRight } from 'lucide-react';

export function RoomCleaningEntryCard() {
  const { data: entitlement } = useMyEntitlement();

  if (entitlement?.entitled !== true) return null;

  const remaining = Math.max(
    0,
    (entitlement.weeklyQuota ?? 0) - (entitlement.usedThisWeek ?? 0)
  );

  return (
    <Link href='/campus-living/my-hostel/housekeeping' className='block'>
      <Card className='transition-colors hover:bg-muted/50'>
        <CardContent className='flex items-center gap-3 p-4'>
          <Brush className='h-5 w-5 shrink-0 text-primary' />
          <div className='min-w-0 flex-1'>
            <p className='font-medium'>Room Cleaning</p>
            <p className='text-sm text-muted-foreground'>
              Book a 10-minute housekeeping slot for your room.
            </p>
          </div>
          <Badge variant='outline' className='shrink-0'>
            {remaining === 0
              ? 'None left this week'
              : `${remaining} left this week`}
          </Badge>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </CardContent>
      </Card>
    </Link>
  );
}
