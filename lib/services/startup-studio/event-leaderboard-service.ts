import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeaderboardEntry, EventDemoSlot } from '@/types/startup-studio';

export class EventLeaderboardService {
  // Typed as any because startup-studio tables are not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  static async getLeaderboard(eventId: string): Promise<LeaderboardEntry[]> {
    const { data, error } = await this.supabase
      .from('event_submissions')
      .select(`
        id, app_name, category, tier_level, tier_points, mrr_amount,
        mrr_bonus_points, total_score, paying_users_count, user_count,
        mrr_verified, registration_id,
        registration:event_registrations(id, team_name, institution_id,
          institution:institutions(id, name)
        )
      `)
      .eq('event_id', eventId)
      .order('total_score', { ascending: false })
      .order('mrr_amount', { ascending: false });

    if (error) {
      console.error('[startup/leaderboard] getLeaderboard failed:', error);
      throw error;
    }

    return (data ?? []).map((row: any, index: number) => ({
      rank: index + 1,
      team_name: row.registration?.team_name ?? 'Unknown',
      app_name: row.app_name,
      category: row.category,
      institution_id: row.registration?.institution_id ?? null,
      institution_name: row.registration?.institution?.name ?? null,
      tier_level: row.tier_level,
      tier_points: row.tier_points,
      mrr_amount: row.mrr_amount,
      mrr_bonus_points: row.mrr_bonus_points,
      total_score: row.total_score,
      paying_users_count: row.paying_users_count,
      user_count: row.user_count,
      registration_id: row.registration_id,
      submission_id: row.id,
    }));
  }

  static async publishResults(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('startup_events')
      .update({ is_results_published: true, updated_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) {
      console.error('[startup/leaderboard] publishResults failed:', error);
      throw error;
    }
  }

  static async unpublishResults(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('startup_events')
      .update({ is_results_published: false, updated_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) {
      console.error('[startup/leaderboard] unpublishResults failed:', error);
      throw error;
    }
  }

  static async getMrrVerificationQueue(eventId: string) {
    const { data, error } = await this.supabase
      .from('event_submissions')
      .select(`
        id, mrr_amount, paying_users_count, proof_urls, registration_id,
        registration:event_registrations(id, team_name)
      `)
      .eq('event_id', eventId)
      .gte('tier_level', 4)
      .eq('mrr_verified', false)
      .order('mrr_amount', { ascending: false });

    if (error) {
      console.error('[startup/leaderboard] getMrrVerificationQueue failed:', error);
      throw error;
    }
    return data ?? [];
  }

  static async verifyMrr(submissionId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_submissions')
      .update({
        mrr_verified: true,
        mrr_verified_at: new Date().toISOString(),
        mrr_verified_by: userId,
      })
      .eq('id', submissionId);

    if (error) {
      console.error('[startup/leaderboard] verifyMrr failed:', error);
      throw error;
    }
  }

  static async rejectMrr(submissionId: string, reason: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_submissions')
      .update({
        mrr_verified: false,
        mrr_rejected_reason: reason,
        mrr_verified_by: userId,
      })
      .eq('id', submissionId);

    if (error) {
      console.error('[startup/leaderboard] rejectMrr failed:', error);
      throw error;
    }
  }

  static async getDemoSlots(eventId: string): Promise<EventDemoSlot[]> {
    const { data, error } = await this.supabase
      .from('event_demo_slots')
      .select(`
        *,
        registration:event_registrations(id, team_name),
        venue_assignment:event_venue_assignments(id, manual_name)
      `)
      .eq('event_id', eventId)
      .order('slot_order', { ascending: true });

    if (error) {
      console.error('[startup/leaderboard] getDemoSlots failed:', error);
      throw error;
    }
    return (data ?? []) as unknown as EventDemoSlot[];
  }

  static async generateDemoSlots(
    eventId: string,
    venueAssignmentId: string,
    startTime: string,
    durationMinutes: number,
    roomLabel: string,
    count: number
  ): Promise<void> {
    const slots = Array.from({ length: count }, (_, i) => {
      const slotStart = new Date(new Date(startTime).getTime() + i * durationMinutes * 60_000);
      return {
        event_id: eventId,
        venue_assignment_id: venueAssignmentId,
        start_time: slotStart.toISOString(),
        duration_minutes: durationMinutes,
        room_label: roomLabel,
        slot_order: i + 1,
        registration_id: null,
      };
    });

    const { error } = await this.supabase
      .from('event_demo_slots')
      .insert(slots);

    if (error) {
      console.error('[startup/leaderboard] generateDemoSlots failed:', error);
      throw error;
    }
  }

  static async assignTeamToSlot(slotId: string, registrationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_demo_slots')
      .update({ registration_id: registrationId })
      .eq('id', slotId);

    if (error) {
      console.error('[startup/leaderboard] assignTeamToSlot failed:', error);
      throw error;
    }
  }

  static async unassignSlot(slotId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_demo_slots')
      .update({ registration_id: null })
      .eq('id', slotId);

    if (error) {
      console.error('[startup/leaderboard] unassignSlot failed:', error);
      throw error;
    }
  }
}
