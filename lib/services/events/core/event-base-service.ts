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
      const { data, error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('events/core', 'Failed to update event', { id, error });
        throw error;
      }

      return data as unknown as Event;
    } catch (error) {
      logger.error('events/core', 'Unexpected error in updateEvent', error);
      throw error;
    }
  }

  /**
   * Delete an event record by ID.
   */
  static async deleteEvent(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as unknown as ReturnType<typeof createClientSupabaseClient>)
        .from('events')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/core', 'Failed to delete event', { id, error });
        throw error;
      }
    } catch (error) {
      logger.error('events/core', 'Unexpected error in deleteEvent', error);
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
}
