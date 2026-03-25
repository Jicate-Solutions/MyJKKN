import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  CaseStudy,
  CreateCaseStudyDto,
  UpdateCaseStudyDto,
  AdminUpdateCaseStudyDto,
} from '@/types/startup-studio'

export class CaseStudyService {
  // Get the current team's case study for this event
  static async getMyCaseStudy(
    eventId: string,
    registrationId: string
  ): Promise<CaseStudy | null> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', registrationId)
      .maybeSingle()
    if (error) throw error
    return data as CaseStudy | null
  }

  // Team member creates the case study (one per team per event)
  static async createCaseStudy(dto: CreateCaseStudyDto): Promise<CaseStudy> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('case_studies')
      .insert({
        event_id: dto.event_id,
        team_id: dto.team_id,
        track: dto.track,
        problem: dto.problem,
        solution: dto.solution,
        proof: dto.proof,
        who_else: dto.who_else ?? null,
        demo_url: dto.demo_url ?? null,
        app_name: dto.app_name ?? null,
        app_url: dto.app_url ?? null,
        score: dto.score ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as CaseStudy
  }

  // Team member updates content fields
  static async updateCaseStudy(
    caseStudyId: string,
    dto: UpdateCaseStudyDto
  ): Promise<CaseStudy> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('case_studies')
      .update({
        ...(dto.problem !== undefined && { problem: dto.problem }),
        ...(dto.solution !== undefined && { solution: dto.solution }),
        ...(dto.proof !== undefined && { proof: dto.proof }),
        ...(dto.who_else !== undefined && { who_else: dto.who_else }),
        ...(dto.demo_url !== undefined && { demo_url: dto.demo_url }),
      })
      .eq('id', caseStudyId)
      .select('*')
      .single()
    if (error) throw error
    return data as CaseStudy
  }

  // Admin updates featured flag or score
  static async adminUpdateCaseStudy(
    caseStudyId: string,
    dto: AdminUpdateCaseStudyDto
  ): Promise<CaseStudy> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('case_studies')
      .update({
        ...(dto.featured !== undefined && { featured: dto.featured }),
        ...(dto.score !== undefined && { score: dto.score }),
      })
      .eq('id', caseStudyId)
      .select('*')
      .single()
    if (error) throw error
    return data as CaseStudy
  }

  // Admin: get all case studies for an event, ordered by score descending
  static async getEventCaseStudies(eventId: string): Promise<CaseStudy[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .eq('event_id', eventId)
      .order('score', { ascending: false, nullsFirst: false })
    if (error) throw error
    return (data ?? []) as CaseStudy[]
  }
}
