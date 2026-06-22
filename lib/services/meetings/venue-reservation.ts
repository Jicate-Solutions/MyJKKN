// lib/services/meetings/venue-reservation.ts
//
// Server-side venue reservation for the public booking path (venue-from-resource
// PR2). When an in-person meeting type links a registry room (PR1's
// meeting_types.location_resource_id), booking the meeting also HOLDS the room.
//
// This is the SERVICE-ROLE counterpart to ReservationService.createReservation:
// the public booking flow has no signed-in user (anon booker), so we cannot use
// ReservationService (browser client + logActivityForCurrentUser). We mirror its
// two decisions here against the service-role client:
//   * availability — a direct overlap query (NOT the check_resource_availability
//     RPC, which is broken on prod: it calls a missing uuid_nil()). This matches
//     ReservationService.checkAvailability exactly: any pending/approved/completed
//     reservation overlapping [start,end) means the room is taken.
//   * approval — resource.approval_config.enabled decides pending vs approved,
//     and the approver chain is seeded into resource_approvals (mirrors
//     ReservationService.createApprovalRecords) so caretakers see it in the
//     Resource Management approvals UI.
//
// booking_type gates whether a reservation is made at all: walk_in rooms are
// shown but never reserved (spec decision #11); reservation/both are held.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[venue-reservation]';

interface Approver {
  user_id?: string;
  level?: number;
}

export type VenuePlan =
  | { kind: 'none' } // walk-in, room unreadable, or no reservation needed
  | { kind: 'taken' } // room is busy at this slot
  | { kind: 'reserve'; requiresApproval: boolean; approvers: Approver[] };

/**
 * Decide what to do about a meeting type's linked room for a given slot.
 * Fails OPEN ({ kind: 'none' }) on any lookup error — a room hiccup must never
 * block a meeting booking; it just means the room isn't held this time.
 */
export async function resolveVenuePlan(
  supabase: SupabaseClient,
  locationResourceId: string,
  startIso: string,
  endIso: string,
): Promise<VenuePlan> {
  const { data: room, error } = await supabase
    .from('resources')
    .select('booking_type, approval_config')
    .eq('id', locationResourceId)
    .maybeSingle();
  if (error || !room) {
    console.error(`${LOG_PREFIX} room load failed:`, error?.message);
    return { kind: 'none' };
  }

  // Walk-in rooms: shown to the booker, never reserved (spec decision #11).
  if ((room as { booking_type?: string }).booking_type === 'walk_in') {
    return { kind: 'none' };
  }

  // Availability = no pending/approved/completed reservation overlaps [start,end).
  const { data: conflicts, error: cErr } = await supabase
    .from('resource_reservations')
    .select('id')
    .eq('resource_id', locationResourceId)
    .in('status', ['pending', 'approved', 'completed'])
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1);
  if (cErr) {
    console.error(`${LOG_PREFIX} availability check failed:`, cErr.message);
    return { kind: 'none' }; // fail open — book the meeting, skip the hold
  }
  if (conflicts && conflicts.length > 0) return { kind: 'taken' };

  const approvalConfig = ((room as { approval_config?: unknown }).approval_config ?? {}) as {
    enabled?: boolean;
    approvers?: Approver[];
  };
  const requiresApproval = approvalConfig.enabled === true;
  return {
    kind: 'reserve',
    requiresApproval,
    approvers: requiresApproval ? approvalConfig.approvers ?? [] : [],
  };
}

/**
 * Create the resource_reservations row that holds the room for a booking, plus
 * its approval chain when approval is required. Returns the reservation id, or
 * null on failure (best-effort — a reservation hiccup never undoes a committed
 * booking, the same discipline the calendar/email side-effects follow).
 */
export async function createVenueReservation(
  supabase: SupabaseClient,
  args: {
    resourceId: string;
    hostId: string;
    purpose: string;
    startIso: string;
    endIso: string;
    requiresApproval: boolean;
    approvers: Approver[];
  },
): Promise<string | null> {
  const status = args.requiresApproval ? 'pending' : 'approved';
  const { data, error } = await (supabase as any)
    .from('resource_reservations')
    .insert({
      resource_id: args.resourceId,
      user_id: args.hostId,
      purpose: args.purpose,
      start_time: args.startIso,
      end_time: args.endIso,
      quantity: 1,
      status,
      approved_at: args.requiresApproval ? null : new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error(`${LOG_PREFIX} reservation insert failed:`, error?.message);
    return null;
  }
  const reservationId = (data as { id: string }).id;

  // Seed the approval chain (mirrors ReservationService.createApprovalRecords)
  // so caretakers see the request in the reservations-approvals UI.
  if (args.requiresApproval && args.approvers.length) {
    const records = args.approvers
      .filter((a) => a.user_id)
      .map((a) => ({
        reservation_id: reservationId,
        approver_user_id: a.user_id,
        approval_level: a.level ?? 1,
        status: 'pending',
      }));
    if (records.length) {
      const { error: aErr } = await (supabase as any)
        .from('resource_approvals')
        .insert(records);
      if (aErr) console.error(`${LOG_PREFIX} approval seed failed:`, aErr.message);
    }
  }

  return reservationId;
}
