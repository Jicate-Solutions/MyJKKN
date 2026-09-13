// lib/services/events/core/general-event-service.ts
// Lifecycle for GENERAL events — the wizard-created `events` rows that have no
// dedicated console (lectures, cultural programmes, convocations, …).
// Created: 2026-07-29.
//
// Why this exists: EventBaseService.updateEvent is a raw passthrough with no
// transition validation, so until now a general event's status could only be
// changed by a caller that carried its own rules — and no such caller existed,
// leaving every wizard-created event stuck in `draft` forever.
//
// Deliberately a separate class rather than a method on EventBaseService: the
// base is the generic CRUD that marathon/tournament extend, and a general-event
// lifecycle rule does not belong to every event type.

import { EventBaseService } from './event-base-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { GENERAL_EVENT_STATUS_TRANSITIONS } from '@/types/events';
import type { Event, EventCancellation, EventStatus } from '@/types/events';

/**
 * The two PostgREST calls this service makes against `event_cancellations`.
 *
 * WHY A HAND-WRITTEN TYPE. That table is not in the generated `Database` type —
 * the migration that creates it is a FILE, not an applied schema — so
 * `.from('event_cancellations')` resolves through the client's generics to an
 * error shape, and the chain after it collapses into TS2589 ("type
 * instantiation is excessively deep") plus a TS2769 on the next call. Fixing
 * only the innermost one just unmasks the next; the chain has to be stepped out
 * of, not patched.
 *
 * Deliberately NOT `any`, and deliberately only these two shapes: a typo in a
 * column name or a missing `onConflict` is still a type error here, which is the
 * whole value `any` would have thrown away. When the migration is applied and
 * the Database type is regenerated, delete this and let the generics do it.
 */
