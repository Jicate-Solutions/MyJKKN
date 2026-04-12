// lib/services/startup-studio/checklists-service.ts
// CRUD operations for ss_event_checklists and ss_checklist_responses

import { BaseService, type BaseListResponse } from '../base-service';

export class ChecklistsService extends BaseService {
  // Get all checklists for an event, grouped by phase
  static async getEventChecklists(eventId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('ss_event_checklists')
      .select('*, responses:ss_checklist_responses(*)')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Failed to fetch checklists: ${error.message}`);
    return data || [];
  }

  // Create a checklist item
  static async createChecklistItem(input: {
    event_id: string;
    phase: string;
    title: string;
    description?: string;
    sort_order?: number;
  }): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_event_checklists')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to create checklist item: ${error.message}`);
    return data;
  }

  // Seed default checklist items for an event
  static async seedDefaultChecklists(eventId: string): Promise<any[]> {
    const items = [
      // Pre-event
      { event_id: eventId, phase: 'pre_event', title: 'Verify all 5-member teams registered', sort_order: 1 },
      { event_id: eventId, phase: 'pre_event', title: 'Confirm laptops for each student', sort_order: 2 },
      { event_id: eventId, phase: 'pre_event', title: 'Share Lovable signup instructions', sort_order: 3 },
      { event_id: eventId, phase: 'pre_event', title: 'Share Anthropic API credit setup guide', sort_order: 4 },
      { event_id: eventId, phase: 'pre_event', title: 'Brief teams on hackathon rules', sort_order: 5 },
      { event_id: eventId, phase: 'pre_event', title: 'Ensure WiFi access for all students', sort_order: 6 },
      { event_id: eventId, phase: 'pre_event', title: 'Distribute venue and timing info', sort_order: 7 },
      // On-day
      { event_id: eventId, phase: 'on_day', title: 'Mark team attendance / check-in', sort_order: 1 },
      { event_id: eventId, phase: 'on_day', title: 'Distribute Lovable unlimited credit codes', sort_order: 2 },
      { event_id: eventId, phase: 'on_day', title: 'Distribute Anthropic API credits', sort_order: 3 },
      { event_id: eventId, phase: 'on_day', title: 'Verify all teams can access Lovable', sort_order: 4 },
      { event_id: eventId, phase: 'on_day', title: 'Assign mentors to teams', sort_order: 5 },
      { event_id: eventId, phase: 'on_day', title: 'Collect mid-day progress check', sort_order: 6 },
      // Post-event
      { event_id: eventId, phase: 'post_event', title: 'Ensure all teams submitted to Appathon 2.0', sort_order: 1 },
      { event_id: eventId, phase: 'post_event', title: 'Collect laptops (if institution-owned)', sort_order: 2 },
      { event_id: eventId, phase: 'post_event', title: 'Submit class participation report', sort_order: 3 },
      { event_id: eventId, phase: 'post_event', title: 'Verify mentor feedback submitted', sort_order: 4 },
    ];
    const { data, error } = await this.supabase
      .from('ss_event_checklists')
      .insert(items)
      .select();
    if (error) throw new Error(`Failed to seed checklists: ${error.message}`);
    return data || [];
  }

  // Toggle a checklist response
  static async toggleChecklistResponse(input: {
    checklist_id: string;
    user_id: string;
    institution_id?: string;
    is_completed: boolean;
    notes?: string;
  }): Promise<any> {
    // Upsert based on checklist_id + user_id
    const { data: existing } = await this.supabase
      .from('ss_checklist_responses')
      .select('id')
      .eq('checklist_id', input.checklist_id)
      .eq('user_id', input.user_id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await this.supabase
        .from('ss_checklist_responses')
        .update({
          is_completed: input.is_completed,
          notes: input.notes || null,
          completed_at: input.is_completed ? new Date().toISOString() : null,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update checklist response: ${error.message}`);
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('ss_checklist_responses')
        .insert({
          checklist_id: input.checklist_id,
          user_id: input.user_id,
          institution_id: input.institution_id || null,
          is_completed: input.is_completed,
          notes: input.notes || null,
          completed_at: input.is_completed ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create checklist response: ${error.message}`);
      return data;
    }
  }
}

export const checklistsService = {
  getEventChecklists: ChecklistsService.getEventChecklists.bind(ChecklistsService),
  createChecklistItem: ChecklistsService.createChecklistItem.bind(ChecklistsService),
  seedDefaultChecklists: ChecklistsService.seedDefaultChecklists.bind(ChecklistsService),
  toggleChecklistResponse: ChecklistsService.toggleChecklistResponse.bind(ChecklistsService),
};
