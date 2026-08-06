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
// GRAIN: ONE RESERVATION PER DAY, not one block per event (2026-08-05).
// The room used to be held for a single [start_date, end_date] block. Organizers
// legitimately enter multi-day spans there (a programme that runs 10–22 Aug), and
// fn_resource_slot_conflicts is a plain overlap test — so a 12-day block collided
// with EVERY unrelated booking inside it. Every one of the ~83 rows in
// resource_reservations is a single working-day slot (≤8h): that is the grain the
// whole Resource Management module books at. An event that runs across days now
// holds the SAME hours on each of those days, which is both what actually happens
// in the room and what makes the conflict test meaningful.
//
// The hold is ALL-OR-NOTHING. A partly-held multi-day event (days 1-2 reserved,
// day 3 taken) is worse than no hold: it looks reserved on the calendar and
// strands two rooms. If any day fails, the days already taken are released.

import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

interface RoomRow {
  name: string | null;
  institution_id: string | null;
  booking_type: string | null;
  is_reservable: boolean | null;
  caretaker_user_id: string | null;
  caretaker_user_ids: string[] | null;
}

/** One day's occupancy window — the grain the room is actually held at. */
export interface EventVenueSlot {
  startIso: string;
  endIso: string;
}

/** A day of the event on which the room is already spoken for. */
export interface EventVenueClash {
  slot: EventVenueSlot;
  holderName: string | null;
  holderDesignation: string | null;
  holderStart: string;
  holderEnd: string;
}

/**
 * Upper bound on how many days one event may hold a room for. A slipped digit in
 * the end date ("2027" for "2026") would otherwise fan out into hundreds of
 * reservations. Callers should reject a longer range rather than silently book
 * the first 60 days — buildDaySlots caps, the caller explains.
 */
export const MAX_EVENT_DAYS = 60;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Expand a date range + a daily start/end time into one slot per day.
 *
 * `firstDay`/`lastDay` are 'yyyy-MM-dd' (an <input type="date"> value) and
 * `startTime`/`endTime` are 'HH:mm' (an <input type="time"> value). They are
 * combined as LOCAL wall time — `new Date('2026-08-20T09:00')` is 09:00 where the
 * organizer is sitting — and converted to UTC by toISOString for storage. Handing
 * Postgres the naive string instead would shift every hold by the timezone offset
 * (a 5:30h drift in this deployment).
 *
 * Day stepping is done on local date parts, never by adding 24h to a timestamp.
 */
