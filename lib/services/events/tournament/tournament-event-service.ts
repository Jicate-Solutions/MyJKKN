// lib/services/events/tournament/tournament-event-service.ts
// Sports Tournament service — wraps EventBaseService (mirror of MarathonEventService).
// A tournament IS an `events` row with event_type='sports_tournament'; its
// competition categories live in the `tournament_divisions` table.
// Created: 2026-06-22 (Sports Tournament PR1).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { Event, CreateEventDto, UpdateEventDto, EventStatus } from '@/types/events';
import { TOURNAMENT_STATUS_TRANSITIONS } from '@/types/tournament';
import type {
  Tournament,
  TournamentDivision,
  CreateTournamentDto,
  CreateDivisionDto,
  UpdateDivisionDto,
} from '@/types/tournament';

const EVENT_TYPE = 'sports_tournament' as const;

export class TournamentEventService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Fetch all tournaments. No institution filter — cross-JKKN tournaments are
   * visible by `events.scope`/`visibility`; RLS does the per-row gating.
   */
  static async getTournaments(): Promise<Event[]> {
    try {
      return await EventBaseService.getEvents({ event_type: EVENT_TYPE });
    } catch (error) {
      logger.error('events/tournament', 'Failed to fetch tournaments', error);
      throw error;
    }
  }

  /**
   * Fetch a single tournament by ID, including its divisions.
   * Returns null when the event does not exist.
   */
  static async getTournament(id: string): Promise<Tournament | null> {
    try {
      const event = await EventBaseService.getEvent(id);
      if (!event) return null;

      const divisions = await this.getDivisions(id);
      return { ...event, divisions };
    } catch (error) {
      logger.error('events/tournament', 'Failed to fetch tournament', { id, error });
      throw error;
    }
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Create a new tournament (an `events` row with event_type='sports_tournament')
   * plus any seeded divisions. Forces event_type; derives a unique slug; and
   * guarantees the events `venue_at_least_one` CHECK by defaulting venue_text
   * when no venue is supplied.
   */
  static async createTournament(dto: CreateTournamentDto): Promise<Event> {
    try {
      const { divisions, scope, visibility, venue, ...rest } = dto;

      const resolvedScope = scope ?? 'institution';
      // Default visibility from scope when not explicitly chosen:
      // all_jkkn tournaments are visible to all JKKN; otherwise institution-scoped.
      const resolvedVisibility =
        visibility ?? (resolvedScope === 'all_jkkn' ? 'all_jkkn' : 'institution');

      const slug = await EventBaseService.generateUniqueSlug(rest.name.trim(), rest.year);

      // events has a CHECK: venue_resource_id OR venue_text OR venue must be set.
      // Public/external tournaments may have no fixed venue yet, so fall back to
      // a placeholder venue_text to satisfy the constraint (organizer edits later).
      const venueText = venue?.trim() ? undefined : 'To be announced';

      const eventDto: CreateEventDto = {
        ...rest,
        name: rest.name.trim(),
        slug,
        event_type: EVENT_TYPE,
        scope: resolvedScope,
        visibility: resolvedVisibility,
        venue: venue?.trim() || undefined,
        venue_text: venueText,
      };

      const event = await EventBaseService.createEvent(eventDto);

      // Seed divisions (best-effort: a failed division does not roll back the event).
      if (divisions?.length) {
        for (const [i, div] of divisions.entries()) {
          try {
            await this.createDivision(event.id, { sort_order: i, ...div });
          } catch (divError) {
            logger.warn('events/tournament', 'Failed to seed division', {
              eventId: event.id,
              sport: div.sport,
              error: divError,
            });
          }
        }
      }

      // Auto-create an empty registration form row (best-effort — the read
      // path lazy-creates one anyway if this fails, per getOrCreateForm).
      try {
        const { EventRegistrationFormService } = await import(
          '@/lib/services/events/tournament/event-registration-form-service'
        );
        await EventRegistrationFormService.getOrCreateForm(event.id);
      } catch (formError) {
        logger.warn('events/tournament', 'Failed to seed registration form', {
          eventId: event.id,
          error: formError,
        });
      }

      logger.info('events/tournament', 'Tournament created', {
        eventId: event.id,
        name: event.name,
        scope: resolvedScope,
        divisions: divisions?.length ?? 0,
      });

      return event;
    } catch (error) {
      logger.error('events/tournament', 'Failed to create tournament', error);
      throw error;
    }
  }

  /** Update general tournament settings (name, dates, venue, scope, etc.). */
  static async updateTournament(
    id: string,
    dto: Partial<UpdateEventDto>
  ): Promise<Event> {
    try {
      const updated = await EventBaseService.updateEvent(id, dto);
      logger.info('events/tournament', 'Tournament updated', { eventId: id });
      return updated;
    } catch (error) {
      logger.error('events/tournament', 'Failed to update tournament', { id, error });
      throw error;
    }
  }

  /**
   * Validate and update tournament status with transition check
   * (mirror of MarathonEventService.updateStatus).
   */
  static async updateStatus(id: string, newStatus: EventStatus): Promise<Event> {
    try {
      const event = await EventBaseService.getEvent(id);
      if (!event) {
        throw new Error(`Tournament not found: ${id}`);
      }

      // Tournaments run a 2-state model (Draft <-> Active), so they are gated on
      // TOURNAMENT_STATUS_TRANSITIONS, not the shared EVENT_STATUS_TRANSITIONS —
      // the latter's draft entry is ['planning','cancelled'] and would reject
      // draft->live outright. The shared map still governs every other event type.
      const allowedTransitions = TOURNAMENT_STATUS_TRANSITIONS[event.status] ?? [];
      if (!allowedTransitions.includes(newStatus)) {
        throw new Error(
          `Invalid status transition: ${event.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
        );
      }

      const updated = await EventBaseService.updateEvent(id, { status: newStatus });
      logger.info('events/tournament', 'Status updated', {
        eventId: id,
        from: event.status,
        to: newStatus,
      });

      return updated;
    } catch (error) {
      logger.error('events/tournament', 'Failed to update tournament status', { id, newStatus, error });
      throw error;
    }
  }

  /** Delete a tournament (cascades to divisions via FK ON DELETE CASCADE). */
  static async deleteTournament(id: string): Promise<void> {
    try {
      await EventBaseService.deleteEvent(id);
      logger.info('events/tournament', 'Tournament deleted', { eventId: id });
    } catch (error) {
      logger.error('events/tournament', 'Failed to delete tournament', { id, error });
      throw error;
    }
  }

  // ============================================================================
  // Division CRUD (tournament_divisions table)
  // ============================================================================

  /** Fetch all divisions for a tournament, ordered by sort_order ASC. */
  static async getDivisions(eventId: string): Promise<TournamentDivision[]> {
    try {
      const { data, error } = await (
        this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>
      )
        .from('tournament_divisions')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('events/tournament', 'Failed to fetch divisions', { eventId, error });
        throw error;
      }

      return (data as unknown as TournamentDivision[]) ?? [];
    } catch (error) {
      logger.error('events/tournament', 'Unexpected error in getDivisions', error);
      throw error;
    }
  }

  /** Create a division under a tournament. */
  static async createDivision(
    eventId: string,
    dto: CreateDivisionDto
  ): Promise<TournamentDivision> {
    try {
      const payload = {
        event_id: eventId,
        sport: dto.sport,
        gender: dto.gender ?? null,
        age_band: dto.age_band ?? null,
        format: dto.format ?? 'knockout',
        level: dto.level ?? null,
        max_teams: dto.max_teams ?? null,
        eligibility: dto.eligibility ?? {},
        config: dto.config ?? {},
        sort_order: dto.sort_order ?? 0,
      };

      const { data, error } = await (
        this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>
      )
        .from('tournament_divisions')
        .insert([payload])
        .select()
        .single();

      if (error) {
        logger.error('events/tournament', 'Failed to create division', {
          eventId,
          message: error.message,
          code: error.code,
          details: error.details,
        });
        throw new Error(error.message || 'Failed to create division');
      }

      return data as unknown as TournamentDivision;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('events/tournament', 'Unexpected error in createDivision', {
          message: error.message,
        });
      }
      throw error;
    }
  }

  /** Update a division. */
  static async updateDivision(
    id: string,
    dto: UpdateDivisionDto
  ): Promise<TournamentDivision> {
    try {
      const { data, error } = await (
        this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>
      )
        .from('tournament_divisions')
        .update({ ...dto, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('events/tournament', 'Failed to update division', { id, error });
        throw new Error(error.message || 'Failed to update division');
      }

      return data as unknown as TournamentDivision;
    } catch (error) {
      logger.error('events/tournament', 'Unexpected error in updateDivision', error);
      throw error;
    }
  }

  /** Delete a division. */
  static async deleteDivision(id: string): Promise<void> {
    try {
      const { error } = await (
        this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>
      )
        .from('tournament_divisions')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/tournament', 'Failed to delete division', { id, error });
        throw new Error(error.message || 'Failed to delete division');
      }
    } catch (error) {
      logger.error('events/tournament', 'Unexpected error in deleteDivision', error);
      throw error;
    }
  }
}
