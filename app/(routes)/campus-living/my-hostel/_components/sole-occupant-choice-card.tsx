// ============================================================================
// SOLE-OCCUPANT CHOICE — for a learner already alone in a multi-bed room
// ============================================================================
// Created: 2026-08-09
//
// Six learners are currently the only occupant of a room built for 3, 4 or 6.
// The room's cost is split between whoever lives in it, so they are carrying
// every empty bed. Nothing on their My Hostel page said so, and nothing offered
// them a way out.
//
// This card names the situation and gives two honest choices:
//   1. Move to a room that is filling up — routed to the EXISTING one-time
//      self-service room change (fn_my_room_change_* on the My Category & Fees
//      tab). No new workflow is invented: when that allowance is unavailable
//      the card says so and points at the hostel office instead.
//   2. Keep this room and pay for the empty beds — or invite people in, which
//      brings the amount down for everyone.
//
// Money comes from POST /api/campus-living/fee-quote. When the quote is
// unavailable, or when the fee band prices flat per bed so living alone costs
// no more, the card drops the numbers rather than guess.
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyRoommates, useMyRoomDetails } from '@/hooks/campus-living/use-my-hostel';
import { useRoomChangeStatus } from '@/hooks/campus-living/use-room-change';
import {
  useSoleOccupancyCost,
  formatInr,
} from '@/hooks/campus-living/use-sole-occupancy-cost';
import { BedDouble, DoorOpen, Users, Check } from 'lucide-react';

interface SoleOccupantChoiceCardProps {
  /** hostel_allocations.room_id of the resident's current room. */
  roomId: string | null | undefined;
  roomNumber: string | null | undefined;
  /** Her mess category, so the quote matches what she is billed. */
  messCategoryId?: string | null;
}

export function SoleOccupantChoiceCard({
  roomId,
  roomNumber,
  messCategoryId,
}: SoleOccupantChoiceCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const { data: roommates, isLoading: roommatesLoading } = useMyRoommates(!!roomId);
  const { data: room } = useMyRoomDetails(roomId);
  const { data: changeStatus } = useRoomChangeStatus();

  const capacity = room?.capacity ?? 0;
  const cost = useSoleOccupancyCost({
    roomId,
    roomCategoryId: room?.category_id,
    capacity,
    messCategoryId,
  });

  // Alone in a room built for more than one — nothing else qualifies.
  const alone = !roommatesLoading && (roommates ?? []).length === 0;
  if (dismissed || !roomId || !alone || capacity <= 1) return null;

  const emptyBeds = capacity - 1;
  // The existing one-time room change is the only move mechanism that exists.
  const canSelfMove = changeStatus?.allowed === true;
  // Only claim she is paying for the empty beds when the quote actually says
  // so. `ready` is false when no fee row exists for her category (year rollover
  // before fees are entered), when the request failed, and when the band prices
  // flat per bed — in all three there may be nothing extra to pay, and nudging
  // her toward an irreversible one-time room change on that premise is wrong.
  const costUnknown = !cost.ready && !cost.loading;

  return (
    <Card className='border-amber-400 bg-amber-50/60 dark:bg-amber-950/20'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <BedDouble className='h-5 w-5 text-amber-600 dark:text-amber-400' />
          You are the only one in {roomNumber ? `Room ${roomNumber}` : 'your room'}
        </CardTitle>
        <CardDescription>
          It has {capacity} beds, and {emptyBeds} {emptyBeds === 1 ? 'is' : 'are'}{' '}
          empty.{' '}
          {costUnknown ? (
            <>
              The cost of a room is shared by the people living in it, so having
              someone move in can bring your share down. We could not show your
              exact amount here — your hostel office can tell you what your room
              costs you right now.
            </>
          ) : (
            <>
              The cost of a room is shared by the people living in it, so right
              now you are paying for the empty{' '}
              {emptyBeds === 1 ? 'bed' : 'beds'} too.
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-4'>
        {cost.ready && (
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='rounded-md border bg-background p-3'>
              <p className='text-xs text-muted-foreground'>You pay now, on your own</p>
              <p className='text-xl font-bold'>{formatInr(cost.aloneTotal!)}</p>
              <p className='text-xs text-muted-foreground'>for the year</p>
            </div>
            <div className='rounded-md border bg-background p-3'>
              <p className='text-xs text-muted-foreground'>
                If all {capacity} beds fill up
              </p>
              <p className='text-xl font-bold text-emerald-700 dark:text-emerald-400'>
                {formatInr(cost.fullTotal!)}
              </p>
              <p className='text-xs text-muted-foreground'>
                for the year — {formatInr(cost.extraCost!)} less
              </p>
            </div>
          </div>
        )}

        <div className='space-y-3'>
          <p className='text-sm font-medium'>You have two choices:</p>

          {/* 1 — move somewhere that is filling up */}
          <div className='rounded-md border bg-background p-3'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              <DoorOpen className='h-4 w-4 text-primary' />
              Move to a room that is filling up
            </p>
            {canSelfMove ? (
              <>
                <p className='mt-1 text-sm text-muted-foreground'>
                  You can move once this year to another{' '}
                  {changeStatus?.category_name ?? 'room'} at no extra charge.
                  Sharing brings your share down.
                </p>
                <Button asChild size='sm' variant='outline' className='mt-2'>
                  <Link href='/campus-living/my-hostel?tab=category-fees'>
                    See rooms I can move to
                  </Link>
                </Button>
              </>
            ) : (
              <p className='mt-1 text-sm text-muted-foreground'>
                {changeStatus?.used
                  ? 'You have already used your one room change for this year. The hostel office can still move you — ask them.'
                  : 'Moving rooms is not something you can do yourself right now. Ask the hostel office and they will arrange it.'}
              </p>
            )}
          </div>

          {/* 2 — stay, and bring people in */}
          <div className='rounded-md border bg-background p-3'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              <Users className='h-4 w-4 text-primary' />
              {costUnknown
                ? 'Keep this room as it is'
                : `Keep this room and pay for the empty ${emptyBeds === 1 ? 'bed' : 'beds'}`}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              Nothing changes and you keep the room to yourself.{' '}
              {costUnknown
                ? 'If you would rather share, invite someone to move in — each person who joins lowers what everyone pays.'
                : `If you would rather not pay for the empty ${emptyBeds === 1 ? 'bed' : 'beds'}, invite someone to move in — each person who joins lowers what everyone pays.`}
            </p>
            <div className='mt-2 flex flex-wrap gap-2'>
              <Button asChild size='sm'>
                <Link href='/campus-living/my-hostel/premium/invite-roommate'>
                  <Users className='mr-2 h-4 w-4' />
                  Invite a roommate
                </Link>
              </Button>
              <Button size='sm' variant='ghost' onClick={() => setDismissed(true)}>
                <Check className='mr-2 h-4 w-4' />
                Keep my room as it is
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
