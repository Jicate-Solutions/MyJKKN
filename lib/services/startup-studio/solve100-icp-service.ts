import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  Solve100ICPProfile,
  CreateICPDto,
  UpdateICPDto,
} from '@/types/startup-studio'

export class Solve100ICPService {
  /** Get a team's current ICP profile */
  static async getMyICP(
    eventId: string,
    teamId: string
  ): Promise<Solve100ICPProfile | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_icp_profiles')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .maybeSingle()
    if (error) throw error
    return data as Solve100ICPProfile | null
  }

  /** Create a new ICP profile */
  static async createICP(
    dto: CreateICPDto,
    profileId: string
  ): Promise<Solve100ICPProfile> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
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
        submitted_by: profileId,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as Solve100ICPProfile
  }

  /** Update an existing ICP (increments version) */
  static async updateICP(
    id: string,
    dto: UpdateICPDto
  ): Promise<Solve100ICPProfile> {
    const supabase = createClientSupabaseClient()

    // Get current version first
    const { data: current, error: fetchError } = await (supabase as any)
      .from('solve100_icp_profiles')
      .select('version')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: (current.version || 1) + 1,
    }

    // Only include fields that are explicitly provided
    const fields: (keyof UpdateICPDto)[] = [
      'customer_name', 'customer_age_gender', 'customer_role', 'customer_location',
      'customer_income', 'customer_phone_type', 'problem_in_their_words',
      'problem_frequency', 'problem_cost', 'current_solution', 'current_spend',
      'elevator_pitch', 'proposed_price', 'value_justification', 'top_objection',
      'objection_response', 'market_size_50km', 'where_they_gather',
      'plan_to_reach_10', 'has_talked_to_customer', 'talk_date',
    ]

    for (const field of fields) {
      if (field in dto) {
        updatePayload[field] = dto[field] ?? null
      }
    }

    const { data, error } = await (supabase as any)
      .from('solve100_icp_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Solve100ICPProfile
  }

  /** Admin view: all ICPs for an event */
  static async getEventICPs(eventId: string): Promise<Solve100ICPProfile[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_icp_profiles')
      .select(`
        *,
        event_registrations!team_id (
          team_name,
          institution_id,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
    if (error) throw error

    return ((data ?? []) as any[]).map(row => ({
      ...row,
      team_name: row.event_registrations?.team_name ?? '',
      institution_name: row.event_registrations?.institutions?.name ?? '',
    })) as Solve100ICPProfile[]
  }
}
