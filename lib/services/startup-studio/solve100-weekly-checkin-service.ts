// lib/services/startup-studio/solve100-weekly-checkin-service.ts
// Service layer for Solve for 100 weekly check-ins.
// Spec: docs/SPEC-solve-for-100.md
// Added: 2026-04-14

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SOLVE100_WEEKS } from '@/lib/constants/startup-studio/solve100';
import type {
  Solve100WeeklyCheckin,
  CreateWeeklyCheckinDto,
  UpdateWeeklyCheckinDto,
  MentorReviewDto,
  Solve100DashboardStats,
  Solve100TeamRow,
} from '@/types/startup-studio';

/** ms in one week. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class Solve100WeeklyCheckinService {
  // Typed as any because solve100_* tables are not yet in generated database types.
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  /**
   * Get the current team's check-in for a specific week. Returns null when
   * the team hasn't submitted yet.
   */
  static async getMyCheckin(
    eventId: string,
    teamId: string,
    weekNumber: number
  ): Promise<Solve100WeeklyCheckin | null> {
    const { data, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .eq('week_number', weekNumber)
      .maybeSingle();

    if (error) {
      console.error('[startup/solve100] getMyCheckin failed:', error);
      throw error;
    }
    return data as Solve100WeeklyCheckin | null;
  }

  /**
   * Create a new weekly check-in. Use updateCheckin for edits — this enforces
   * the UNIQUE(event_id, team_id, week_number) constraint at the DB level.
   */
  static async submitCheckin(
    dto: CreateWeeklyCheckinDto,
    userId: string
  ): Promise<Solve100WeeklyCheckin> {
    const { data, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .insert({
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
        submitted_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[startup/solve100] submitCheckin failed:', error);
      throw error;
    }
    return data as Solve100WeeklyCheckin;
  }

  /**
   * Update an existing check-in. Only sends keys that were explicitly passed
   * so we never overwrite a value with undefined.
   */
  static async updateCheckin(
    id: string,
    dto: UpdateWeeklyCheckinDto
  ): Promise<Solve100WeeklyCheckin> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[startup/solve100] updateCheckin failed:', error);
      throw error;
    }
    return data as Solve100WeeklyCheckin;
  }

  /**
   * All check-ins for one team across the program (time-series). Ordered by
   * week_number ascending so the UI can render a chronological history.
   */
  static async getTeamHistory(
    eventId: string,
    teamId: string
  ): Promise<Solve100WeeklyCheckin[]> {
    const { data, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .order('week_number', { ascending: true });

    if (error) {
      console.error('[startup/solve100] getTeamHistory failed:', error);
      throw error;
    }
    return (data ?? []) as Solve100WeeklyCheckin[];
  }

  /**
   * All teams' check-ins for a single week. Joins event_registrations +
   * institution name, plus the latest progression level per team for the
   * level badge column.
   */
  static async getEventWeeklyOverview(
    eventId: string,
    weekNumber: number
  ): Promise<Solve100TeamRow[]> {
    // Fetch all check-ins for this week with team + institution info.
    const { data: checkins, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .select(
        `
          *,
          event_registrations!team_id (
            id,
            team_name,
            owner_id,
            institutions!institution_id ( name )
          )
        `
      )
      .eq('event_id', eventId)
      .eq('week_number', weekNumber);

    if (error) {
      console.error('[startup/solve100] getEventWeeklyOverview failed:', error);
      throw error;
    }

    const rows = (checkins ?? []) as Array<Record<string, any>>;
    if (rows.length === 0) return [];

    // Look up the highest progression level per (team, event) so we can show
    // the team's current ladder badge in the overview table.
    const teamIds = rows.map(r => r.team_id);
    const ownerIds = rows
      .map(r => r.event_registrations?.owner_id)
      .filter(Boolean);

    const { data: levels } = await this.supabase
      .from('progression_levels')
      .select('profile_id, team_id, level')
      .eq('event_id', eventId)
      .in('team_id', teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']);

    const maxLevelByTeam = new Map<string, number>();
    for (const lvl of (levels ?? []) as Array<{ team_id: string | null; profile_id: string; level: number }>) {
      if (!lvl.team_id) continue;
      const prev = maxLevelByTeam.get(lvl.team_id) ?? 0;
      if (lvl.level > prev) maxLevelByTeam.set(lvl.team_id, lvl.level);
    }
    // Avoid an unused-var warning when ownerIds is computed but not consumed.
    void ownerIds;

    return rows.map(r => ({
      team_id: r.team_id,
      team_name: r.event_registrations?.team_name ?? '',
      institution_name: r.event_registrations?.institutions?.name ?? '',
      current_week: r.week_number,
      verified_paid_users: r.verified_paid_users ?? 0,
      total_users: r.total_users ?? 0,
      active_users: r.active_users ?? 0,
      app_status: r.app_status ?? '',
      biggest_blocker: r.biggest_blocker ?? null,
      progression_level: maxLevelByTeam.get(r.team_id) ?? 1,
      last_checkin_at: r.submitted_at ?? r.updated_at ?? r.created_at,
    }));
  }

  /**
   * Aggregate metrics for the Solve for 100 hub page. Counts unique teams
   * with check-ins, sums paid users from each team's most recent check-in,
   * counts blockers, and bins teams by current progression level.
   */
  static async getEventDashboard(eventId: string): Promise<Solve100DashboardStats> {
    const [{ data: checkins, error: ckErr }, { data: levels, error: lvErr }, currentWeek] =
      await Promise.all([
        this.supabase
          .from('solve100_weekly_checkins')
          .select(
            'team_id, week_number, verified_paid_users, biggest_blocker, blocker_resolved, submitted_at'
          )
          .eq('event_id', eventId),
        this.supabase
          .from('progression_levels')
          .select('team_id, level')
          .eq('event_id', eventId),
        this.getCurrentWeekNumber(eventId),
      ]);

    if (ckErr) {
      console.error('[startup/solve100] getEventDashboard checkins failed:', ckErr);
      throw ckErr;
    }
    if (lvErr) {
      console.error('[startup/solve100] getEventDashboard levels failed:', lvErr);
      throw lvErr;
    }

    type CkRow = {
      team_id: string;
      week_number: number;
      verified_paid_users: number | null;
      biggest_blocker: string | null;
      blocker_resolved: boolean | null;
      submitted_at: string | null;
    };
    const ckRows = ((checkins ?? []) as CkRow[]) || [];

    // Pick each team's latest check-in (highest week_number).
    const latestByTeam = new Map<string, CkRow>();
    for (const row of ckRows) {
      const prev = latestByTeam.get(row.team_id);
      if (!prev || row.week_number > prev.week_number) {
        latestByTeam.set(row.team_id, row);
      }
    }

    let totalPaidUsers = 0;
    let teamsWithBlockers = 0;
    for (const row of latestByTeam.values()) {
      totalPaidUsers += row.verified_paid_users ?? 0;
      if (row.biggest_blocker && row.biggest_blocker.trim() && !row.blocker_resolved) {
        teamsWithBlockers += 1;
      }
    }

    // Bin teams by their highest achieved level (default L1).
    const maxLevelByTeam = new Map<string, number>();
    for (const lvl of (levels ?? []) as Array<{ team_id: string | null; level: number }>) {
      if (!lvl.team_id) continue;
      const prev = maxLevelByTeam.get(lvl.team_id) ?? 0;
      if (lvl.level > prev) maxLevelByTeam.set(lvl.team_id, lvl.level);
    }

    const teamsByLevel: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const teamId of latestByTeam.keys()) {
      const lvl = (maxLevelByTeam.get(teamId) ?? 1) as 1 | 2 | 3 | 4 | 5;
      const safeLvl = (lvl >= 1 && lvl <= 5 ? lvl : 1) as 1 | 2 | 3 | 4 | 5;
      teamsByLevel[safeLvl] += 1;
    }

    return {
      total_teams: latestByTeam.size,
      teams_by_level: teamsByLevel,
      total_paid_users: totalPaidUsers,
      teams_with_blockers: teamsWithBlockers,
      current_week: currentWeek,
    };
  }

  /**
   * Mentor marks a check-in as reviewed. mentorId is the staff member's
   * profile id (not the staff.id).
   */
  static async mentorReview(
    checkinId: string,
    dto: MentorReviewDto,
    mentorId: string
  ): Promise<Solve100WeeklyCheckin> {
    const { data, error } = await this.supabase
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
      .single();

    if (error) {
      console.error('[startup/solve100] mentorReview failed:', error);
      throw error;
    }
    return data as Solve100WeeklyCheckin;
  }

  /**
   * Check-ins still waiting on mentor review. If `mentorId` (a profile id) is
   * provided, results are filtered to teams assigned to that mentor.
   */
  static async getUnreviewedCheckins(
    eventId: string,
    mentorId?: string
  ): Promise<Solve100WeeklyCheckin[]> {
    const { data, error } = await this.supabase
      .from('solve100_weekly_checkins')
      .select('*')
      .eq('event_id', eventId)
      .eq('mentor_reviewed', false)
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('[startup/solve100] getUnreviewedCheckins failed:', error);
      throw error;
    }
    let rows = (data ?? []) as Solve100WeeklyCheckin[];

    // If a mentor is specified, narrow to the teams they're assigned to via
    // event_staff_assignments → event_team_venue_allocations. RLS already
    // enforces this for mentor users, but we redundantly filter here so that
    // an admin previewing a mentor's queue gets the right slice.
    if (mentorId && rows.length > 0) {
      const { data: staffRows } = await this.supabase
        .from('staff')
        .select('id')
        .eq('profile_id', mentorId);
      const staffIds = ((staffRows ?? []) as Array<{ id: string }>).map(s => s.id);
      if (staffIds.length === 0) return [];

      const { data: assignments } = await this.supabase
        .from('event_staff_assignments')
        .select('venue_assignment_id')
        .eq('event_id', eventId)
        .in('staff_id', staffIds)
        .in('role', ['mentor', 'lead_mentor']);
      const venueIds = ((assignments ?? []) as Array<{ venue_assignment_id: string }>).map(
        a => a.venue_assignment_id
      );
      if (venueIds.length === 0) return [];

      const { data: allocations } = await this.supabase
        .from('event_team_venue_allocations')
        .select('registration_id')
        .eq('event_id', eventId)
        .in('venue_assignment_id', venueIds);
      const teamIds = new Set(
        ((allocations ?? []) as Array<{ registration_id: string }>).map(a => a.registration_id)
      );

      rows = rows.filter(r => teamIds.has(r.team_id));
    }

    return rows;
  }

  /**
   * Derive the current week number (1..44) from the event's start_date.
   * Falls back to 1 when the event hasn't started or has no start_date.
   */
  static async getCurrentWeekNumber(eventId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .select('start_date')
      .eq('id', eventId)
      .maybeSingle();

    if (error) {
      console.error('[startup/solve100] getCurrentWeekNumber failed:', error);
      throw error;
    }
    const startDate = (data as { start_date: string | null } | null)?.start_date;
    if (!startDate) return 1;

    const start = new Date(startDate).getTime();
    const now = Date.now();
    if (Number.isNaN(start) || now < start) return 1;

    const week = Math.floor((now - start) / WEEK_MS) + 1;
    return Math.max(1, Math.min(week, SOLVE100_WEEKS));
  }
}
