'use client';

// ============================================================================
// ROOM SHARING — what the empty beds in your room cost, and what you can do
// ============================================================================
// Created 2026-08-09 as the sole-occupant card. Rewritten 2026-08-13.
//
// THREE THINGS CHANGED, each a real gap:
//
//   1. IT ONLY APPEARED IF YOU WERE COMPLETELY ALONE. The gate was
//      `roommates.length === 0`, so four learners sharing 2-of-4 Premium rooms —
//      each carrying a whole empty bed — saw nothing at all. It now renders
//      whenever the room is under-filled.
//
//   2. IT SHOWED THE WRONG NUMBER. It named the settled TOTAL (₹1,70,000 for a
//      sole occupant of a 4-bed Premium room) as "you pay now". She is not
//      billed that: her own bed is already covered by her hostel fee plus her
//      upgrade differential. What is new money is the empty beds — ₹1,27,500 —
//      and that is now what it says.
//
//   3. IT NEVER SHOWED A DEADLINE. There is one — the settle window, restarting
//      every time someone new moves in — and she could not see it.
//
// Money comes from POST /api/campus-living/fee-quote via useSoleOccupancyCost,
// quoted twice: at today's occupancy and at a full room. The difference IS the
// empty-bed charge, because the mess fee is flat and cancels. Nothing here does
// arithmetic. When the quote cannot be produced the card drops the numbers
// rather than guess.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyRoommates, useMyRoomDetails } from '@/hooks/campus-living/use-my-hostel';
import { useRoomChangeStatus } from '@/hooks/campus-living/use-room-change';
import { useSoleOccupancyCost, formatInr } from '@/hooks/campus-living/use-sole-occupancy-cost';
import {
  useMySettleWindow,
  useRequestRoomBuyout,
  useRespondToRoomBuyout,
  useRoomBuyout,
  useRoomBuyoutQuote,
} from '@/hooks/campus-living/use-room-buyout';
import { RoomBuyoutDialog } from './room-buyout-dialog';
import { BedDouble, DoorOpen, Users, Check, CalendarClock, Lock, Loader2 } from 'lucide-react';

interface RoomSharingChoiceCardProps {
  /** hostel_allocations.room_id of the resident's current room. */
  roomId: string | null | undefined;
  roomNumber: string | null | undefined;
  /** Her mess category, so the quote matches what she is billed. */
  messCategoryId?: string | null;
  /** hostel_allocations.tier_id. Only a premium resident may invite — without
   *  it the invite page refuses her, so the CTA is withheld rather than shown
   *  as a dead end. Moving rooms stays available to everyone. */
  tierId?: string | null;
}