export function buildDaySlots(
  firstDay: string,
  lastDay: string,
  startTime: string,
  endTime: string,
): EventVenueSlot[] {
  if (!firstDay || !startTime || !endTime) return [];

  const [fy, fm, fd] = firstDay.split('-').map(Number);
  const [ly, lm, ld] = (lastDay || firstDay).split('-').map(Number);
  if (!fy || !fm || !fd || !ly || !lm || !ld) return [];

  const cursor = new Date(fy, fm - 1, fd);
  const last = new Date(ly, lm - 1, ld);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];

  const slots: EventVenueSlot[] = [];
  while (cursor <= last && slots.length < MAX_EVENT_DAYS) {
    const day = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    const start = new Date(`${day}T${startTime}`);
    const end = new Date(`${day}T${endTime}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      slots.push({ startIso: start.toISOString(), endIso: end.toISOString() });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

/** Whole days from `firstDay` to `lastDay` inclusive — used to reject over-long ranges. */
export function countDays(firstDay: string, lastDay: string): number {
  if (!firstDay) return 0;
  const [fy, fm, fd] = firstDay.split('-').map(Number);
  const [ly, lm, ld] = (lastDay || firstDay).split('-').map(Number);
  if (!fy || !ly) return 0;
  const a = new Date(fy, fm - 1, fd);
  const b = new Date(ly, lm - 1, ld);
  if (b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export interface HoldEventVenueArgs {
  resourceId: string;
  eventId: string;
  eventInstitutionId: string | null;
  userId: string;
  purpose: string;
  /** One window per day of the event (see buildDaySlots). Held all-or-nothing. */
  slots: EventVenueSlot[];
}

/**
 * Deliberately ONE flat shape, not a `{held:true} | {held:false}` union.
 * `tsconfig.json` has `strictNullChecks: false` for the Next.js 16 migration,
 * and with it off TypeScript will not narrow a union by a boolean-literal
 * discriminant — `if (hold.held) … else …` leaves `hold` as the full union, so
 * reading `.reason` in the else branch is TS2339. Callers check `held` and read
 * the field they need; every failure path sets `reason`.
 */
export interface HoldEventVenueResult {
  held: boolean;
  /** Always set once the room row loads — the caller needs it to demote a failed
   *  hold to free text (events_venue_at_least_one_check forbids clearing the room
   *  without leaving venue/venue_text behind). */
  roomName?: string;
  /** Set when held — one id per day. */
  reservationIds?: string[];
  requiresApproval?: boolean;
  crossCollege?: boolean;
  /** Set when NOT held. */
  reason?: 'not_reservable' | 'walk_in' | 'taken' | 'no_approver' | 'no_slots' | 'error';
  message?: string;
  /** Set when a multi-day hold failed part-way — the day that could not be held. */
  failedOnIso?: string;
}

/** Caretaker user-ids (single + array columns), de-duped, as approver records. */
function caretakerApprovers(room: RoomRow): { user_id: string; level?: number }[] {
  const ids = new Set<string>();
  if (room.caretaker_user_id) ids.add(room.caretaker_user_id);
  for (const id of room.caretaker_user_ids ?? []) if (id) ids.add(id);
  return [...ids].map((user_id) => ({ user_id, level: 1 }));
}

/**
 * Ask the spine, day by day, which days of the event the room is NOT free on.
 * An empty array means every day is clear. Use this BEFORE creating the event so
 * a clash blocks without leaving an orphan event row — and so the UI can name the
 * offending day and holder instead of a blanket "already booked".
 */
export async function findEventVenueClashes(
  resourceId: string,
  slots: EventVenueSlot[],
): Promise<EventVenueClash[]> {
  const results = await Promise.all(
    slots.map(async (slot): Promise<EventVenueClash | null> => {
      try {
        const a = await ReservationService.checkAvailability({
          resource_id: resourceId,
          start_time: slot.startIso,
          end_time: slot.endIso,
          quantity: 1,
        });
        if (a.is_available) return null;
        const first = a.conflicting_reservations?.[0];
        return {
          slot,
          holderName: first?.full_name ?? null,
          holderDesignation: first?.designation ?? null,
          holderStart: first?.start_time ?? slot.startIso,
          holderEnd: first?.end_time ?? slot.endIso,
        };
      } catch (e) {
        // Fail OPEN on a check error — don't block event creation on a hiccup;
        // the hold attempt (and its DB-side checks) is the backstop.
        logger.warn('events/venue', 'availability check failed', {
          resourceId,
          msg: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    }),
  );
  return results.filter(Boolean) as EventVenueClash[];
}

/** Best-effort release of holds already made when a later day fails. */
async function releaseHolds(ids: string[], userId: string): Promise<void> {
  for (const id of ids) {
    try {
      await ReservationService.cancelReservation(
        {
          reservation_id: id,
          user_id: userId,
          cancellation_reason:
            'Rolled back — another day of the same event could not be held.',
        },
        userId,
      );
    } catch (e) {
      logger.warn('events/venue', 'rollback cancel failed', {
        reservationId: id,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Hold the room for an event by delegating to the ONE booking spine — one
 * reservation per day of the event. Decides the approval policy (same-college
 * auto / cross-college ping owner) and links every reservation back to the event
 * (resource_reservations.event_id).
 */
export async function holdEventVenue(args: HoldEventVenueArgs): Promise<HoldEventVenueResult> {
  const supabase = createClientSupabaseClient();

  if (!args.slots.length) return { held: false, reason: 'no_slots' };

  const { data: room, error } = await supabase
    .from('resources')
    .select('name, institution_id, booking_type, is_reservable, caretaker_user_id, caretaker_user_ids')
    .eq('id', args.resourceId)
    .maybeSingle();

  if (error || !room) {
    logger.warn('events/venue', 'room load failed', { resourceId: args.resourceId, msg: error?.message });
    return { held: false, reason: 'error', message: 'Room not found' };
  }
  const r = room as RoomRow;
  const roomName = r.name ?? undefined;
  if (r.is_reservable === false) return { held: false, roomName, reason: 'not_reservable' };
  if (r.booking_type === 'walk_in') return { held: false, roomName, reason: 'walk_in' };

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
      roomName,
      reason: 'no_approver',
      message: 'This room belongs to another college but has no approver set to release it.',
    };
  }

  const total = args.slots.length;
  const reservationIds: string[] = [];

  for (let i = 0; i < total; i++) {
    const slot = args.slots[i];
    try {
      const reservation = await ReservationService.createReservation(
        {
          resource_id: args.resourceId,
          // Day-numbered so the room's caretaker can see which sitting is which
          // in Resource Management; single-day events keep the plain purpose.
          purpose: total > 1 ? `${args.purpose} — day ${i + 1} of ${total}` : args.purpose,
          start_time: slot.startIso,
          end_time: slot.endIso,
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
      reservationIds.push(reservation.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not hold the room';
      logger.warn('events/venue', 'holdEventVenue failed', {
        resourceId: args.resourceId,
        day: i + 1,
        of: total,
        msg,
      });
      // All-or-nothing: give back the days already taken before reporting failure.
      await releaseHolds(reservationIds, args.userId);
      // createReservation throws on availability — translate a clash to 'taken'
      // (race between the pre-check and the insert).
      const reason = /not available|already|held/i.test(msg) ? 'taken' : 'error';
      return { held: false, roomName, reason, message: msg, failedOnIso: slot.startIso };
    }
  }

  return {
    held: true,
    roomName,
    reservationIds,
    requiresApproval: !sameCollege,
    crossCollege: !sameCollege,
  };
}
