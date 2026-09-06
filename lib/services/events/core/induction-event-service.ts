// lib/services/events/core/induction-event-service.ts
// Lifecycle for INDUCTION events. Created: 2026-08-18.
//
// Why this exists: the induction module shipped without a status writer of any
// kind. fn_induction_create_program hardcodes `status = 'draft'`; no service, no
// RPC and no screen ever wrote another value, so every induction created through
// the module stayed in Draft forever and the detail console could only render
// the badge. This is the same gap GeneralEventService closed for wizard events,
// and it sits beside that file deliberately — three event types with a lifecycle
// (general, tournament, induction), three services, one shape.
//
// EventBaseService.updateEvent is a raw passthrough with no transition
// validation, so a caller has to carry the rules. Writing status straight from
// a dropdown instead is the recurring bug class this repo keeps hitting.

import { EventBaseService } from './event-base-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { INDUCTION_STATUS_TRANSITIONS } from '@/types/events';
import type { Event, EventStatus } from '@/types/events';

export class InductionEventService {
  /**
   * Move an induction between Draft and Live.
   *
   * Validated against INDUCTION_STATUS_TRANSITIONS — NOT the shared
   * EVENT_STATUS_TRANSITIONS, whose `draft` entry is ['planning','cancelled']
   * and would reject a one-click activation outright. TournamentEventService and
   * GeneralEventService each learned that the hard way.
   *
   * Authorization is the DATABASE's, not this method's: `events_auth_update` is
   * super admin OR created_by OR (created_by IS NULL AND same institution). A
   * denial is not silent here — updateEvent uses .select().single(), so an
   * RLS-refused UPDATE comes back as PGRST116 and throws rather than reporting a
   * success that changed nothing. The UI still mirrors the policy with
   * canEditEvent() so the option is not offered to someone it would refuse.
   */
  static async updateStatus(id: string, newStatus: EventStatus): Promise<Event> {
    try {
      const event = await EventBaseService.getEvent(id);
      if (!event) {
        throw new Error(`Induction not found: ${id}`);
      }

      const allowedTransitions = INDUCTION_STATUS_TRANSITIONS[event.status] ?? [];
      if (!allowedTransitions.includes(newStatus)) {
        throw new Error(
          `Invalid status transition: ${event.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
        );
      }

      const updated = await EventBaseService.updateEvent(id, { status: newStatus });
      logger.info('events/induction', 'Status updated', {
        eventId: id,
        from: event.status,
        to: newStatus,
      });

      return updated;
    } catch (error) {
      logger.error('events/induction', 'Failed to update induction status', {
        id,
        newStatus,
        error,
      });
      throw error;
    }
  }
}