export function RoomSharingChoiceCard({
  roomId,
  roomNumber,
  messCategoryId,
  tierId,
}: RoomSharingChoiceCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [buyoutOpen, setBuyoutOpen] = useState(false);
  const { profile } = useAuth();
  const myId = profile?.id ?? '';

  const { data: roommates, isLoading: roommatesLoading } = useMyRoommates(!!roomId);
  const { data: room } = useMyRoomDetails(roomId);

  const capacity = room?.capacity ?? 0;
  // Me plus everyone else the own-room RPC returns.
  const residents = (roommates?.length ?? 0) + 1;
  const underFilled = !roommatesLoading && capacity > 1 && residents < capacity;
  const emptyBeds = Math.max(0, capacity - residents);

  // Every query below is gated on `underFilled`. This card sits on the default
  // Overview tab, so firing them unconditionally would cost a resident of a
  // full room several requests for a card that never renders.
  const { data: changeStatus } = useRoomChangeStatus(underFilled);
  const { data: settleWindow } = useMySettleWindow(underFilled);
  const { data: buyout } = useRoomBuyout(roomId, underFilled);
  const { data: buyoutQuote } = useRoomBuyoutQuote(roomId, underFilled);

  const cost = useSoleOccupancyCost({
    roomId: underFilled ? roomId : null,
    roomCategoryId: room?.category_id,
    capacity,
    messCategoryId,
    occupants: residents,
  });

  const requestBuyout = useRequestRoomBuyout();
  const respond = useRespondToRoomBuyout();

  if (dismissed || !roomId || !underFilled) return null;

  const canSelfMove = changeStatus?.allowed === true;
  const canInvite = !!tierId;
  // Only claim she is paying for the empty beds once the quote has said so.
  // `ready` is false while it is in flight, when no fee row exists for her
  // category, when the request failed, and when the band prices flat per bed —
  // in each of those there may be nothing extra to pay.
  const costUnknown = !cost.ready && !cost.loading;

  const myConsent = buyout?.consents.find((c) => c.learner_id === myId);
  const pendingCount = buyout?.consents.filter((c) => c.decision === 'pending').length ?? 0;
  const isPendingConsent = buyout?.status === 'pending_consent';
  const isHeld = buyout?.status === 'active';
  const iAmAsked = isPendingConsent && myConsent?.decision === 'pending';
  const canBuyOut = buyoutQuote?.eligible === true && !buyout;

  const deadline = settleWindow?.current_deadline ? new Date(settleWindow.current_deadline) : null;
  const deadlineLive = deadline && !isPast(deadline);

  return (
    <>
      <Card className='border-amber-400 bg-amber-50/60 dark:bg-amber-950/20'>
        <CardHeader>
          <CardTitle className='flex flex-wrap items-center gap-2 text-base'>
            <BedDouble className='h-5 w-5 text-amber-600 dark:text-amber-400' />
            {residents === 1
              ? `You are the only one in ${roomNumber ? `Room ${roomNumber}` : 'your room'}`
              : `${roomNumber ? `Room ${roomNumber}` : 'Your room'} has ${emptyBeds} empty ${emptyBeds === 1 ? 'bed' : 'beds'}`}
            {isHeld ? (
              <Badge variant='secondary' className='gap-1'>
                <Lock className='h-3 w-3' /> Held for you
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            It has {capacity} beds and {residents} {residents === 1 ? 'person' : 'people'}{' '}
            living in it.{' '}
            {cost.ready ? (
              <>
                The cost of a room is shared by the people in it, so right now you are
                paying for the empty {emptyBeds === 1 ? 'bed' : 'beds'} too.
              </>
            ) : (
              costUnknown && (
                <>Your hostel office can tell you what your room costs you right now.</>
              )
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-4'>
          {/* Money — the empty beds, not the settled total. */}
          {cost.ready && (
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-md border bg-background p-3'>
                <p className='text-xs text-muted-foreground'>
                  Extra you carry for the empty {emptyBeds === 1 ? 'bed' : 'beds'}
                </p>
                <p className='text-xl font-bold tabular-nums'>{formatInr(cost.extraCost!)}</p>
                <p className='text-xs text-muted-foreground'>
                  for the year, on top of your own bed
                </p>
              </div>
              <div className='rounded-md border bg-background p-3'>
                <p className='text-xs text-muted-foreground'>If all {capacity} beds fill up</p>
                <p className='text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400'>
                  {formatInr(0)}
                </p>
                <p className='text-xs text-muted-foreground'>
                  extra — you would pay only for your own bed
                </p>
              </div>
            </div>
          )}

          {/* Mess is flat per learner and does not change with occupancy, so it
              is in neither figure above — saying so stops the room charges being
              read as her whole hostel bill. Carried over from the sole-occupant
              card this one replaced (PR #2994). */}
          {cost.ready && (
            <p className='text-xs text-muted-foreground'>
              These are room charges only. Your mess (food) fee is separate and stays the
              same however many people share the room.
            </p>
          )}

          {/* Deadline. Absent while no settle window is open, which is the
              normal state until the mechanism is armed — so no countdown is
              shown rather than an invented one. */}
          {deadlineLive && !isHeld && (
            <div className='flex items-start gap-2 rounded-md border border-amber-300 bg-background p-3 dark:border-amber-800'>
              <CalendarClock className='mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400' />
              <p className='text-sm'>
                <span className='font-medium'>
                  Decide by {format(deadline!, 'd MMM')} — {formatDistanceToNow(deadline!)} left.
                </span>{' '}
                If the room is still under-filled then, the empty {emptyBeds === 1 ? 'bed' : 'beds'}{' '}
                {emptyBeds === 1 ? 'is' : 'are'} billed to whoever is living here. Every person who
                joins pushes this date back.
              </p>
            </div>
          )}

          {/* A roommate has asked to take the room and is waiting on me. */}
          {iAmAsked && buyout && (
            <div className='rounded-md border border-primary bg-background p-3'>
              <p className='text-sm font-medium'>
                A roommate wants to keep this room for the two of you
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                If you agree, each of you pays {formatInr(buyout.amount_per_resident)} for the
                empty {buyout.empty_beds === 1 ? 'bed' : 'beds'} and nobody else will be placed in
                the room. If you decline, nobody is billed and nothing changes.
              </p>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate({ buyoutId: buyout.id, agree: true, roomId: roomId! })
                  }
                >
                  {respond.isPending ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                  I agree
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate({ buyoutId: buyout.id, agree: false, roomId: roomId! })
                  }
                >
                  No thanks
                </Button>
              </div>
            </div>
          )}

          {/* I asked, and we are waiting on the others. */}
          {isPendingConsent && !iAmAsked && (
            <div className='rounded-md border bg-background p-3'>
              <p className='text-sm font-medium'>Waiting on your {pendingCount === 1 ? 'roommate' : 'roommates'}</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {pendingCount} {pendingCount === 1 ? 'person has' : 'people have'} yet to answer.
                Nothing is billed until everyone agrees.
              </p>
            </div>
          )}

          {isHeld ? (
            <div className='rounded-md border bg-background p-3'>
              <p className='flex items-center gap-2 text-sm font-medium'>
                <Lock className='h-4 w-4 text-primary' />
                This room is held for you
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                The empty {emptyBeds === 1 ? 'bed' : 'beds'} {emptyBeds === 1 ? 'is' : 'are'} paid
                for and nobody else will be placed here. Ask the hostel office if you want that
                changed.
              </p>
            </div>
          ) : (
            <div className='space-y-3'>
              <p className='text-sm font-medium'>What you can do:</p>

              {/* 1 — bring someone in */}
              <div className='rounded-md border bg-background p-3'>
                <p className='flex items-center gap-2 text-sm font-medium'>
                  <Users className='h-4 w-4 text-primary' />
                  Invite someone to move in
                </p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {canInvite ? (
                    <>
                      Every person who joins lowers what everyone pays, and pushes your
                      deadline back.
                    </>
                  ) : (
                    <>Ask the hostel office to place someone with you.</>
                  )}
                </p>
                {canInvite && (
                  <Button asChild size='sm' className='mt-2'>
                    <Link href='/campus-living/my-hostel/premium/invite-roommate'>
                      <Users className='mr-2 h-4 w-4' />
                      Invite a roommate
                    </Link>
                  </Button>
                )}
              </div>

              {/* 2 — pay for the empty beds and hold the room */}
              {canBuyOut && buyoutQuote && (
                <div className='rounded-md border bg-background p-3'>
                  <p className='flex items-center gap-2 text-sm font-medium'>
                    <Lock className='h-4 w-4 text-primary' />
                    Keep the room to {residents === 1 ? 'yourself' : 'yourselves'}
                  </p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Pay {formatInr(buyoutQuote.amount_per_resident)} for the{' '}
                    {buyoutQuote.empty_beds} empty{' '}
                    {buyoutQuote.empty_beds === 1 ? 'bed' : 'beds'} and nobody else will be
                    placed in the room.
                    {buyoutQuote.consent_required
                      ? ' Every roommate has to agree first.'
                      : ''}
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='mt-2'
                    onClick={() => setBuyoutOpen(true)}
                  >
                    Take the whole room
                  </Button>
                </div>
              )}

              {/* 3 — move somewhere that is filling up */}
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
                      {cost.ready ? ' Sharing brings your share down.' : ''}
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

              <Button size='sm' variant='ghost' onClick={() => setDismissed(true)}>
                <Check className='mr-2 h-4 w-4' />
                Leave things as they are
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {buyoutQuote?.eligible && (
        <RoomBuyoutDialog
          open={buyoutOpen}
          onOpenChange={setBuyoutOpen}
          quote={buyoutQuote}
          roomNumber={roomNumber}
          confirming={requestBuyout.isPending}
          onConfirm={() =>
            requestBuyout.mutate(roomId!, { onSuccess: () => setBuyoutOpen(false) })
          }
        />
      )}
    </>
  );
}
