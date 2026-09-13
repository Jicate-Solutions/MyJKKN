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
import { logger } from '@/lib/utils/enhanced-logger';
import { GENERAL_EVENT_STATUS_TRANSITIONS } from '@/types/events';
import type { Event, EventStatus } from '@/types/events';

export class GeneralEventService {
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
      // Cancelling carries a reason this signature has nowhere to put, and the
      // database refuses a reasonless cancel outright (trg_events_stamp_
      // cancellation). Refusing here names the right door instead of letting the
      // call travel to the server to fail there.
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
   * `cancelled_at` and `cancelled_by` are NOT sent from here. They are stamped
   * by the BEFORE UPDATE trigger from auth.uid(), so the row records who
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
        throw new Error('Give a reason for cancelling — the people registered will be shown it.');
      }

      const event = await this.assertTransition(id, 'cancelled');

      const updated = await EventBaseService.updateEvent(id, {
        status: 'cancelled',
        cancellation_reason: trimmedReason,
      });
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
