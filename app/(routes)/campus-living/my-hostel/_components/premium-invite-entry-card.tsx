// ============================================================================
// PREMIUM INVITE ENTRY — makes "invite a roommate" findable
// ============================================================================
// Created: 2026-08-09
//
// The invite flow has worked since 2026-05-19 and has never been used once —
// zero invites sent, while 81 learners live in premium rooms. It was only
// reachable by finishing the pick-room flow or by typing the URL. Nobody with
// an existing premium room ever saw it.
//
// This is a one-line entry card, placed where a premium resident actually
// looks: her My Hostel home and the premium area. It states the reason to use
// it — every person who joins lowers what everyone pays — and shows how many
// beds in her room are still empty when that is known.
//
// Self-gating: renders nothing unless she holds a premium allocation, so a
// Classic resident is never sent to a page that would refuse her.
// ============================================================================

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyRoommates, useMyRoomDetails } from '@/hooks/campus-living/use-my-hostel';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { Users, ChevronRight, BedDouble } from 'lucide-react';

export function PremiumInviteEntryCard() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  // Same key the page/tabs use — React Query dedupes, no extra request.
  const { data: allocations } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', profileId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(profileId, true),
    enabled: !!profileId,
  });

  const allocation = (allocations ?? [])[0] as
    | { room_id?: string | null; tier_id?: string | null }
    | undefined;
  const roomId = allocation?.room_id ?? null;
  const isPremium = !!allocation?.tier_id;

  const { data: room } = useMyRoomDetails(isPremium ? roomId : null);
  const { data: roommates } = useMyRoommates(isPremium && !!roomId);

  if (!isPremium) return null;

  // capacity − (me + everyone else in the room). Hidden when unknown.
  const emptyBeds =
    room?.capacity && roommates
      ? Math.max(0, room.capacity - 1 - roommates.length)
      : null;

  return (
    <Link href='/campus-living/my-hostel/premium/invite-roommate' className='block'>
      <Card className='transition-colors hover:bg-muted/50'>
        <CardContent className='flex items-center gap-3 p-4'>
          <Users className='h-5 w-5 shrink-0 text-primary' />
          <div className='min-w-0 flex-1'>
            <p className='font-medium'>Invite a roommate</p>
            <p className='text-sm text-muted-foreground'>
              Each person who joins your room lowers what everyone pays.
            </p>
          </div>
          {emptyBeds !== null && emptyBeds > 0 && (
            <Badge variant='outline' className='shrink-0 gap-1'>
              <BedDouble className='h-3 w-3' />
              {emptyBeds} {emptyBeds === 1 ? 'bed' : 'beds'} empty
            </Badge>
          )}
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </CardContent>
      </Card>
    </Link>
  );
}
