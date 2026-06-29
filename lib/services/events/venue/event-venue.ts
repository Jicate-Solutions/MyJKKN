// lib/services/events/venue/event-venue.ts
//
// Events venue POLICY layer (booking-spine room core, 2026-06-28).
//
// This file contains NO booking logic. The one booking spine is
// ReservationService (lib/services/reservation/reservation-service.ts): it owns
// availability (quantity-aware), the resource_reservations write, and the
// approval chain. This layer only decides the events-specific APPROVAL POLICY and
// then calls the spine:
//   • same college  (event.institution_id == resource.institution_id)
//        → approvalMode 'auto'    (event approval is enough; no caretaker step)
//   • another college
//        → approvalMode 'require' (ping the room's caretaker(s) to approve)
//
// "Is it free?" is asked via the same spine (checkAvailability) so a clash is a
// hard stop BEFORE an event row is created — see the create flow.

import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

interface RoomRow {
  institution_id: string | null;
  booking_type: string | null;
  is_reservable: boolean | null;
  caretaker_user_id: string | null;
  caretaker_user_ids: string[] | null;
}

export interface HoldEventVenueArgs {
  resourceId: string;
  eventId: string;
  eventInstitutionId: string | null;
  userId: string;
  purpose: string;
  /** ISO timestamps — the event's window (events.start_date / end_date). */
  startIso: string;
  endIso: string;
}

export type HoldEventVenueResult =
  | { held: true; reservationId: string; requiresApproval: boolean; crossCollege: boolean }
  | {
      held: false;
      reason: 'not_reservable' | 'walk_in' | 'taken' | 'no_approver' | 'error';
      message?: string;
    };

/** Caretaker user-ids (single + array columns), de-duped, as approver records. */
function caretakerApprovers(room: RoomRow): { user_id: string; level?: number }[] {
  const ids = new Set<string>();
  if (room.caretaker_user_id) ids.add(room.caretaker_user_id);
  for (const id of room.caretaker_user_ids ?? []) if (id) ids.add(id);
  return [...ids].map((user_id) => ({ user_id, level: 1 }));
}

/**
 * Ask the spine whether the room is free for [startIso, endIso). Use this BEFORE
 * creating the event so a clash blocks without leaving an orphan event row.
 */
export async function isEventVenueFree(
  resourceId: string,
  startIso: string,
  endIso: string,
): Promise<{ free: boolean; message?: string }> {
  try {
    const a = await ReservationService.checkAvailability({
      resource_id: resourceId,
      start_time: startIso,
      end_time: endIso,
      quantity: 1,
    });
    return { free: a.is_available, message: a.message };
  } catch (e) {
    // Fail OPEN on a check error — don't block event creation on a hiccup; the
    // hold attempt (and its DB-side checks) is the backstop.
    logger.warn('events/venue', 'availability check failed', {
      resourceId,
      msg: e instanceof Error ? e.message : String(e),
    });
    return { free: true };
  }
}

/**
 * Hold the room for an event by delegating to the ONE booking spine. Decides the
 * approval policy (same-college auto / cross-college ping owner) and links the
 * reservation back to the event (resource_reservations.event_id).
 */
export async function holdEventVenue(args: HoldEventVenueArgs): Promise<HoldEventVenueResult> {
  const supabase = createClientSupabaseClient();

  const { data: room, error } = await supabase
    .from('resources')
    .select('institution_id, booking_type, is_reservable, caretaker_user_id, caretaker_user_ids')
    .eq('id', args.resourceId)
    .maybeSingle();

  if (error || !room) {
    logger.warn('events/venue', 'room load failed', { resourceId: args.resourceId, msg: error?.message });
    return { held: false, reason: 'error', message: 'Room not found' };
  }
  const r = room as RoomRow;
  if (r.is_reservable === false) return { held: false, reason: 'not_reservable' };
  if (r.booking_type === 'walk_in') return { held: false, reason: 'walk_in' };

  const sameCollege =
    !!r.institution_id && !!args.eventInstitutionId && r.institution_id === args.eventInstitutionId;
  const approvalMode: 'auto' | 'require' = sameCollege ? 'auto' : 'require';
  const approvers = sameCollege ? [] : caretakerApprovers(r);

  // Cross-college rooms need the owning college's caretaker to approve. If the
  // room has NO resolvable approver, don't create a 'pending' reservation that
  // no one can ever approve (a stuck hold + a false "they'll approve it" promise).
  // Refuse honestly instead. (Caretaker ids are profiles.id == auth.uid(), which
  // is exactly what the approval RPC checks — verified live, all 55 rooms.)
  if (!sameCollege && approvers.length === 0) {
    return {
      held: false,
      reason: 'no_approver',
      message: 'This room belongs to another college but has no approver set to release it.',
    };
  }

  try {
    const reservation = await ReservationService.createReservation(
      {
        resource_id: args.resourceId,
        purpose: args.purpose,
        start_time: args.startIso,
        end_time: args.endIso,
        quantity: 1,
        // Limb 1 links the event only. (A reservation cannot carry BOTH event_id
        // and session_id — `resource_reservations` has a CHECK forbidding it; event
        // sessions are a later limb.)
        event_id: args.eventId,
        approvalMode,
        approvers,
      },
      args.userId,
    );
    return {
      held: true,
      reservationId: reservation.id,
      requiresApproval: !sameCollege,
      crossCollege: !sameCollege,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not hold the room';
    logger.warn('events/venue', 'holdEventVenue failed', { resourceId: args.resourceId, msg });
    // createReservation throws on availability — translate a clash to 'taken'
    // (race between the pre-check and the insert).
    if (/not available|already|held/i.test(msg)) return { held: false, reason: 'taken', message: msg };
    return { held: false, reason: 'error', message: msg };
  }
}
