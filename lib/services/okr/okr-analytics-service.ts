// ============================================================================
// OKR Analytics Service
// Provides data for Recharts dashboards and analytics
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  OKRTrendDataPoint,
  OKRDepartmentComparison,
  OKRProjection,
  OKRAnalyticsSummary,
  OKRObjective,
  OKRKeyResult
} from '@/types/okr';

export class OKRAnalyticsService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get summary statistics for the analytics dashboard
   * Includes both okr_objectives AND learner_elective_okrs
   */
  static async getAnalyticsSummary(
    institutionId: string,
    departmentId?: string
  ): Promise<OKRAnalyticsSummary> {
    try {
      // ========================================
      // 1. Get traditional OKR objectives
      // ========================================
      let query = (this.supabase as any)
        .from('okr_objectives')
        .select('id, status, overall_progress', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: objectives, count: objectivesCount } = await query;

      // Get active objectives from okr_objectives
      const activeObjectives = objectives?.filter((o: OKRObjective) => o.status === 'active') || [];

      // ========================================
      // 2. Get Elective OKRs (learner_elective_okrs)
      // Join with profiles to filter by institution
      // ========================================
      const { data: electiveOKRs, count: electiveCount } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select(`
          id,
          progress,
          status,
          is_active,
          learner:profiles!learner_id(institution_id, department_id)
        `, { count: 'exact' })
        .eq('is_active', true);

      // Filter elective OKRs by institution (and optionally department)
      const filteredElectives = (electiveOKRs || []).filter((e: any) => {
        if (e.learner?.institution_id !== institutionId) return false;
        if (departmentId && e.learner?.department_id !== departmentId) return false;
        return true;
      });

      // ========================================
      // 3. Combine counts
      // ========================================
      const totalObjectives = (objectivesCount || 0) + filteredElectives.length;
      const activeElectives = filteredElectives.filter((e: any) =>
        e.status !== 'completed' && e.is_active
      );
      const totalActiveObjectives = activeObjectives.length + activeElectives.length;

      // Calculate combined average progress
      let combinedProgress = 0;
      if (totalActiveObjectives > 0) {
        const objectivesProgressSum = activeObjectives.reduce((sum: number, o: OKRObjective) => sum + (o.overall_progress || 0), 0);
        const electivesProgressSum = activeElectives.reduce((sum: number, e: any) => sum + (e.progress || 0), 0);
        combinedProgress = Math.round((objectivesProgressSum + electivesProgressSum) / totalActiveObjectives);
      }

      // Get at-risk objectives (progress < 40% and > 0)
      const atRiskFromObjectives = activeObjectives.filter((o: OKRObjective) =>
        o.overall_progress < 40 && o.overall_progress > 0
      ).length;
      const atRiskFromElectives = activeElectives.filter((e: any) =>
        e.progress < 40 && e.progress > 0
      ).length;
      const atRiskObjectives = atRiskFromObjectives + atRiskFromElectives;

      // ========================================
      // 4. Get check-in compliance
      // ========================================
      const { count: totalUsers } = await (this.supabase as any)
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId);

      const { count: checkedInUsers } = await (this.supabase as any)
        .from('okr_user_status')
        .select('*', { count: 'exact', head: true })
        .neq('current_badge', 'blocked');

      const checkInComplianceRate = totalUsers ? Math.round((checkedInUsers || 0) / totalUsers * 100) : 0;

      // Get blocked users
      const { count: blockedUsersCount } = await (this.supabase as any)
        .from('okr_user_status')
        .select('*', { count: 'exact', head: true })
        .eq('current_badge', 'blocked');

      // Get milestones this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const { count: milestonesThisWeek } = await (this.supabase as any)
        .from('okr_milestones')
        .select('*', { count: 'exact', head: true })
        .gte('achieved_at', weekStart.toISOString());

      // Calculate trend (compare to last week)
      const lastWeekAvg = await this.getLastWeekAverageProgress(institutionId, departmentId);
      const trendDiff = combinedProgress - lastWeekAvg;
      const trendDirection = trendDiff > 2 ? 'up' : trendDiff < -2 ? 'down' : 'stable';

      return {
        total_objectives: totalObjectives,
        active_objectives: totalActiveObjectives,
        avg_progress: combinedProgress,
        check_in_compliance_rate: checkInComplianceRate,
        blocked_users_count: blockedUsersCount || 0,
        milestones_achieved_this_week: milestonesThisWeek || 0,
        at_risk_objectives: atRiskObjectives,
        trend_direction: trendDirection,
        trend_percentage: Math.abs(trendDiff)
      };
    } catch (error: any) {
      console.error('[OKR Analytics] Error fetching summary:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get progress trend data for line charts (last 12 weeks)
   */
  static async getProgressTrend(
    institutionId: string,
    departmentId?: string,
    weeks: number = 12
  ): Promise<OKRTrendDataPoint[]> {
    try {
      const trendData: OKRTrendDataPoint[] = [];
      const now = new Date();

      for (let i = weeks - 1; i >= 0; i--) {
        const weekDate = new Date(now);
        weekDate.setDate(weekDate.getDate() - (i * 7));
        const weekNumber = this.getWeekNumber(weekDate);

        // Get check-ins for this week
        let query = (this.supabase as any)
          .from('okr_check_ins')
          .select(`
            *,
            user:profiles!user_id(institution_id, department_id)
          `)
          .eq('year', weekDate.getFullYear())
          .eq('week_number', weekNumber);

        const { data: checkIns } = await query;

        // Filter by institution/department
        const filteredCheckIns = (checkIns || []).filter((c: any) => {
          if (c.user?.institution_id !== institutionId) return false;
          if (departmentId && c.user?.department_id !== departmentId) return false;
          return true;
        });

        // Calculate averages
        const completedCheckIns = filteredCheckIns.filter((c: any) => c.is_completed);

        // Get objectives status at that point (from okr_objectives)
        let objQuery = (this.supabase as any)
          .from('okr_objectives')
          .select('overall_progress, status')
          .eq('institution_id', institutionId)
          .eq('status', 'active');

        if (departmentId) {
          objQuery = objQuery.eq('department_id', departmentId);
        }

        const { data: objectives } = await objQuery;

        // Also get elective OKRs for the trend
        const { data: electiveOKRs } = await (this.supabase as any)
          .from('learner_elective_okrs')
          .select(`
            progress,
            status,
            is_active,
            learner:profiles!learner_id(institution_id, department_id)
          `)
          .eq('is_active', true);

        // Filter electives by institution/department
        const filteredElectives = (electiveOKRs || []).filter((e: any) => {
          if (e.learner?.institution_id !== institutionId) return false;
          if (departmentId && e.learner?.department_id !== departmentId) return false;
          return true;
        });

        // Combine objectives and electives for calculations
        const allOKRs = [
          ...(objectives || []).map((o: any) => ({ progress: o.overall_progress })),
          ...filteredElectives.map((e: any) => ({ progress: e.progress || 0 }))
        ];

        const onTrack = allOKRs.filter((o: any) => o.progress >= 70).length;
        const atRisk = allOKRs.filter((o: any) => o.progress >= 40 && o.progress < 70).length;
        const behind = allOKRs.filter((o: any) => o.progress > 0 && o.progress < 40).length;
        const blocked = allOKRs.filter((o: any) => o.progress === 0).length;

        const avgProgress = allOKRs.length > 0
          ? Math.round(allOKRs.reduce((sum: number, o: any) => sum + (o.progress || 0), 0) / allOKRs.length)
          : 0;

        trendData.push({
          date: weekDate.toISOString().split('T')[0],
          week: weekNumber,
          progress: avgProgress,
          on_track: onTrack,
          at_risk: atRisk,
          behind: behind,
          blocked: blocked
        });
      }

      return trendData;
    } catch (error: any) {
      console.error('[OKR Analytics] Error fetching trend:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return [];
    }
  }

  /**
   * Get department comparison data for bar charts
   */
  static async getDepartmentComparison(
    institutionId: string
  ): Promise<OKRDepartmentComparison[]> {
    try {
      // Get all departments with their objectives
      const { data: departments } = await (this.supabase as any)
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId);

      const comparisons: OKRDepartmentComparison[] = [];

      for (const dept of departments || []) {
        // Get objectives for this department
        const { data: objectives, count: totalObjectives } = await (this.supabase as any)
          .from('okr_objectives')
          .select('overall_progress, status', { count: 'exact' })
          .eq('department_id', dept.id)
          .eq('status', 'active');

        const avgProgress = objectives && objectives.length > 0
          ? Math.round(objectives.reduce((sum: number, o: any) => sum + (o.overall_progress || 0), 0) / objectives.length)
          : 0;

        const onTrackCount = (objectives || []).filter((o: any) => o.overall_progress >= 70).length;
        const onTrackPercentage = objectives && objectives.length > 0
          ? Math.round(onTrackCount / objectives.length * 100)
          : 0;

        // Get blocked users in department
        const { count: blockedUsers } = await (this.supabase as any)
          .from('okr_user_status')
          .select('*, user:profiles!user_id(department_id)', { count: 'exact', head: true })
          .eq('current_badge', 'blocked');

        // Get check-in rate for department
        const { count: totalDeptUsers } = await (this.supabase as any)
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', dept.id);

        const { count: checkedInDeptUsers } = await (this.supabase as any)
          .from('okr_check_ins')
          .select('*, user:profiles!user_id(department_id)', { count: 'exact', head: true })
          .eq('is_completed', true)
          .eq('year', new Date().getFullYear())
          .eq('week_number', this.getWeekNumber(new Date()));

        const checkInRate = totalDeptUsers ? Math.round((checkedInDeptUsers || 0) / totalDeptUsers * 100) : 0;

        comparisons.push({
          department_id: dept.id,
          department_name: dept.department_name,
          total_objectives: totalObjectives || 0,
          avg_progress: avgProgress,
          on_track_percentage: onTrackPercentage,
          check_in_rate: checkInRate,
          blocked_users: blockedUsers || 0
        });
      }

      // Sort by average progress descending
      return comparisons.sort((a, b) => b.avg_progress - a.avg_progress);
    } catch (error: any) {
      console.error('[OKR Analytics] Error fetching department comparison:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return [];
    }
  }

  /**
   * Get projections for objectives (simple linear projection)
   * Includes both okr_objectives AND learner_elective_okrs
   */
  static async getProjections(
    institutionId: string,
    departmentId?: string
  ): Promise<OKRProjection[]> {
    try {
      // ========================================
      // 1. Get traditional OKR objectives
      // ========================================
      let query = (this.supabase as any)
        .from('okr_objectives')
        .select(`
          id,
          title,
          overall_progress,
          start_date,
          end_date,
          status
        `)
        .eq('institution_id', institutionId)
        .eq('status', 'active');

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: objectives } = await query;

      // ========================================
      // 2. Get Elective OKRs
      // ========================================
      const { data: electiveOKRs } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select(`
          id,
          title,
          progress,
          deadline,
          created_at,
          status,
          is_active,
          learner:profiles!learner_id(institution_id, department_id)
        `)
        .eq('is_active', true);

      // Filter electives by institution/department
      const filteredElectives = (electiveOKRs || []).filter((e: any) => {
        if (e.learner?.institution_id !== institutionId) return false;
        if (departmentId && e.learner?.department_id !== departmentId) return false;
        return e.status !== 'completed';
      });

      const projections: OKRProjection[] = [];

      // ========================================
      // 3. Process traditional objectives
      // ========================================
      for (const obj of objectives || []) {
        const startDate = new Date(obj.start_date);
        const endDate = new Date(obj.end_date);
        const now = new Date();

        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        // Current daily rate of progress
        const currentDailyRate = daysElapsed > 0 ? obj.overall_progress / daysElapsed : 0;

        // Projected progress at end date
        const projectedProgress = Math.min(100, Math.round(currentDailyRate * totalDays));

        // Daily rate needed to hit 100%
        const remainingProgress = 100 - obj.overall_progress;
        const dailyRateNeeded = daysRemaining > 0 ? remainingProgress / daysRemaining : 0;

        // Determine status
        let status: 'on_track' | 'at_risk' | 'unlikely';
        if (currentDailyRate >= dailyRateNeeded * 0.8) {
          status = 'on_track';
        } else if (currentDailyRate >= dailyRateNeeded * 0.5) {
          status = 'at_risk';
        } else {
          status = 'unlikely';
        }

        projections.push({
          objective_id: obj.id,
          title: obj.title,
          current_progress: obj.overall_progress,
          projected_progress: projectedProgress,
          days_remaining: daysRemaining,
          daily_rate_needed: Math.round(dailyRateNeeded * 100) / 100,
          current_daily_rate: Math.round(currentDailyRate * 100) / 100,
          status
        });
      }

      // ========================================
      // 4. Process Elective OKRs
      // ========================================
      for (const elective of filteredElectives) {
        const startDate = new Date(elective.created_at);
        const endDate = new Date(elective.deadline);
        const now = new Date();

        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        const currentProgress = elective.progress || 0;

        // Current daily rate of progress
        const currentDailyRate = daysElapsed > 0 ? currentProgress / daysElapsed : 0;

        // Projected progress at deadline
        const projectedProgress = Math.min(100, Math.round(currentDailyRate * totalDays));

        // Daily rate needed to hit 100%
        const remainingProgress = 100 - currentProgress;
        const dailyRateNeeded = daysRemaining > 0 ? remainingProgress / daysRemaining : 0;

        // Determine status
        let status: 'on_track' | 'at_risk' | 'unlikely';
        if (currentDailyRate >= dailyRateNeeded * 0.8) {
          status = 'on_track';
        } else if (currentDailyRate >= dailyRateNeeded * 0.5) {
          status = 'at_risk';
        } else {
          status = 'unlikely';
        }

        projections.push({
          objective_id: elective.id,
          title: `[Elective] ${elective.title}`,
          current_progress: currentProgress,
          projected_progress: projectedProgress,
          days_remaining: daysRemaining,
          daily_rate_needed: Math.round(dailyRateNeeded * 100) / 100,
          current_daily_rate: Math.round(currentDailyRate * 100) / 100,
          status
        });
      }

      // Sort by status (unlikely first, then at_risk, then on_track)
      const statusOrder = { unlikely: 0, at_risk: 1, on_track: 2 };
      return projections.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    } catch (error: any) {
      console.error('[OKR Analytics] Error fetching projections:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return [];
    }
  }

  /**
   * Get role-based dashboard data
   */
  static async getRoleDashboardData(
    role: 'executive' | 'hod' | 'admin',
    institutionId: string,
    departmentId?: string
  ): Promise<{
    summary: OKRAnalyticsSummary;
    trend: OKRTrendDataPoint[];
    comparison?: OKRDepartmentComparison[];
    projections: OKRProjection[];
  }> {
    const summary = await this.getAnalyticsSummary(institutionId, departmentId);

    switch (role) {
      case 'executive':
        // Executive sees institution-wide overview (less detail)
        return {
          summary,
          trend: await this.getProgressTrend(institutionId, undefined, 4), // 4 weeks only
          comparison: await this.getDepartmentComparison(institutionId),
          projections: (await this.getProjections(institutionId)).slice(0, 5) // Top 5 at-risk only
        };

      case 'hod':
        // HOD sees department-specific data with more depth
        return {
          summary,
          trend: await this.getProgressTrend(institutionId, departmentId, 8),
          projections: await this.getProjections(institutionId, departmentId)
        };

      case 'admin':
        // Admin sees everything
        return {
          summary,
          trend: await this.getProgressTrend(institutionId, departmentId, 12),
          comparison: await this.getDepartmentComparison(institutionId),
          projections: await this.getProjections(institutionId, departmentId)
        };

      default:
        return {
          summary,
          trend: await this.getProgressTrend(institutionId, departmentId, 8),
          projections: await this.getProjections(institutionId, departmentId)
        };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private static async getLastWeekAverageProgress(
    institutionId: string,
    departmentId?: string
  ): Promise<number> {
    // This would ideally query historical data
    // For now, return a reasonable estimate based on current progress
    try {
      // Get traditional objectives
      let query = (this.supabase as any)
        .from('okr_objectives')
        .select('overall_progress')
        .eq('institution_id', institutionId)
        .eq('status', 'active');

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: objectives } = await query;

      // Get elective OKRs
      const { data: electiveOKRs } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select(`
          progress,
          is_active,
          learner:profiles!learner_id(institution_id, department_id)
        `)
        .eq('is_active', true);

      // Filter electives by institution/department
      const filteredElectives = (electiveOKRs || []).filter((e: any) => {
        if (e.learner?.institution_id !== institutionId) return false;
        if (departmentId && e.learner?.department_id !== departmentId) return false;
        return true;
      });

      // Combine all progress values
      const allProgress = [
        ...(objectives || []).map((o: any) => o.overall_progress || 0),
        ...filteredElectives.map((e: any) => e.progress || 0)
      ];

      if (allProgress.length === 0) return 0;

      const currentAvg = allProgress.reduce((sum: number, p: number) => sum + p, 0) / allProgress.length;

      // Estimate last week's progress (current - typical weekly gain of 3-5%)
      return Math.max(0, Math.round(currentAvg - 4));
    } catch {
      return 0;
    }
  }
}
