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
}
