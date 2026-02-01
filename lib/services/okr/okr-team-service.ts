// ============================================================================
// OKR Team Service
// Handles team dashboard, summaries, and manager views
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  OKRTeamSummary,
  OKRTeamMember,
  OKRNeedsAttention,
  OKRDashboardStats,
  OKRTeamFilters,
  OKRObjective
} from '@/types/okr';

export class OKRTeamService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get team summary for a manager
   */
  static async getTeamSummary(
    filters: OKRTeamFilters
  ): Promise<OKRTeamSummary> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const managerId = filters.manager_id || user.id;

      // Get team members from v_team_okr_summary view
      const { data: teamData, error } = await (this.supabase as any)
        .from('v_team_okr_summary')
        .select('*')
        .eq('manager_id', managerId);

      // View may return empty if user has no okr_user_status record - this is OK
      if (error && error.code !== 'PGRST116') {
        // Only throw if it's not a "no rows" error
        console.warn('[OKR] Team summary query issue:', error.message || error);
      }

      // Aggregate data
      const summary: OKRTeamSummary = {
        manager_id: managerId,
        total_objectives: 0,
        on_track: 0,
        at_risk: 0,
        behind: 0,
        blocked_users: 0,
        overdue_checkins: 0,
        team_members: []
      };

      if (teamData && teamData.length > 0) {
        const aggregated = teamData[0];
        summary.total_objectives = aggregated.total_objectives || 0;
        summary.on_track = aggregated.on_track_count || 0;
        summary.at_risk = aggregated.at_risk_count || 0;
        summary.behind = aggregated.behind_count || 0;
        summary.blocked_users = aggregated.blocked_count || 0;
        summary.overdue_checkins = aggregated.overdue_checkins || 0;
      }

      // Get individual team member details using profiles table
      const { data: memberStatuses } = await (this.supabase as any)
        .from('okr_user_status')
        .select(`
          *,
          profile:profiles!user_id(id, email, full_name, avatar_url)
        `);

      if (memberStatuses) {
        summary.team_members = memberStatuses.map((status: any) => ({
          user_id: status.user_id,
          user: {
            id: status.profile?.id || status.user_id,
            email: status.profile?.email,
            full_name: status.profile?.full_name
          },
          objectives_count: status.total_objectives || 0,
          average_progress:
            status.total_objectives > 0
              ? Math.round(
                  ((status.on_track_count || 0) / status.total_objectives) * 100
                )
              : 0,
          last_check_in_date: status.last_check_in_date,
          badge: status.current_badge,
          is_blocked: status.current_badge === 'blocked'
        }));
      }

      return summary;
    } catch (error: any) {
      console.error('[OKR] Error fetching team summary:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get items needing attention
   */
  static async getNeedsAttention(
    filters: OKRTeamFilters
  ): Promise<OKRNeedsAttention[]> {
    try {
      const items: OKRNeedsAttention[] = [];

      // Get overdue check-ins
      const { data: overdueCheckIns } = await (this.supabase as any)
        .from('okr_check_ins')
        .select(`
          *,
          profile:profiles!user_id(id, email, full_name)
        `)
        .eq('is_completed', false)
        .eq('is_overdue', true)
        .limit(10);

      overdueCheckIns?.forEach((checkIn: any) => {
        items.push({
          type: 'overdue_checkin',
          user: {
            id: checkIn.profile?.id || checkIn.user_id,
            email: checkIn.profile?.email,
            full_name: checkIn.profile?.full_name
          },
          message: `Check-in overdue by ${checkIn.days_overdue} days`,
          days_overdue: checkIn.days_overdue
        });
      });

      // Get at-risk OKRs
      const { data: atRiskKRs } = await (this.supabase as any)
        .from('okr_key_results')
        .select(`
          *,
          objective:okr_objectives(
            id, title, owner_id,
            owner:profiles!owner_id(id, email, full_name)
          )
        `)
        .in('status', ['at_risk', 'behind'])
        .limit(10);

      atRiskKRs?.forEach((kr: any) => {
        items.push({
          type: 'at_risk_okr',
          user: {
            id: kr.objective?.owner?.id || kr.objective?.owner_id,
            email: kr.objective?.owner?.email,
            full_name: kr.objective?.owner?.full_name
          },
          objective: kr.objective,
          key_result: kr,
          message: `"${kr.title}" is ${kr.status.replace('_', ' ')}`,
          progress: kr.progress
        });
      });

      // Get blocked dependencies
      const { data: blockedDeps } = await (this.supabase as any)
        .from('okr_dependencies')
        .select(`
          *,
          objective:okr_objectives(id, title, owner_id)
        `)
        .eq('status', 'blocked')
        .limit(10);

      blockedDeps?.forEach((dep: any) => {
        items.push({
          type: 'blocked_dependency',
          user: {
            id: dep.objective?.owner_id,
            email: null,
            full_name: null
          },
          objective: dep.objective,
          dependency: dep,
          message: `Dependency "${dep.description}" is blocked`
        });
      });

      // Get missed deadlines
      const { data: missedDeadlines } = await (this.supabase as any)
        .from('okr_key_results')
        .select(`
          *,
          objective:okr_objectives(
            id, title, owner_id,
            owner:profiles!owner_id(id, email, full_name)
          )
        `)
        .lt('deadline', new Date().toISOString())
        .neq('status', 'completed')
        .limit(10);

      missedDeadlines?.forEach((kr: any) => {
        const deadline = new Date(kr.deadline);
        const daysOverdue = Math.floor(
          (Date.now() - deadline.getTime()) / (1000 * 60 * 60 * 24)
        );
        items.push({
          type: 'missed_deadline',
          user: {
            id: kr.objective?.owner?.id || kr.objective?.owner_id,
            email: kr.objective?.owner?.email,
            full_name: kr.objective?.owner?.full_name
          },
          key_result: kr,
          message: `"${kr.title}" deadline passed ${daysOverdue} days ago`,
          days_overdue: daysOverdue
        });
      });

      // Sort by severity (overdue check-ins first, then at-risk, etc.)
      const priorityOrder = {
        overdue_checkin: 1,
        blocked_dependency: 2,
        missed_deadline: 3,
        at_risk_okr: 4
      };

      return items.sort(
        (a, b) => priorityOrder[a.type] - priorityOrder[b.type]
      );
    } catch (error: any) {
      console.error('[OKR] Error fetching needs attention:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(
    institutionId?: string
  ): Promise<OKRDashboardStats> {
    try {
      // Get objective counts
      let objectiveQuery = (this.supabase as any)
        .from('okr_objectives')
        .select('id, status', { count: 'exact' });

      if (institutionId) {
        objectiveQuery = objectiveQuery.eq('institution_id', institutionId);
      }

      const { data: objectives, count: totalObjectives } = await objectiveQuery;

      const activeObjectives =
        objectives?.filter((o: OKRObjective) => o.status === 'active').length ||
        0;
      const completedObjectives =
        objectives?.filter((o: OKRObjective) => o.status === 'completed')
          .length || 0;

      // Get KR status counts
      const { data: keyResults } = await (this.supabase as any)
        .from('okr_key_results')
        .select('status, data_source');

      let onTrack = 0,
        atRisk = 0,
        behind = 0,
        blocked = 0;
      let autoTracked = 0,
        manual = 0;

      keyResults?.forEach((kr: any) => {
        switch (kr.status) {
          case 'on_track':
            onTrack++;
            break;
          case 'at_risk':
            atRisk++;
            break;
          case 'behind':
            behind++;
            break;
          case 'blocked':
            blocked++;
            break;
        }
        if (kr.data_source === 'auto') {
          autoTracked++;
        } else {
          manual++;
        }
      });

      // Calculate average progress
      const { data: progressData } = await (this.supabase as any)
        .from('okr_objectives')
        .select('overall_progress')
        .eq('status', 'active');

      const avgProgress =
        progressData && progressData.length > 0
          ? Math.round(
              progressData.reduce(
                (sum: number, o: any) => sum + (o.overall_progress || 0),
                0
              ) / progressData.length
            )
          : 0;

      // Get check-in completion rate (last 4 weeks)
      const { data: checkIns } = await (this.supabase as any)
        .from('okr_check_ins')
        .select('is_completed')
        .gte(
          'created_at',
          new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
        );

      const completionRate =
        checkIns && checkIns.length > 0
          ? Math.round(
              (checkIns.filter((c: any) => c.is_completed).length /
                checkIns.length) *
                100
            )
          : 0;

      return {
        total_objectives: totalObjectives || 0,
        active_objectives: activeObjectives,
        completed_objectives: completedObjectives,
        on_track_count: onTrack,
        at_risk_count: atRisk,
        behind_count: behind,
        blocked_count: blocked,
        avg_progress: avgProgress,
        check_in_completion_rate: completionRate,
        auto_tracked_krs: autoTracked,
        manual_krs: manual
      };
    } catch (error: any) {
      console.error('[OKR] Error fetching dashboard stats:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get objectives for a specific team member
   */
  static async getTeamMemberObjectives(userId: string): Promise<OKRObjective[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_objectives')
        .select(`
          *,
          key_results:okr_key_results(*)
        `)
        .eq('owner_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching team member objectives:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get department OKR summary
   * If departmentId is empty/undefined, returns summary for ALL departments (super_admin view)
   */
  static async getDepartmentSummary(departmentId?: string): Promise<{
    total_objectives: number;
    avg_progress: number;
    on_track: number;
    at_risk: number;
    behind: number;
  }> {
    try {
      let query = (this.supabase as any)
        .from('okr_objectives')
        .select('overall_progress, key_results:okr_key_results(status)')
        .eq('status', 'active');

      // Only filter by department if a specific one is provided
      if (departmentId && departmentId.trim() !== '') {
        query = query.eq('department_id', departmentId);
      }

      const { data, error } = await query;

      if (error) throw error;

      let onTrack = 0,
        atRisk = 0,
        behind = 0;

      data?.forEach((obj: any) => {
        obj.key_results?.forEach((kr: any) => {
          switch (kr.status) {
            case 'on_track':
            case 'completed':
              onTrack++;
              break;
            case 'at_risk':
              atRisk++;
              break;
            case 'behind':
            case 'blocked':
              behind++;
              break;
          }
        });
      });

      const avgProgress =
        data && data.length > 0
          ? Math.round(
              data.reduce(
                (sum: number, o: any) => sum + (o.overall_progress || 0),
                0
              ) / data.length
            )
          : 0;

      return {
        total_objectives: data?.length || 0,
        avg_progress: avgProgress,
        on_track: onTrack,
        at_risk: atRisk,
        behind: behind
      };
    } catch (error: any) {
      console.error('[OKR] Error fetching department summary:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }
}
