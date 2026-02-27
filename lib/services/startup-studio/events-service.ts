// lib/services/startup-studio/events-service.ts
// CRUD operations for ss_events table

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSEvent,
  CreateEventInput,
} from '@/types/startup-studio';

export class EventsService extends BaseService {
  static async getEvents(
    filters?: {
      page?: number;
      limit?: number;
      search?: string;
      is_active?: boolean;
      institution_id?: string;
    }
  ): Promise<BaseListResponse<SSEvent>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('name', `%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch events: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as SSEvent[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async getEventById(id: string): Promise<SSEvent | null> {
    const { data, error } = await this.supabase
      .from('ss_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch event: ${error.message}`);
    }

    return data as SSEvent;
  }

  static async getEventBySlug(slug: string): Promise<SSEvent | null> {
    const { data, error } = await this.supabase
      .from('ss_events')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch event by slug: ${error.message}`);
    }

    return data as SSEvent;
  }

  static async createEvent(input: CreateEventInput): Promise<SSEvent> {
    const { data, error } = await this.supabase
      .from('ss_events')
      .insert({
        ...input,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create event: ${error.message}`);
    return data as SSEvent;
  }

  static async updateEvent(
    id: string,
    input: Partial<CreateEventInput & { is_active?: boolean }>
  ): Promise<SSEvent> {
    const { data, error } = await this.supabase
      .from('ss_events')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update event: ${error.message}`);
    return data as SSEvent;
  }

  static async deleteEvent(id: string): Promise<void> {
    const { error } = await this.supabase.from('ss_events').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete event: ${error.message}`);
  }

  static async getActiveEvents(): Promise<SSEvent[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('ss_events')
      .select('*')
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .lte('start_date', now)
      .order('start_date', { ascending: true });

    if (error) throw new Error(`Failed to fetch active events: ${error.message}`);
    return (data || []) as SSEvent[];
  }
}

export const eventsService = {
  getEvents: EventsService.getEvents.bind(EventsService),
  getEventById: EventsService.getEventById.bind(EventsService),
  getEventBySlug: EventsService.getEventBySlug.bind(EventsService),
  createEvent: EventsService.createEvent.bind(EventsService),
  updateEvent: EventsService.updateEvent.bind(EventsService),
  deleteEvent: EventsService.deleteEvent.bind(EventsService),
  getActiveEvents: EventsService.getActiveEvents.bind(EventsService),
};
