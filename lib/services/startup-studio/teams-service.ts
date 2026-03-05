// lib/services/startup-studio/teams-service.ts
// CRUD operations for ss_teams, ss_cohorts, ss_business_visits, ss_venture_stage_history

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
// Note: types will be added by another agent, use inline types for now

const TEAM_SELECT = `
  *,
  anchor:profiles!ss_teams_anchor_id_fkey(id, full_name),
  cohort:ss_cohorts(id, name),
  institution:institutions(id, name)
`;

const TEAM_WITH_DETAILS_SELECT = `
  *,
  anchor:profiles!ss_teams_anchor_id_fkey(id, full_name),
  cohort:ss_cohorts(id, name),
  institution:institutions(id, name),
  members:ss_team_members(*, user:profiles(id, full_name)),
  stage_history:ss_venture_stage_history(*, changer:profiles(id, full_name))
`;

export class TeamsService extends BaseService {
  // --- TEAMS ---

  static async getTeams(filters?: any): Promise<BaseListResponse<any>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);
    let query = this.supabase
      .from('ss_teams')
      .select(TEAM_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.cohort_id) query = query.eq('cohort_id', filters.cohort_id);
    if (filters?.event_id) query = query.eq('event_id', filters.event_id);
    if (filters?.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters?.venture_stage) query = query.eq('venture_stage', filters.venture_stage);
    if (filters?.preliminary_track) query = query.eq('preliminary_track', filters.preliminary_track);
    if (filters?.is_lighthouse !== undefined) query = query.eq('is_lighthouse', filters.is_lighthouse);
    if (filters?.anchor_id) query = query.eq('anchor_id', filters.anchor_id);
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('name', `%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch teams: ${error.message}`);
    const total = count || 0;
    return {
      data: (data || []) as any[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async getTeamById(id: string): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('ss_teams')
      .select(TEAM_WITH_DETAILS_SELECT)
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch team: ${error.message}`);
    }
    return data;
  }

  static async createTeam(input: any): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_teams')
      .insert({
        name: input.name,
        anchor_id: input.anchor_id,
        event_id: input.event_id || null,
        cohort_id: input.cohort_id || null,
        institution_id: input.institution_id || null,
        preliminary_track: input.preliminary_track || null,
        venture_stage: 'forming',
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create team: ${error.message}`);
    return data;
  }

  static async updateTeam(id: string, input: any): Promise<any> {
    const updateData: any = { ...input };
    if (input.venture_stage) {
      updateData.venture_stage_updated_at = new Date().toISOString();
    }
    if (input.assigned_business_name && !input.business_assigned_at) {
      updateData.business_assigned_at = new Date().toISOString();
    }
    if (input.mentor_id && !input.mentor_assigned_at) {
      updateData.mentor_assigned_at = new Date().toISOString();
    }
    if (input.agreement_signed === true && !input.agreement_signed_at) {
      updateData.agreement_signed_at = new Date().toISOString();
    }
    const { data, error } = await this.supabase
      .from('ss_teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update team: ${error.message}`);
    return data;
  }

  static async deleteTeam(id: string): Promise<void> {
    const { error } = await this.supabase.from('ss_teams').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete team: ${error.message}`);
  }

  // --- MEMBERS ---

  static async getTeamMembers(teamId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('ss_team_members')
      .select('*, user:profiles(id, full_name)')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch team members: ${error.message}`);
    return data || [];
  }

  static async addTeamMember(teamId: string, userId: string, role: string = 'member', department?: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_team_members')
      .insert({ team_id: teamId, user_id: userId, role, department, is_anchor: false })
      .select()
      .single();
    if (error) throw new Error(`Failed to add team member: ${error.message}`);
    // Update member count
    await this.supabase.rpc('ss_update_team_member_count', { p_team_id: teamId }).catch(async () => {
      // If RPC doesn't exist, manually count and update
      const { count } = await this.supabase
        .from('ss_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);
      await this.supabase.from('ss_teams').update({ member_count: count || 0 }).eq('id', teamId);
    });
    return data;
  }

  static async removeTeamMember(teamId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to remove team member: ${error.message}`);
    // Update member count after removal
    await this.supabase.rpc('ss_update_team_member_count', { p_team_id: teamId }).catch(async () => {
      const { count } = await this.supabase
        .from('ss_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);
      await this.supabase.from('ss_teams').update({ member_count: count || 0 }).eq('id', teamId);
    });
  }

  // --- VENTURE STAGE ---

  static async advanceVentureStage(teamId: string, input: any): Promise<any> {
    // Get current stage
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');

    // Prevent same-stage transition
    if (input.to_stage === team.venture_stage) {
      throw new Error(`Team is already in stage '${input.to_stage}'`);
    }

    // Record history
    const { error: historyError } = await this.supabase
      .from('ss_venture_stage_history')
      .insert({
        team_id: teamId,
        from_stage: team.venture_stage,
        to_stage: input.to_stage,
        evidence_text: input.evidence_text || null,
        evidence_url: input.evidence_url || null,
        changed_by: input.changed_by || null,
      });
    if (historyError) throw new Error(`Failed to record stage history: ${historyError.message}`);

    // Update team
    return this.updateTeam(teamId, { venture_stage: input.to_stage });
  }

  static async getVentureStageHistory(teamId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('ss_venture_stage_history')
      .select('*, changer:profiles(id, full_name)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch stage history: ${error.message}`);
    return data || [];
  }

  // --- BUSINESS VISITS ---

  static async getBusinessVisits(teamId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('ss_business_visits')
      .select('*, visitor:profiles(id, full_name)')
      .eq('team_id', teamId)
      .order('visit_date', { ascending: false });
    if (error) throw new Error(`Failed to fetch business visits: ${error.message}`);
    return data || [];
  }

  static async createBusinessVisit(input: any): Promise<any> {
    const safeInput = {
      team_id: input.team_id,
      visited_by: input.visited_by,
      visit_date: input.visit_date,
      contact_person: input.contact_person,
      key_findings: input.key_findings,
      pain_points_discovered: input.pain_points_discovered,
      would_pay: input.would_pay,
      willing_to_pay_amount: input.willing_to_pay_amount,
      notes: input.notes,
      photos: input.photos,
    };
    const { data, error } = await this.supabase
      .from('ss_business_visits')
      .insert(safeInput)
      .select()
      .single();
    if (error) throw new Error(`Failed to create business visit: ${error.message}`);
    return data;
  }

  // --- COHORTS ---

  static async getCohorts(filters?: any): Promise<BaseListResponse<any>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);
    let query = this.supabase
      .from('ss_cohorts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch cohorts: ${error.message}`);
    const total = count || 0;
    return {
      data: (data || []) as any[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async createCohort(input: any): Promise<any> {
    const safeInput = {
      name: input.name,
      description: input.description,
      target_teams: input.target_teams,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const { data, error } = await this.supabase
      .from('ss_cohorts')
      .insert(safeInput)
      .select()
      .single();
    if (error) throw new Error(`Failed to create cohort: ${error.message}`);
    return data;
  }

  static async updateCohort(id: string, input: any): Promise<any> {
    const { data, error } = await this.supabase
      .from('ss_cohorts')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update cohort: ${error.message}`);
    return data;
  }

  // --- EVENT REGISTRATION ---

  static async registerTeamForEvent(eventId: string, input: any): Promise<any> {
    // 1. Create team
    const { data: team, error: teamError } = await this.supabase
      .from('ss_teams')
      .insert({
        name: input.name,
        anchor_id: input.members.find((m: any) => m.is_anchor)?.user_id || input.members[0]?.user_id,
        event_id: eventId,
        institution_id: input.institution_id || null,
        preliminary_track: input.preliminary_track || null,
        problem_idea: input.problem_idea || null,
        registration_status: 'registered',
        registered_at: new Date().toISOString(),
        venture_stage: 'forming',
        member_count: input.members.length,
      })
      .select()
      .single();
    if (teamError) throw new Error(`Failed to create team: ${teamError.message}`);

    // 2. Create team members
    const members = input.members.map((m: any) => ({
      team_id: team.id,
      user_id: m.user_id,
      role: m.role || 'member',
      department: m.department || null,
      is_anchor: m.is_anchor || false,
      has_laptop: m.has_laptop || false,
    }));

    const { error: membersError } = await this.supabase
      .from('ss_team_members')
      .insert(members);
    if (membersError) {
      // Rollback team creation
      await this.supabase.from('ss_teams').delete().eq('id', team.id);
      throw new Error(`Failed to create team members: ${membersError.message}`);
    }

    // 3. Count disciplines
    const uniqueDepts = new Set(members.map((m: any) => m.department).filter(Boolean));
    if (uniqueDepts.size > 0) {
      await this.supabase
        .from('ss_teams')
        .update({ discipline_count: uniqueDepts.size })
        .eq('id', team.id);
    }

    return team;
  }

  static async getEventRegistrations(eventId: string, filters?: any): Promise<any> {
    let query = this.supabase
      .from('ss_teams')
      .select(`
        *,
        anchor:profiles!ss_teams_anchor_id_fkey(id, full_name),
        institution:institutions(id, name),
        members:ss_team_members(*, user:profiles(id, full_name))
      `, { count: 'exact' })
      .eq('event_id', eventId)
      .neq('registration_status', 'draft')
      .order('registered_at', { ascending: false });

    if (filters?.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters?.registration_status) query = query.eq('registration_status', filters.registration_status);
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('name', `%${escaped}%`);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch registrations: ${error.message}`);

    // Calculate stats
    const teams = data || [];
    const allMembers = teams.flatMap((t: any) => t.members || []);
    const stats = {
      total_teams: teams.length,
      total_members: allMembers.length,
      laptops_confirmed: allMembers.filter((m: any) => m.has_laptop).length,
      by_institution: Object.values(
        teams.reduce((acc: any, t: any) => {
          const instName = t.institution?.name || 'Unknown';
          if (!acc[instName]) acc[instName] = { institution_name: instName, team_count: 0, member_count: 0, laptop_count: 0 };
          acc[instName].team_count++;
          acc[instName].member_count += (t.members || []).length;
          acc[instName].laptop_count += (t.members || []).filter((m: any) => m.has_laptop).length;
          return acc;
        }, {})
      ),
    };

    return { data: teams, stats, metadata: { total: count || 0 } };
  }

  // Bulk update registration status
  static async updateRegistrationStatus(teamIds: string[], status: string): Promise<void> {
    const updateData: any = { registration_status: status };
    if (status === 'checked_in') updateData.checked_in_at = new Date().toISOString();
    const { error } = await this.supabase
      .from('ss_teams')
      .update(updateData)
      .in('id', teamIds);
    if (error) throw new Error(`Failed to update registration status: ${error.message}`);
  }

  // --- DASHBOARD VIEWS ---

  static async getTeamDashboard(filters?: any): Promise<any[]> {
    let query = this.supabase.from('ss_team_dashboard').select('*');
    if (filters?.venture_stage) query = query.eq('venture_stage', filters.venture_stage);
    if (filters?.institution_id) query = query.eq('id', filters.institution_id); // institution_id filters view
    if (filters?.institution_name) query = query.ilike('institution_name', `%${filters.institution_name}%`);
    if (filters?.cohort_id) query = query.eq('cohort_name', filters.cohort_id); // cohort filtering by ID not supported in view, fall back
    if (filters?.cohort_name) query = query.eq('cohort_name', filters.cohort_name);
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('team_name', `%${escaped}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch team dashboard: ${error.message}`);
    return data || [];
  }

  static async getVentureFunnel(): Promise<any[]> {
    const { data, error } = await this.supabase.from('ss_team_venture_funnel').select('*');
    if (error) throw new Error(`Failed to fetch venture funnel: ${error.message}`);
    return data || [];
  }
}

export const teamsService = {
  getTeams: TeamsService.getTeams.bind(TeamsService),
  getTeamById: TeamsService.getTeamById.bind(TeamsService),
  createTeam: TeamsService.createTeam.bind(TeamsService),
  updateTeam: TeamsService.updateTeam.bind(TeamsService),
  deleteTeam: TeamsService.deleteTeam.bind(TeamsService),
  getTeamMembers: TeamsService.getTeamMembers.bind(TeamsService),
  addTeamMember: TeamsService.addTeamMember.bind(TeamsService),
  removeTeamMember: TeamsService.removeTeamMember.bind(TeamsService),
  advanceVentureStage: TeamsService.advanceVentureStage.bind(TeamsService),
  getVentureStageHistory: TeamsService.getVentureStageHistory.bind(TeamsService),
  getBusinessVisits: TeamsService.getBusinessVisits.bind(TeamsService),
  createBusinessVisit: TeamsService.createBusinessVisit.bind(TeamsService),
  getCohorts: TeamsService.getCohorts.bind(TeamsService),
  createCohort: TeamsService.createCohort.bind(TeamsService),
  updateCohort: TeamsService.updateCohort.bind(TeamsService),
  getTeamDashboard: TeamsService.getTeamDashboard.bind(TeamsService),
  getVentureFunnel: TeamsService.getVentureFunnel.bind(TeamsService),
  registerTeamForEvent: TeamsService.registerTeamForEvent.bind(TeamsService),
  getEventRegistrations: TeamsService.getEventRegistrations.bind(TeamsService),
  updateRegistrationStatus: TeamsService.updateRegistrationStatus.bind(TeamsService),
};
