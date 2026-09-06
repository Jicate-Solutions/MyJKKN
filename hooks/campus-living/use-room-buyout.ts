'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RoomBuyoutService } from '@/lib/services/campus-living/room-buyout-service';

const buyoutKeys = {
  all: ['campus-living', 'room-buyout'] as const,
  quote: (roomId: string) => ['campus-living', 'room-buyout', 'quote', roomId] as const,
  live: (roomId: string) => ['campus-living', 'room-buyout', 'live', roomId] as const,
  settleWindow: ['campus-living', 'settle-window', 'mine'] as const,
};

/**
 * `enabled` matters here. These hooks feed the Room Sharing card on the default
 * Overview tab, which self-gates away for a resident of a full room — so
 * passing the room id unconditionally would fire an RPC for every hostelite on
 * a screen where nothing renders.
 */
export function useRoomBuyoutQuote(roomId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: buyoutKeys.quote(roomId ?? ''),
    queryFn: () => RoomBuyoutService.quote(roomId!),
    enabled: !!roomId && enabled,
    // The amount moves whenever someone joins or leaves the room, and the commit
    // path refuses a stale figure — so a cached quote that has gone out of date
    // turns into a confusing refusal rather than a wrong bill.
    staleTime: 60_000,
  });
}

/** The live request or hold on this room, with every roommate's answer. */
export function useRoomBuyout(roomId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: buyoutKeys.live(roomId ?? ''),
    queryFn: () => RoomBuyoutService.getLive(roomId!),
    enabled: !!roomId && enabled,
  });
}

/** The resident's own countdown. Null while no window is open on her room. */
export function useMySettleWindow(enabled = true) {
  return useQuery({
    queryKey: buyoutKeys.settleWindow,
    queryFn: () => RoomBuyoutService.mySettleWindow(),
    enabled,
  });
}

function invalidateRoom(qc: ReturnType<typeof useQueryClient>, roomId: string) {
  qc.invalidateQueries({ queryKey: buyoutKeys.quote(roomId) });
  qc.invalidateQueries({ queryKey: buyoutKeys.live(roomId) });
  qc.invalidateQueries({ queryKey: buyoutKeys.settleWindow });
  // Activation raises a bill and closes the settle window, so the money and
  // allocation views on My Hostel are both stale afterwards.
  qc.invalidateQueries({ queryKey: ['my-hostel'] });
  qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
}

/**
 * Ask to take the room.
 *
 * The RPC returns a status rather than throwing for the ordinary refusals —
 * the room filled, someone already asked — so those are surfaced as plain
 * sentences instead of error toasts. Only a genuine failure throws.
 */
export function useRequestRoomBuyout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => RoomBuyoutService.request(roomId),
    onSuccess: (res, roomId) => {
      invalidateRoom(qc, roomId);
      if (res.status === 'active') {
        toast.success('The room is yours — the empty beds are billed and nobody else will be placed in it.');
      } else if (res.status === 'pending_consent') {
        toast.success(
          `Asked your ${res.awaiting === 1 ? 'roommate' : `${res.awaiting} roommates`} to agree.`
        );
      } else if (res.status === 'refused') {
        toast.error(refusalSentence(res.reason));
      } else {
        toast.error(refusalSentence(res.reason ?? res.status));
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Could not request the room buyout'),
  });
}

/** Agree to, or refuse, a roommate's request. */
export function useRespondToRoomBuyout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      buyoutId,
      agree,
    }: {
      buyoutId: string;
      agree: boolean;
      /** Only used to invalidate the right room's caches. */
      roomId: string;
    }) => RoomBuyoutService.respond(buyoutId, agree),
    onSuccess: (res, vars) => {
      invalidateRoom(qc, vars.roomId);
      if (res.status === 'active') {
        toast.success('Everyone agreed — the room is held and the empty beds are billed.');
      } else if (res.status === 'declined') {
        toast.success('You declined. Nobody has been billed and the room stays open.');
      } else if (res.status === 'pending_consent') {
        toast.success(
          `Recorded. Waiting on ${res.awaiting} more ${res.awaiting === 1 ? 'roommate' : 'roommates'}.`
        );
      } else {
        toast.error(refusalSentence(res.reason ?? res.status));
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not record your answer'),
  });
}

/** Staff only — give the beds back. */
export function useReleaseRoomBuyout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      buyoutId,
      reason,
    }: {
      buyoutId: string;
      reason?: string;
      roomId: string;
    }) => RoomBuyoutService.release(buyoutId, reason),
    onSuccess: (_res, vars) => {
      invalidateRoom(qc, vars.roomId);
      toast.success('Released — the beds are available again. The bill is unchanged.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not release the room'),
  });
}

/** Server reasons are snake_case tokens; learners read sentences. */
function refusalSentence(reason: string | undefined): string {
  switch (reason) {
    case 'mechanism_disabled':
      return 'Taking a whole room is not available yet.';
    case 'category_not_in_scope':
      return 'Rooms in your category cannot be taken this way. Ask the hostel office.';
    case 'room_full':
      return 'Every bed is taken, so there is nothing to pay for.';
    case 'buyout_already_live':
      return 'Someone in your room has already asked to take it.';
    case 'occupancy_changed':
      return 'Someone joined or left while you were deciding, so the amount changed. Please ask again.';
    case 'room_filled':
      return 'The room filled up while you were deciding — you have nothing to pay.';
    case 'roommate_declined':
      return 'A roommate declined, so nobody has been billed.';
    case 'no_active_fee_row':
    case 'room_has_no_category':
    case 'no_hostel_year':
      return 'Your room is not priced yet. The hostel office can help.';
    case 'no_occupants':
      return 'You are not recorded as living in this room.';
    default:
      return 'That could not be done right now. Please try again or ask the hostel office.';
  }
}
