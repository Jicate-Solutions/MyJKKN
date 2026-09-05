// ============================================================================
// SOLE-OCCUPANCY NOTICE — shown at the moment of choosing a room
// ============================================================================
// Created: 2026-08-09
//
// A learner can pick a room built for 3, 4 or 6 people and end up its only
// occupant. The room's cost is split between the people living in it, so being
// alone in a 4-bed room means paying for four beds. Six learners are in exactly
// that position today and none of them was told before they confirmed.
//
// This panel appears BEFORE the reserve button can be used whenever the chosen
// room has more than one bed and nobody is in it yet. It states the bed count,
// the amount owed alone, the amount owed if the room fills, offers the
// invite-a-roommate page so she can bring people in first, and requires an
// explicit tick.
//
// Amounts come from POST /api/campus-living/fee-quote. Nothing here does maths.
// If the quote cannot be produced (no current hostel year, no fee row for the
// category, request failed) the panel still renders — bed count, warning and
// tick — just without numbers it cannot stand behind.
// ============================================================================

'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  useSoleOccupancyCost,
  formatInr,
} from '@/hooks/campus-living/use-sole-occupancy-cost';
import { TriangleAlert, Users, Loader2 } from 'lucide-react';

interface SoleOccupancyNoticeProps {
  roomId: string;
  roomNumber: string;
  roomCategoryId: string | null;
  capacity: number;
  /** People already living in the room. The notice only applies when this is 0. */
  currentOccupancy: number;
  messCategoryId?: string | null;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

export function SoleOccupancyNotice({
  roomId,
  roomNumber,
  roomCategoryId,
  capacity,
  currentOccupancy,
  messCategoryId,
  acknowledged,
  onAcknowledgedChange,
}: SoleOccupancyNoticeProps) {
  const cost = useSoleOccupancyCost({
    roomId,
    roomCategoryId,
    capacity,
    messCategoryId,
  });

  // Only a multi-bed room with nobody in it can leave her alone.
  if (capacity <= 1 || currentOccupancy > 0) return null;

  // The quote is the only thing allowed to claim she will pay more. Until it
  // resolves — and permanently when it cannot (no fee row for the category
  // yet, request failed, or a band that prices flat per bed) — the warning
  // states the plain fact, that she'd be alone in a room built for several,
  // rather than asserting a cost nobody has confirmed.

  return (
    <Card className='border-amber-400 bg-amber-50 dark:bg-amber-950/30'>
      <CardContent className='space-y-4 p-4'>
        <div className='flex items-start gap-3'>
          <TriangleAlert className='mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400' />
          <div className='space-y-1'>
            <p className='font-semibold text-amber-900 dark:text-amber-200'>
              Room {roomNumber} has {capacity} beds and nobody in it yet
            </p>
            <p className='text-sm text-amber-800 dark:text-amber-300'>
              The cost of a room is shared by the people living in it.{' '}
              {cost.ready
                ? `If you move in on your own, you pay for all ${capacity} beds until someone else joins you.`
                : `If you move in on your own, you will be the only person in a room built for ${capacity}, and what you pay may be higher until someone joins you.`}
            </p>
          </div>
        </div>

        {cost.loading ? (
          <p className='flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Working out what this room would cost you…
          </p>
        ) : cost.ready ? (
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='rounded-md border border-amber-300 bg-white/70 p-3 dark:border-amber-800 dark:bg-black/20'>
              <p className='text-xs text-amber-800 dark:text-amber-300'>
                The room costs, if you live here alone
              </p>
              <p className='text-xl font-bold text-amber-900 dark:text-amber-200'>
                {formatInr(cost.aloneTotal!)}
              </p>
              <p className='text-xs text-amber-800 dark:text-amber-300'>
                for the year
              </p>
            </div>
            <div className='rounded-md border border-emerald-300 bg-white/70 p-3 dark:border-emerald-800 dark:bg-black/20'>
              <p className='text-xs text-emerald-800 dark:text-emerald-300'>
                Your share if all {capacity} beds fill up
              </p>
              <p className='text-xl font-bold text-emerald-900 dark:text-emerald-200'>
                {formatInr(cost.fullTotal!)}
              </p>
              <p className='text-xs text-emerald-800 dark:text-emerald-300'>
                for the year — {formatInr(cost.extraCost!)} less
              </p>
            </div>
          </div>
        ) : (
          <p className='text-sm text-amber-800 dark:text-amber-300'>
            We could not show the exact amount for this room here. Your hostel
            office can tell you what living alone in a {capacity}-bed room costs
            before you decide.
          </p>
        )}

        <div className='rounded-md border border-amber-300 bg-white/70 p-3 dark:border-amber-800 dark:bg-black/20'>
          <p className='text-sm font-medium text-amber-900 dark:text-amber-200'>
            You can bring people in first
          </p>
          <p className='mt-0.5 text-sm text-amber-800 dark:text-amber-300'>
            Invite friends to share this room
            {cost.ready ? ' — every person who joins lowers what each of you pays' : ''}.
          </p>
          <Button asChild size='sm' variant='outline' className='mt-2'>
            <Link href='/campus-living/my-hostel/premium/invite-roommate'>
              <Users className='mr-2 h-4 w-4' />
              Invite a roommate
            </Link>
          </Button>
        </div>

        <div className='flex items-start gap-2'>
          <Checkbox
            id='soleOccupancyAck'
            checked={acknowledged}
            onCheckedChange={(v) => onAcknowledgedChange(v === true)}
            className='mt-0.5 border-amber-600'
          />
          <Label
            htmlFor='soleOccupancyAck'
            className='text-sm font-normal leading-snug text-amber-900 dark:text-amber-200'
          >
            {cost.ready
              ? `I understand the room will cost me ${formatInr(cost.aloneTotal!)} for the year while I am the only one in this ${capacity}-bed room, and that my mess fee is charged separately on top.`
              : `I understand I am taking a room built for ${capacity} people on my own, and that what I pay may be higher until someone joins me.`}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
