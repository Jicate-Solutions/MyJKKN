// lib/services/startup-studio/presentations-service.ts
// CRUD operations for ss_presentation_slots (Demo Day)

import { BaseService } from '../base-service';

export class PresentationsService extends BaseService {
  // Get all presentation slots for an event
  static async getEventSlots(eventId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('ss_presentation_slots')
      .select('*, team:ss_teams(id, name), submission:ss_appathon_submissions(id, app_name, team_name)')
      .eq('event_id', eventId)
      .order('slot_time', { ascending: true });
    if (error) throw new Error(`Failed to fetch presentation slots: ${error.message}`);
    return data || [];
  }

  // Auto-generate time slots for an event
  static async generateSlots(input: {
    event_id: string;
    start_time: string; // ISO string
    duration_mins: number;
    count: number;
    room?: string;
  }): Promise<any[]> {
    const slots = [];
    const start = new Date(input.start_time);
    for (let i = 0; i < input.count; i++) {
      const slotTime = new Date(start.getTime() + i * input.duration_mins * 60 * 1000);
      slots.push({
        event_id: input.event_id,
        slot_time: slotTime.toISOString(),
        duration_mins: input.duration_mins,
        room: input.room || null,
        status: 'scheduled',
      });
    }
    const { data, error } = await this.supabase
      .from('ss_presentation_slots')
      .insert(slots)
      .select();
    if (error) throw new Error(`Failed to generate slots: ${error.message}`);
    return data || [];
  }

  // Assign a team to a slot
  static async assignTeamToSlot(slotId: string, teamId: string, submissionId?: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_presentation_slots')
      .update({
        team_id: teamId,
        submission_id: submissionId || null,
      })
      .eq('id', slotId)
      .select()
      .single();
    if (error) throw new Error(`Failed to assign team to slot: ${error.message}`);
    return data;
  }

  // Update slot status
  static async updateSlotStatus(slotId: string, status: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_presentation_slots')
      .update({ status })
      .eq('id', slotId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update slot status: ${error.message}`);
    return data;
  }
}

export const presentationsService = {
  getEventSlots: PresentationsService.getEventSlots.bind(PresentationsService),
  generateSlots: PresentationsService.generateSlots.bind(PresentationsService),
  assignTeamToSlot: PresentationsService.assignTeamToSlot.bind(PresentationsService),
  updateSlotStatus: PresentationsService.updateSlotStatus.bind(PresentationsService),
};
