import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  TrackDeclaration,
  TrackDeclarationWithTeam,
  DeclareTrackDto,
  UpdateTrackDeclarationDto,
  MentorApproveTrackDto,
  TrackDeclarationSummary,
} from '@/types/startup-studio'

export class TrackDeclarationService {
  // Get the current user's team declaration for this event
  static async getMyDeclaration(
    eventId: string,
    registrationId: string
  ): Promise<TrackDeclaration | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', registrationId)
      .maybeSingle()
    if (error) throw error
    return data as TrackDeclaration | null
  }

  // Team leader declares a track (INSERT)
  static async declareTrack(dto: DeclareTrackDto, profileId: string): Promise<TrackDeclaration> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .insert({
        event_id: dto.event_id,
        team_id: dto.team_id,
        track: dto.track,
        reason: dto.reason ?? null,
        declared_by: profileId,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as TrackDeclaration
  }

  // Team leader updates their declaration (7-day window enforced here, not in RLS)
  static async updateDeclaration(
    declarationId: string,
    dto: UpdateTrackDeclarationDto
  ): Promise<TrackDeclaration> {
    // Fetch current declaration to enforce 7-day window in service layer
    const supabase = createClientSupabaseClient()
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('track_declarations')
      .select('declared_at')
      .eq('id', declarationId)
      .single()
    if (fetchError) throw fetchError

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    if (new Date(existing.declared_at) < sevenDaysAgo) {
      throw new Error('Track declaration can only be changed within 7 days of initial declaration.')
    }

    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .update({
        track: dto.track,
        reason: dto.reason ?? null,
      })
      .eq('id', declarationId)
      .select('*')
      .single()
    if (error) throw error
    return data as TrackDeclaration
  }

  // Mentor approves or rejects a declaration
  static async mentorApprove(
    declarationId: string,
    dto: MentorApproveTrackDto,
    mentorProfileId: string
  ): Promise<TrackDeclaration> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .update({
        mentor_approved: dto.mentor_approved,
        mentor_notes: dto.mentor_notes ?? null,
        approved_at: dto.mentor_approved ? new Date().toISOString() : null,
        approved_by: mentorProfileId,
      })
      .eq('id', declarationId)
      .select('*')
      .single()
    if (error) throw error
    return data as TrackDeclaration
  }

  // Admin: all declarations for an event with team + institution info
  static async getEventDeclarations(eventId: string): Promise<TrackDeclarationWithTeam[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .select(`
        *,
        event_registrations!team_id (
          team_name,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .order('declared_at', { ascending: false })
    if (error) throw error

    return (data ?? []).map(row => ({
      ...row,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      team_name: (row as any).event_registrations?.team_name ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      institution_name: (row as any).event_registrations?.institutions?.name ?? '',
    }))
  }

  // Admin: summary count per track for the dashboard
  static async getDeclarationSummary(eventId: string): Promise<TrackDeclarationSummary[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('track_declarations')
      .select('track')
      .eq('event_id', eventId)
    if (error) throw error

    const counts = ((data ?? []) as Array<{ track: string }>).reduce<Record<string, number>>((acc, row) => {
      acc[row.track] = (acc[row.track] ?? 0) + 1
      return acc
    }, {})
    const total = Object.values(counts).reduce((s, c) => s + c, 0)

    return Object.entries(counts).map(([track, count]) => ({
      track: track as TrackDeclarationSummary['track'],
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
  }
}
