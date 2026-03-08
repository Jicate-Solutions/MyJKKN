// lib/services/startup-studio/event-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StartupEvent,
  CreateEventDto,
  UpdateEventDto,
  EventFilters,
  EventStatus,
  LearnerParticipationStats,
  LearnerParticipationFilters,
} from '@/types/startup-studio';

export class EventService {
  // Typed as any because startup-studio tables are not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  static async getEvents(filters?: EventFilters): Promise<StartupEvent[]> {
    let query = this.supabase
      .from('startup_events')
      .select(`
        *,
        host_institution:institutions(id, name),
        creator:profiles!startup_events_created_by_fkey(id, full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters?.host_institution_id) {
      query = query.eq('host_institution_id', filters.host_institution_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/events] getEvents failed:', error);
      throw error;
    }
    return (data || []) as unknown as StartupEvent[];
  }

  static async getEvent(id: string): Promise<StartupEvent | null> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .select(`
        *,
        host_institution:institutions(id, name),
        creator:profiles!startup_events_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[startup/events] getEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent | null;
  }

  static async createEvent(dto: CreateEventDto, userId: string): Promise<StartupEvent> {
    const defaultConfig = {
      team_max_size: 5,
      categories: [],
      tools: [],
      scoring_type: 'tiered',
      tier_points: { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
      mrr_bonus_brackets: [
        { min: 1, max: 99, points: 5 },
        { min: 100, max: 499, points: 10 },
        { min: 500, max: 999, points: 15 },
        { min: 1000, max: null, points: 20 },
      ],
    };

    const { data, error } = await this.supabase
      .from('startup_events')
      .insert({
        name: dto.name,
        description: dto.description || null,
        host_institution_id: dto.host_institution_id || null,
        start_date: dto.start_date || null,
        end_date: dto.end_date || null,
        demo_date: dto.demo_date || null,
        registration_deadline: dto.registration_deadline || null,
        submission_deadline: dto.submission_deadline || null,
        metrics_deadline: dto.metrics_deadline || null,
        config: { ...defaultConfig, ...(dto.config || {}) },
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/events] createEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent;
  }

  static async updateEvent(id: string, dto: UpdateEventDto): Promise<StartupEvent> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[startup/events] updateEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent;
  }

  static async updateStatus(id: string, status: EventStatus): Promise<StartupEvent> {
    return this.updateEvent(id, { status });
  }

  static async getEventStats(eventId: string) {
    const { data, error } = await this.supabase
      .rpc('get_event_stats', { p_event_id: eventId });

    if (error) {
      console.error('[startup/events] getEventStats failed:', error);
      throw error;
    }

    return data as {
      total_teams: number;
      checked_in_teams: number;
      total_members: number;
      members_with_laptops: number;
      institutions: number;
    };
  }

  static async getLearnerParticipationStats(
    eventId: string,
    filters: LearnerParticipationFilters = {}
  ): Promise<LearnerParticipationStats> {
    const { data, error } = await this.supabase.rpc('get_learner_participation_stats', {
      p_event_id:       eventId,
      p_institution_id: filters.institution_id ?? null,
      p_degree_id:      filters.degree_id ?? null,
      p_department_id:  filters.department_id ?? null,
      p_program_id:     filters.program_id ?? null,
      p_semester_id:    filters.semester_id ?? null,
    });

    if (error) {
      console.error('[startup/events] getLearnerParticipationStats failed:', error);
      throw error;
    }

    return data as LearnerParticipationStats;
  }
}