type EventCancellationsTable = {
  upsert: (
    values: { event_id: string; reason: string | null },
    options?: { onConflict?: string }
  ) => Promise<{ error: { message?: string } | null }>;
  select: (columns: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      maybeSingle: () => Promise<{
        data: EventCancellation | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export class GeneralEventService {
  /** Browser client, session-scoped — every read and write below runs under RLS. */
  private static supabase = createClientSupabaseClient();

  /** `public.event_cancellations`, typed by hand — see EventCancellationsTable. */
  private static cancellations(): EventCancellationsTable {
    return (
      this.supabase as unknown as { from: (table: string) => EventCancellationsTable }
    ).from('event_cancellations');
  }

  /**
   * Move a general event between Draft and Active.
   *
   * Validated against GENERAL_EVENT_STATUS_TRANSITIONS — NOT the shared
   * EVENT_STATUS_TRANSITIONS, whose `draft` entry is ['planning','cancelled']
   * and would reject a one-click draft -> live outright. Mirrors
   * TournamentEventService.updateStatus, which learned this the hard way.
   *
   * The DB is not the gate here: `events_auth_update` already permits
   * super admins, admin/administrator/event_coordinator roles, and any user in
   * the owning institution. A denial still surfaces as a thrown Supabase error
   * from updateEvent rather than a silent no-op.
   */
  static async updateStatus(id: string, newStatus: EventStatus): Promise<Event> {
    try {
      // Cancelling carries a reason this signature has nowhere to put. The
      // database does NOT refuse a reasonless cancel — `events` is shared with
      // marathons and tournaments, whose own flows cancel without one — so this
      // guard is the requirement, not a duplicate of a server-side one. Refusing
      // here names the right door.
      if (newStatus === 'cancelled') {
        throw new Error('Cancelling an event needs a reason — use GeneralEventService.cancel().');
      }

      const event = await this.assertTransition(id, newStatus);

      const updated = await EventBaseService.updateEvent(id, { status: newStatus });
      logger.info('events/general', 'Status updated', {
        eventId: id,
        from: event.status,
        to: newStatus,
      });

      return updated;
    } catch (error) {
      logger.error('events/general', 'Failed to update general event status', {
        id,
        newStatus,
        error,
      });
      throw error;
    }
  }

  /**
   * Call an event off, with the reason the organiser gives.
   *
   * A SEPARATE method from updateStatus, not an optional argument on it: every
   * other transition here is a reasonless flip between Draft and Active, and a
   * `reason?` parameter that is mandatory for exactly one value is the shape
   * that gets called without it. The transition itself is still validated
   * against the same GENERAL_EVENT_STATUS_TRANSITIONS map, so `cancelled` is
   * reachable only from `live` — a draft was never announced, so there is
   * nobody to tell.
   *
   * WHAT THIS DOES NOT DO. It does not touch events_registrations: a cancelled
   * event keeps its registrant list, because the list is who has to be told.
   * Registration stops because the public page and /api/events/[eventId]/
   * public-register both already refuse a `cancelled` event — the same guard
   * that closes a registration window, not a second mechanism.
   *
   * ⚠️ WHAT IT SETS OFF, WHICH IS NOT NOTHING. The database trigger
   * tr_event_cancelled_cascade_release (migration 20260417000004, live since
   * April) fires AFTER this write and RELEASES the event's bookings: every
   * resource_reservations row linked to the event or its sessions goes to
   * 'cancelled', and every invited/accepted event_human_roles assignment goes to
   * 'cancelled' too. Releasing a reservation in turn restores stock and promotes
   * whoever is next on that resource's waitlist — so the room can be taken by
   * someone else within the same transaction. NONE of it is undone by moving the
   * event back to 'live'. The cancel dialog says all of this before the
   * organiser commits; do not remove that copy.
   *
   * The requirement that a reason be given lives HERE and in the dialog, not in
   * the database: see the note in migration 20261204113700.
   *
   * ⚠️ THE REASON IS NOT A COLUMN ON `events`, AND THE ORDER OF THE TWO WRITES
   * BELOW IS LOAD-BEARING. It is a row in `public.event_cancellations`, because
   * `events` is anon-readable and the reason survives a reinstatement — a column
   * there would publish the organiser's verbatim text to the public anon key the
   * moment a cancelled event went live again (Director's ruling, 13 Sep).
   *
   * Two writes cannot be one statement from a browser, so they are ordered so
   * that the only possible half-failure is the SAFE one:
   *
   *   1. record the cancellation  — if this fails, nothing has happened at all
   *      and the event is still live, which is the honest outcome.
   *   2. flip the status          — if THIS fails, a cancellation row exists for
   *      an event that is still live. Nothing reads it (every reader gates on
   *      `status === 'cancelled'`), and the next attempt overwrites it.
   *
   * The reverse order is what must never be written: it would leave an event
   * cancelled — bookings already released by the cascade — with no record of
   * why, which is the one state this feature exists to prevent.
   *
   * `cancelled_at` and `cancelled_by` are NOT sent from here. They are stamped
   * by trg_event_cancellation_stamp from auth.uid(), so the row records who
   * actually cancelled it rather than whoever the browser said.
   *
   * Permission is the EDIT permission, unchanged: the UI gates on canEditEvent()
   * and the database on events_auth_update / events_incharge_update. No cancel-
   * specific guard exists, on purpose — a parallel rule is a rule that drifts.
   */
  static async cancel(id: string, reason: string): Promise<Event> {
    const trimmedReason = reason.trim();

    try {
      if (!trimmedReason) {
        // Not "the people registered will be shown it": since the Director's
        // ruling of 13 Sep the public page prints a standard line and never
        // this text. The reason is kept for the event team — say so, because
        // an organiser writing to the public writes a different sentence from
        // one writing to their colleagues.
        throw new Error(
          'Give a reason for cancelling — it is kept on the event page, where colleagues at your institution who can open this event will read it. The public page shows a standard notice instead.'
        );
      }

      const event = await this.assertTransition(id, 'cancelled');

      // 1. The record first. See the ordering note above.
      const { error: cancellationError } = await this.cancellations().upsert(
        { event_id: id, reason: trimmedReason },
        { onConflict: 'event_id' }
      );

      if (cancellationError) {
        // Nothing has happened yet: the event is still live and its bookings are
        // still held. Surfacing this instead of pressing on is the point.
        logger.error('events/general', 'Failed to record the cancellation reason', {
          id,
          error: cancellationError,
        });
        throw new Error(
          'Could not record why this event is being cancelled, so nothing was changed. The event is still active — try again.'
        );
      }

      // 2. Then the status, which is what fires the release cascade.
      const updated = await EventBaseService.updateEvent(id, { status: 'cancelled' });
      logger.info('events/general', 'Event cancelled', {
        eventId: id,
        from: event.status,
      });

      return updated;
    } catch (error) {
      logger.error('events/general', 'Failed to cancel general event', { id, error });
      throw error;
    }
  }

  /**
   * Why this event was called off — or null when nothing was recorded.
   *
   * A SECOND query rather than an embed on the event, deliberately. Embedding it
   * would put `event_cancellations` into the select of every screen that loads
   * an event, including ones rendered for people who cannot read it, and a
   * PostgREST embed of a table the caller cannot see returns null in a shape
   * indistinguishable from "no cancellation" — a silent wrong answer. One
   * explicit call, made only when the console needs it, fails loudly instead.
   *
   * `maybeSingle()` because most events have no row here, and that is not an
   * error. A genuine failure (RLS denial, network) still throws.
   */
  static async getCancellation(eventId: string): Promise<EventCancellation | null> {
    try {
      const { data, error } = await this.cancellations()
        .select('event_id, reason, cancelled_at, cancelled_by, created_at, updated_at')
        .eq('event_id', eventId)
        .maybeSingle();

      if (error) {
        logger.error('events/general', 'Failed to read the cancellation record', { eventId, error });
        throw error;
      }

      return (data as EventCancellation | null) ?? null;
    } catch (error) {
      logger.error('events/general', 'Unexpected error in getCancellation', { eventId, error });
      throw error;
    }
  }

  /**
   * Load the event and check the move is one this lifecycle allows. Shared by
   * updateStatus and cancel so the two cannot disagree about the map.
   */
  private static async assertTransition(id: string, newStatus: EventStatus): Promise<Event> {
    const event = await EventBaseService.getEvent(id);
    if (!event) {
      throw new Error(`Event not found: ${id}`);
    }

    const allowedTransitions = GENERAL_EVENT_STATUS_TRANSITIONS[event.status] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${event.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
      );
    }

    return event;
  }
}
