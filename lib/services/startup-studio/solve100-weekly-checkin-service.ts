import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  Solve100WeeklyCheckin,
  SubmitWeeklyCheckinDto,
  MentorReviewDto,
  Solve100DashboardStats,
  Solve100TeamOverview,
  Solve100AppStatus,
} from '@/types/startup-studio'

export class Solve100WeeklyCheckinService {
  /** Get a single check-in for a team in a specific week */
  static async getMyCheckin(
    eventId: string,
    teamId: string,
    weekNumber: number
  ): Promise<Solve100WeeklyCheckin | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .eq('week_number', weekNumber)
      .maybeSingle()
    if (error) throw error
    return data as Solve100WeeklyCheckin | null
  }

  /** Create or update a weekly check-in (upsert on unique constraint) */
  static async submitCheckin(
    dto: SubmitWeeklyCheckinDto,
    profileId: string
  ): Promise<Solve100WeeklyCheckin> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .upsert(
        {
          event_id: dto.event_id,
          team_id: dto.team_id,
          week_number: dto.week_number,
          commitment: dto.commitment,
          commitment_result: dto.commitment_result ?? null,
          commitment_met: dto.commitment_met ?? null,
          verified_paid_users: dto.verified_paid_users ?? 0,
          total_users: dto.total_users ?? 0,
          active_users: dto.active_users ?? 0,
          target_customer_name: dto.target_customer_name ?? null,
          target_customer_location: dto.target_customer_location ?? null,
          problem_description: dto.problem_description ?? null,
          pricing: dto.pricing ?? null,
          acquisition_plan: dto.acquisition_plan ?? null,
          app_status: dto.app_status ?? null,
          app_url: dto.app_url ?? null,
          biggest_blocker: dto.biggest_blocker ?? null,
          blocker_resolved: dto.blocker_resolved ?? false,
          submitted_by: profileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,team_id,week_number' }
      )
      .select('*')
      .single()
    if (error) throw error
    return data as Solve100WeeklyCheckin
  }

  /** Get all check-ins for a team across all weeks (time series) */
  static async getTeamHistory(
    eventId: string,
    teamId: string
  ): Promise<Solve100WeeklyCheckin[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .order('week_number', { ascending: true })
    if (error) throw error
    return (data ?? []) as Solve100WeeklyCheckin[]
  }

  /** Get all check-ins for a specific week (all teams) */
  static async getEventWeeklyOverview(
    eventId: string,
    weekNumber: number
  ): Promise<Solve100WeeklyCheckin[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .select(`
        *,
        event_registrations!team_id (
          team_name,
          institution_id,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .eq('week_number', weekNumber)
      .order('verified_paid_users', { ascending: false })
    if (error) throw error

    return ((data ?? []) as any[]).map(row => ({
      ...row,
      team_name: row.event_registrations?.team_name ?? '',
      institution_name: row.event_registrations?.institutions?.name ?? '',
    })) as Solve100WeeklyCheckin[]
  }

  /** Aggregate dashboard metrics for the Solve for 100 hub */
  static async getEventDashboard(eventId: string): Promise<Solve100DashboardStats> {
    const supabase = createClientSupabaseClient()

    // Get all checkins for this event
    const { data: allCheckins, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .select('team_id, week_number, verified_paid_users, active_users, app_status, biggest_blocker')
      .eq('event_id', eventId)
    if (error) throw error

    const checkins = (allCheckins ?? []) as Array<{
      team_id: string
      week_number: number
      verified_paid_users: number
      active_users: number
      app_status: Solve100AppStatus | null
      biggest_blocker: string | null
    }>

    // Get latest checkin per team
    const latestByTeam = new Map<string, typeof checkins[0]>()
    for (const c of checkins) {
      const existing = latestByTeam.get(c.team_id)
      if (!existing || c.week_number > existing.week_number) {
        latestByTeam.set(c.team_id, c)
      }
    }

    const latestCheckins = Array.from(latestByTeam.values())
    const totalTeams = latestCheckins.length
    const totalPaidUsers = latestCheckins.reduce((s, c) => s + (c.verified_paid_users || 0), 0)

    // Current week (latest week_number in data)
    const currentWeek = checkins.length > 0
      ? Math.max(...checkins.map(c => c.week_number))
      : 1
    const checkinsThisWeek = checkins.filter(c => c.week_number === currentWeek).length

    const teamsByAppStatus: Record<string, number> = { live: 0, needs_fixes: 0, building: 0, pivoting: 0 }
    let teamsWithBlockers = 0
    for (const c of latestCheckins) {
      if (c.app_status) teamsByAppStatus[c.app_status] = (teamsByAppStatus[c.app_status] || 0) + 1
      if (c.biggest_blocker && c.biggest_blocker.trim()) teamsWithBlockers++
    }

    return {
      total_teams: totalTeams,
      average_paid_users: totalTeams > 0 ? Math.round(totalPaidUsers / totalTeams) : 0,
      teams_with_blockers: teamsWithBlockers,
      teams_by_app_status: teamsByAppStatus as Record<Solve100AppStatus, number>,
      teams_by_level: {}, // Populated from progression data separately
      checkins_this_week: checkinsThisWeek,
      total_checkins: checkins.length,
    }
  }

  /** Get team overview list for the hub page */
  static async getTeamOverviews(eventId: string): Promise<Solve100TeamOverview[]> {
    const supabase = createClientSupabaseClient()

    // Get all Solve for 100 teams (teams that declared this track)
    const { data: declarations, error: declError } = await (supabase as any)
      .from('track_declarations')
      .select(`
        team_id,
        event_registrations!team_id (
          id, team_name, institution_id,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .eq('track', 'solve_for_100')
    if (declError) throw declError

    if (!declarations || declarations.length === 0) return []

    const teamIds = (declarations as any[]).map(d => d.team_id)

    // Get all checkins for these teams
    const { data: allCheckins, error: checkinError } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .in('team_id', teamIds)
      .order('week_number', { ascending: false })
    if (checkinError) throw checkinError

    // Get ICP status
    const { data: icps, error: icpError } = await (supabase as any)
      .from('solve100_icp_profiles')
      .select('team_id')
      .eq('event_id', eventId)
      .in('team_id', teamIds)
    if (icpError) throw icpError

    const icpTeamIds = new Set(((icps ?? []) as any[]).map(i => i.team_id))
    const checkins = (allCheckins ?? []) as Solve100WeeklyCheckin[]

    return (declarations as any[]).map(decl => {
      const teamCheckins = checkins.filter(c => c.team_id === decl.team_id)
      const latest = teamCheckins[0] // already sorted desc

      return {
        team_id: decl.team_id,
        team_name: decl.event_registrations?.team_name ?? '',
        institution_name: decl.event_registrations?.institutions?.name ?? null,
        current_week: latest?.week_number ?? 0,
        verified_paid_users: latest?.verified_paid_users ?? 0,
        active_users: latest?.active_users ?? 0,
        app_status: latest?.app_status ?? null,
        biggest_blocker: latest?.biggest_blocker ?? null,
        last_checkin_at: latest?.submitted_at ?? null,
        has_icp: icpTeamIds.has(decl.team_id),
        weeks_submitted: teamCheckins.length,
      } as Solve100TeamOverview
    })
  }

  /** Mentor marks a check-in as reviewed */
  static async mentorReview(
    checkinId: string,
    dto: MentorReviewDto,
    mentorId: string
  ): Promise<Solve100WeeklyCheckin> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await (supabase as any)
      .from('solve100_weekly_checkins')
      .update({
        mentor_reviewed: true,
        mentor_notes: dto.mentor_notes,
        mentor_reviewed_by: mentorId,
        mentor_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', checkinId)
      .select('*')
      .single()
    if (error) throw error
    return data as Solve100WeeklyCheckin
  }

  /** Get unreviewed check-ins for mentor dashboard */
  static async getUnreviewedCheckins(
    eventId: string,
    _mentorId?: string
  ): Promise<Solve100WeeklyCheckin[]> {
    const supabase = createClientSupabaseClient()
    const query = (supabase as any)
      .from('solve100_weekly_checkins')
      .select(`
        *,
        event_registrations!team_id (
          team_name,
          institution_id,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .eq('mentor_reviewed', false)
      .order('week_number', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    return ((data ?? []) as any[]).map(row => ({
      ...row,
      team_name: row.event_registrations?.team_name ?? '',
      institution_name: row.event_registrations?.institutions?.name ?? '',
    })) as Solve100WeeklyCheckin[]
  }
}
