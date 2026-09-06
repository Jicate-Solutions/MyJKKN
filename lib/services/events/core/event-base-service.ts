// lib/services/events/core/event-base-service.ts
// Core event service — generic CRUD for `events` and `event_categories` tables.
// Sub-modules (marathon, cultural-fest, etc.) extend this for base operations.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  Event,
  EventCategory,
  CreateEventDto,
  UpdateEventDto,
  EventDeleteBlockers,
  EventFilters,
} from '@/types/events';

export class EventBaseService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // Events CRUD
  // ============================================================================

  /**
   * Fetch events with optional filtering.
   * Supports: institution_id, event_type, status (single or array),
   *           is_active, search (name/slug ilike), year.
   * Results ordered by created_at DESC.
   */
  static async getEvents(filters: EventFilters): Promise<Event[]> {
    try {
      let query = (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.event_type) {
        query = query.eq('event_type', filters.event_type);
      }
      if (filters.status !== undefined) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`
        );
      }
      if (filters.year !== undefined) {
        query = query.eq('year', filters.year);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('events/core', 'Failed to fetch events', error);
        throw error;
      }

      return (data as unknown as Event[]) ?? [];
    } catch (error) {
      logger.error('events/core', 'Unexpected error in getEvents', error);
      throw error;
    }
  }

  /**
   * Fetch a single event by ID.
   * Returns null (not an error) when the record does not exist (PGRST116).
   */
  static async getEvent(id: string): Promise<Event | null> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        // PGRST116 = "Row not found" — treat as null, not an error
        if (error.code === 'PGRST116') return null;
        logger.error('events/core', 'Failed to fetch event', { id, error });
        throw error;
      }

      return data as unknown as Event;
    } catch (error) {
      logger.error('events/core', 'Unexpected error in getEvent', error);
      throw error;
    }
  }

  /**
   * Fetch a single event by its URL slug.
   * Returns null when not found (PGRST116).
   */
  static async getEventBySlug(slug: string): Promise<Event | null> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error('events/core', 'Failed to fetch event by slug', { slug, error });
        throw error;
      }

      return data as unknown as Event;
    } catch (error) {
      logger.error('events/core', 'Unexpected error in getEventBySlug', error);
      throw error;
    }
  }

  /**
   * Create a new event record.
   */
  static async createEvent(dto: CreateEventDto): Promise<Event> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .insert([dto])
        .select()
        .single();

      if (error) {
        logger.error('events/core', 'Failed to create event', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          dto_keys: Object.keys(dto),
        });
        throw new Error(error.message || 'Failed to create event');
      }

      return data as unknown as Event;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('events/core', 'Unexpected error in createEvent', { message: error.message });
      }
      throw error;
    }
  }

  /**
   * Update an existing event record.
   */
  static async updateEvent(id: string, dto: UpdateEventDto): Promise<Event> {
    try {
      const updatePayload = { ...dto, updated_at: new Date().toISOString() };
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('events/core', 'Failed to update event', {
          id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(error.message || 'Failed to update event');
      }

      return data as unknown as Event;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('events/core', 'Unexpected error in updateEvent', { message: error.message });
      }
      throw error;
    }
  }

  /**
   * What a delete would cascade away — read before offering the confirm.
   *
   * Goes through fn_event_delete_blockers rather than counting the child tables
   * here: both are RLS-gated, so a client-side count returns 0 for any caller
   * who cannot see the registrations and would report "safe to delete" on the
   * exact rows the check exists to protect. The RPC self-authorizes on
   * events.delete, so a caller without the key gets 42501 rather than a count.
   *
   * `.rpc` is typed against the generated Database map, which doesn't carry this
   * function yet; the narrow structural cast is the same one used by
   * lib/services/events/tournament/organizer-access.ts.
   */
  static async getEventDeleteBlockers(id: string): Promise<EventDeleteBlockers> {
    const client = this.supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>
      ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };

    const { data, error } = await client.rpc('fn_event_delete_blockers', {
      p_event_id: id,
    });

    if (error) {
      logger.error('events/core', 'Failed to read event delete blockers', {
        id,
        message: error.message,
      });
      throw new Error(error.message || 'Could not check what this delete would remove');
    }

    return data as EventDeleteBlockers;
  }

  /**
   * Delete an event record by ID.
   *
   * Gated by the events_auth_delete RLS policy (events.delete + institution
   * access) and refused outright by trg_events_block_delete_with_dependents when
   * the event holds registrations or payment transactions — 43 child tables
   * cascade off this row. A blocked delete arrives here as a P0001 error.
   *
   * The `.select('id')` is load-bearing, not decoration. A DELETE that RLS
   * refuses is not an error — PostgREST reports success and removes nothing, so
   * checking only `error` would toast "Event deleted" over a row that is still
   * there. Chaining select() returns the rows actually deleted; an empty array
   * is how a denied delete announces itself.
   */
  static async deleteEvent(id: string): Promise<void> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        logger.error('events/core', 'Failed to delete event', {
          id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(error.message || 'Failed to delete event');
      }

      if (!data || data.length === 0) {
        logger.error('events/core', 'Delete removed no rows (RLS denied)', { id });
        throw new Error(
          'You do not have permission to delete this event. It needs the "Delete Events" permission on one of your roles.'
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('events/core', 'Unexpected error in deleteEvent', { message: error.message });
      }
      throw error;
    }
  }

  // ============================================================================
  // Event Categories CRUD
  // ============================================================================

  /**
   * Fetch all categories for a given event, ordered by sort_order ASC.
   */
  static async getCategories(eventId: string): Promise<EventCategory[]> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('event_categories')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('events/core', 'Failed to fetch event categories', { eventId, error });
        throw error;
      }

      return (data as unknown as EventCategory[]) ?? [];
    } catch (error) {
      logger.error('events/core', 'Unexpected error in getCategories', error);
      throw error;
    }
  }

  /**
   * Create a new event category.
   */
  static async createCategory(dto: Partial<EventCategory>): Promise<EventCategory> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('event_categories')
        .insert([dto])
        .select()
        .single();

      if (error) {
        logger.error('events/core', 'Failed to create event category', error);
        throw error;
      }

      return data as unknown as EventCategory;
    } catch (error) {
      logger.error('events/core', 'Unexpected error in createCategory', error);
      throw error;
    }
  }

  /**
   * Update an existing event category.
   */
  static async updateCategory(
    id: string,
    dto: Partial<EventCategory>
  ): Promise<EventCategory> {
    try {
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('event_categories')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('events/core', 'Failed to update event category', { id, error });
        throw error;
      }

      return data as unknown as EventCategory;
    } catch (error) {
      logger.error('events/core', 'Unexpected error in updateCategory', error);
      throw error;
    }
  }

  /**
   * Delete an event category by ID.
   */
  static async deleteCategory(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('event_categories')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/core', 'Failed to delete event category', { id, error });
        throw error;
      }
    } catch (error) {
      logger.error('events/core', 'Unexpected error in deleteCategory', error);
      throw error;
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Generate a URL-safe slug from an event name.
   * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
   * collapses consecutive hyphens, trims leading/trailing hyphens,
   * and appends the year when provided.
   *
   * Examples:
   *   generateSlug('JKKN Marathon')       → 'jkkn-marathon'
   *   generateSlug('JKKN Marathon', 2026) → 'jkkn-marathon-2026'
   */
  static generateSlug(name: string, year?: number): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return year !== undefined ? `${base}-${year}` : base;
  }

  /**
   * Generate a unique slug by checking for collisions in the database.
   * If the slug already exists, appends -2, -3, etc.
   */
  static async generateUniqueSlug(name: string, year?: number): Promise<string> {
    const baseSlug = this.generateSlug(name, year);

    // Check if base slug is available
    const existing = await this.getEventBySlug(baseSlug);
    if (!existing) return baseSlug;

    // Slug taken — try with suffix
    for (let i = 2; i <= 100; i++) {
      const candidateSlug = `${baseSlug}-${i}`;
      const check = await this.getEventBySlug(candidateSlug);
      if (!check) return candidateSlug;
    }

    // Fallback — append random string
    const rand = Math.random().toString(36).substring(2, 6);
    return `${baseSlug}-${rand}`;
  }
}
