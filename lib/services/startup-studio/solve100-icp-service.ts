// lib/services/startup-studio/solve100-icp-service.ts
// Service layer for Solve for 100 ICP (Ideal Customer Profile) builder.
// Spec: docs/SPEC-solve-for-100.md
// Added: 2026-04-14

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  Solve100ICPProfile,
  CreateICPDto,
  UpdateICPDto,
} from '@/types/startup-studio';

export class Solve100ICPService {
  // Typed as any because solve100_* tables are not yet in generated database types.
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  /**
   * Get the current team's ICP for this event. Returns null when the team
   * hasn't built one yet.
   */
  static async getMyICP(
    eventId: string,
    teamId: string
  ): Promise<Solve100ICPProfile | null> {
    const { data, error } = await this.supabase
      .from('solve100_icp_profiles')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (error) {
      console.error('[startup/solve100] getMyICP failed:', error);
      throw error;
    }
    return data as Solve100ICPProfile | null;
  }

  /**
   * Create the ICP for a team. UNIQUE(event_id, team_id) prevents duplicates —
   * use updateICP() to revise an existing ICP.
   */
  static async createICP(
    dto: CreateICPDto,
    userId: string
  ): Promise<Solve100ICPProfile> {
    const { data, error } = await this.supabase
      .from('solve100_icp_profiles')
      .insert({
        event_id: dto.event_id,
        team_id: dto.team_id,
        customer_name: dto.customer_name,
        customer_age_gender: dto.customer_age_gender ?? null,
        customer_role: dto.customer_role ?? null,
        customer_location: dto.customer_location ?? null,
        customer_income: dto.customer_income ?? null,
        customer_phone_type: dto.customer_phone_type ?? null,
        problem_in_their_words: dto.problem_in_their_words,
        problem_frequency: dto.problem_frequency ?? null,
        problem_cost: dto.problem_cost ?? null,
        current_solution: dto.current_solution ?? null,
        current_spend: dto.current_spend ?? null,
        elevator_pitch: dto.elevator_pitch ?? null,
        proposed_price: dto.proposed_price ?? null,
        value_justification: dto.value_justification ?? null,
        top_objection: dto.top_objection ?? null,
        objection_response: dto.objection_response ?? null,
        market_size_50km: dto.market_size_50km ?? null,
        where_they_gather: dto.where_they_gather ?? null,
        plan_to_reach_10: dto.plan_to_reach_10 ?? null,
        has_talked_to_customer: dto.has_talked_to_customer ?? null,
        talk_date: dto.talk_date ?? null,
        submitted_by: userId,
        version: 1,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[startup/solve100] createICP failed:', error);
      throw error;
    }
    return data as Solve100ICPProfile;
  }

  /**
   * Update an ICP and bump its version number. Only sends keys that were
   * explicitly passed so we never overwrite a value with undefined.
   */
  static async updateICP(
    id: string,
    dto: UpdateICPDto
  ): Promise<Solve100ICPProfile> {
    // Read current version so we can increment it atomically (single UPDATE).
    const { data: existing, error: fetchErr } = await this.supabase
      .from('solve100_icp_profiles')
      .select('version')
      .eq('id', id)
      .single();

    if (fetchErr) {
      console.error('[startup/solve100] updateICP fetch failed:', fetchErr);
      throw fetchErr;
    }

    const patch: Record<string, unknown> = {
      version: ((existing as { version: number } | null)?.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error } = await this.supabase
      .from('solve100_icp_profiles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[startup/solve100] updateICP failed:', error);
      throw error;
    }
    return data as Solve100ICPProfile;
  }

  /**
   * Admin: all ICPs for an event (joined with team + institution name) for the
   * Solve for 100 hub view. Ordered by most recently updated first.
   */
  static async getEventICPs(eventId: string): Promise<Solve100ICPProfile[]> {
    const { data, error } = await this.supabase
      .from('solve100_icp_profiles')
      .select(
        `
          *,
          event_registrations!team_id (
            team_name,
            institutions!institution_id ( name )
          )
        `
      )
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[startup/solve100] getEventICPs failed:', error);
      throw error;
    }
    return (data ?? []) as Solve100ICPProfile[];
  }
}
