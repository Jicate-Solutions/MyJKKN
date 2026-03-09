import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { ProgressionLevel, ProgressionLevelNumber } from '@/types/startup-studio'

export class ProgressionService {
  // Get all progression levels for the current user across all events
  static async getMyProgressionLevels(profileId: string): Promise<ProgressionLevel[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('profile_id', profileId)
      .order('achieved_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as ProgressionLevel[]
  }

  // Get the highest level achieved by a user in a specific event
  static async getMyHighestLevelForEvent(
    profileId: string,
    eventId: string
  ): Promise<ProgressionLevel | null> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('profile_id', profileId)
      .eq('event_id', eventId)
      .order('level', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data as ProgressionLevel | null
  }

  // Admin: all progression levels for an event (for distribution analytics)
  static async getEventProgressionLevels(eventId: string): Promise<ProgressionLevel[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('event_id', eventId)
      .order('level', { ascending: false })
    if (error) throw error
    return (data ?? []) as ProgressionLevel[]
  }

  // Admin: manually award a specific level to a learner
  static async awardLevel(params: {
    profileId: string
    eventId: string
    teamId: string
    level: ProgressionLevelNumber
    levelName: string
    evidence: Record<string, unknown>
    awardedBy: string
  }): Promise<ProgressionLevel> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('progression_levels')
      .upsert(
        {
          profile_id: params.profileId,
          event_id: params.eventId,
          team_id: params.teamId,
          level: params.level,
          level_name: params.levelName,
          achieved_at: new Date().toISOString(),
          evidence: params.evidence,
          awarded_by: params.awardedBy,
        },
        { onConflict: 'profile_id,event_id,level' }
      )
      .select('*')
      .single()
    if (error) throw error
    return data as ProgressionLevel
  }

  // Admin/super_admin: bulk auto-assign Level 1 (App Builder) after Demo Day.
  // Fetches all verified teams (presented=true, app_live=true, verification_status='verified')
  // and upserts Level 1 for every accepted team member.
  // Safe to run multiple times — uses ON CONFLICT DO NOTHING via upsert.
  static async autoAssignLevel1ForEvent(eventId: string): Promise<{ assigned: number }> {
    const supabase = createClientSupabaseClient() as any

    // Fetch verified verifications with team member profile IDs
    const { data: verifications, error } = await supabase
      .from('appathon_verifications')
      .select(`
        id,
        app_live,
        presented,
        event_submissions!submission_id (
          event_id,
          registration_id,
          event_registrations!registration_id (
            id,
            event_team_members!registration_id (
              profile_id,
              status
            )
          )
        )
      `)
      .eq('event_submissions.event_id', eventId)
      .eq('presented', true)
      .eq('app_live', true)
      .eq('verification_status', 'verified')

    if (error) throw error
    if (!verifications?.length) return { assigned: 0 }

    let assigned = 0

    for (const v of verifications) {
      const submission = v.event_submissions
      if (!submission) continue
      const registration = submission.event_registrations
      if (!registration) continue

      const members: Array<{ profile_id: string; status: string }> =
        registration.event_team_members ?? []

      const acceptedMembers = members.filter(m => m.status === 'accepted')

      for (const member of acceptedMembers) {
        const { error: upsertError } = await supabase
          .from('progression_levels')
          .upsert(
            {
              profile_id: member.profile_id,
              event_id: eventId,
              team_id: registration.id,
              level: 1,
              level_name: 'App Builder',
              achieved_at: new Date().toISOString(),
              evidence: {
                verification_id: v.id,
                app_live: v.app_live,
                presented: v.presented,
              },
              awarded_by: 'system',
            },
            { onConflict: 'profile_id,event_id,level' }
          )

        if (!upsertError) assigned++
      }
    }

    return { assigned }
  }
}
