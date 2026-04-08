// lib/services/events/marathon/marathon-event-service.ts
// Marathon-specific event service — wraps EventBaseService with marathon logic.
// Created: 2026-04-07

import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  Event,
  EventCategory,
  EventStatus,
  CreateEventDto,
  UpdateEventDto,
} from '@/types/events';

// Default marathon categories created with every new marathon event
const DEFAULT_MARATHON_CATEGORIES: Omit<
  Partial<EventCategory>,
  'id' | 'event_id' | 'created_at' | 'updated_at'
>[] = [
  {
    name: '10 KM Run',
    code: '10K',
    distance_km: 10,
    fee_amount: 500,
    early_bird_fee: 400,
    sort_order: 1,
    is_active: true,
    config: {},
  },
  {
    name: '5 KM Run',
    code: '5K',
    distance_km: 5,
    fee_amount: 300,
    early_bird_fee: 250,
    sort_order: 2,
    is_active: true,
    config: {},
  },
  {
    name: '3 KM Fun Run',
    code: '3K',
    distance_km: 3,
    fee_amount: 200,
    early_bird_fee: 150,
    sort_order: 3,
    is_active: true,
    config: {},
  },
];

// Valid status transitions (imported logic from types)
const STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['preparation', 'cancelled'],
  preparation: ['execution', 'cancelled'],
  execution: ['live', 'cancelled'],
  live: ['post_event'],
  post_event: ['archived'],
  archived: [],
  cancelled: ['draft'],
};

export class MarathonEventService {
  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Fetch all marathon events — no institution filter.
   * Marathon events are common across all JKKN institutions.
   * The institutionId parameter is kept for API compatibility but ignored.
   */
  static async getMarathonEvents(_institutionId?: string): Promise<Event[]> {
    try {
      return await EventBaseService.getEvents({
        event_type: 'marathon',
      });
    } catch (error) {
      logger.error('events/marathon', 'Failed to fetch marathon events', error);
      throw error;
    }
  }

  /**
   * Fetch a single marathon event by ID, including its categories.
   */
  static async getMarathonEvent(
    id: string
  ): Promise<(Event & { categories: EventCategory[] }) | null> {
    try {
      const event = await EventBaseService.getEvent(id);
      if (!event) return null;

      const categories = await EventBaseService.getCategories(id);

      return { ...event, categories };
    } catch (error) {
      logger.error('events/marathon', 'Failed to fetch marathon event', { id, error });
      throw error;
    }
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Create a new marathon event with default categories (10K, 5K, 3K).
   */
  static async createMarathonEvent(
    dto: Omit<CreateEventDto, 'event_type'>
  ): Promise<Event> {
    try {
      // Force event_type to 'marathon'
      const event = await EventBaseService.createEvent({
        ...dto,
        event_type: 'marathon',
      });

      // Create default categories for this marathon
      for (const cat of DEFAULT_MARATHON_CATEGORIES) {
        try {
          await EventBaseService.createCategory({
            ...cat,
            event_id: event.id,
          });
        } catch (catError) {
          // Log but don't fail the whole creation if a category fails
          logger.warn('events/marathon', 'Failed to create default category', {
            eventId: event.id,
            category: cat.name,
            error: catError,
          });
        }
      }

      logger.info('events/marathon', 'Marathon event created with default categories', {
        eventId: event.id,
        name: event.name,
      });

      return event;
    } catch (error) {
      logger.error('events/marathon', 'Failed to create marathon event', error);
      throw error;
    }
  }

  /**
   * Validate and update event status with transition check.
   */
  static async updateStatus(id: string, newStatus: EventStatus): Promise<Event> {
    try {
      const event = await EventBaseService.getEvent(id);
      if (!event) {
        throw new Error(`Event not found: ${id}`);
      }

      const allowedTransitions = STATUS_TRANSITIONS[event.status] ?? [];
      if (!allowedTransitions.includes(newStatus)) {
        throw new Error(
          `Invalid status transition: ${event.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
        );
      }

      const updated = await EventBaseService.updateEvent(id, { status: newStatus });
      logger.info('events/marathon', 'Status updated', {
        eventId: id,
        from: event.status,
        to: newStatus,
      });

      return updated;
    } catch (error) {
      logger.error('events/marathon', 'Failed to update event status', { id, newStatus, error });
      throw error;
    }
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  /**
   * Update general event settings (name, theme, venue, dates, hero image, etc.).
   */
  static async updateGeneralSettings(
    id: string,
    dto: Partial<UpdateEventDto>
  ): Promise<Event> {
    try {
      const updated = await EventBaseService.updateEvent(id, dto);
      logger.info('events/marathon', 'General settings updated', { eventId: id });
      return updated;
    } catch (error) {
      logger.error('events/marathon', 'Failed to update general settings', { id, error });
      throw error;
    }
  }

  /**
   * Update registration configuration (open/close dates, allow_external, etc.).
   */
  static async updateRegistrationConfig(
    id: string,
    config: {
      registration_open_date?: string;
      registration_close_date?: string;
      allow_external_registration?: boolean;
      registration_config?: Record<string, unknown>;
    }
  ): Promise<Event> {
    try {
      const updated = await EventBaseService.updateEvent(id, config);
      logger.info('events/marathon', 'Registration config updated', { eventId: id });
      return updated;
    } catch (error) {
      logger.error('events/marathon', 'Failed to update registration config', { id, error });
      throw error;
    }
  }

  /**
   * Update route configuration (checkpoints, map data, etc.).
   */
  static async updateRouteConfig(
    id: string,
    routeConfig: Record<string, unknown>
  ): Promise<Event> {
    try {
      const updated = await EventBaseService.updateEvent(id, {
        route_config: routeConfig,
      });
      logger.info('events/marathon', 'Route config updated', { eventId: id });
      return updated;
    } catch (error) {
      logger.error('events/marathon', 'Failed to update route config', { id, error });
      throw error;
    }
  }

  // ============================================================================
  // Category Management (Delegates to EventBaseService)
  // ============================================================================

  static getCategories = EventBaseService.getCategories.bind(EventBaseService);
  static createCategory = EventBaseService.createCategory.bind(EventBaseService);
  static updateCategory = EventBaseService.updateCategory.bind(EventBaseService);
  static deleteCategory = EventBaseService.deleteCategory.bind(EventBaseService);
}
