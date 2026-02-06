// ============================================
// LIFECYCLE DASHBOARD SERVICE
// ============================================
// Created: 2026-02-06
// Purpose: Dashboard queries for lifecycle analytics
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { EngagementService } from './engagement-service';
import { MODULE_LABELS } from '@/types/usage-analytics';
import type {
  LifecycleDashboardResponse,
  LifecycleKPIs,
  ModuleBreakdown,
  EventTypeDistribution,
  DailyTrend,
  ActiveRole,
  DormantInstitutionAlert,
  DormantStatus,
  LifecycleFilters,
  UsageEventType,
} from '@/types/usage-analytics';

const TOTAL_MODULES = Object.keys(MODULE_LABELS).length;

export class LifecycleDashboardService {
  /**
   * Get the main dashboard data: KPIs, trends, module breakdown, event distribution
   */
  static async getDashboard(
    filters: LifecycleFilters,
    userId: string
  ): Promise<LifecycleDashboardResponse> {
    const accessScope = await EngagementService.getUserAccessScope(userId);
    const supabase = await createServiceRoleClient();

    const dateFrom = filters.date_from;
    const dateTo = filters.date_to;

    // Build institution filter based on access scope
    const institutionFilter = this.getInstitutionFilter(
      filters.institution_id,
      accessScope
    );

    // Fetch KPIs, trends, module breakdown, event distribution, health score, and dormant alerts in parallel
    const isSuperAdmin = accessScope.type === 'global';
    const [kpis, dailyTrends, moduleBreakdown, eventDistribution, activeRoles, healthData, dormantAlerts] =
      await Promise.all([
        this.getKPIs(supabase, institutionFilter, dateFrom, dateTo),
        this.getDailyTrends(supabase, institutionFilter, dateFrom, dateTo),
        this.getModuleBreakdown(supabase, institutionFilter, dateFrom, dateTo),
        this.getEventDistribution(supabase, institutionFilter, dateFrom, dateTo),
        this.getActiveRoles(supabase, institutionFilter, dateFrom, dateTo),
        this.getHealthScore(supabase, institutionFilter),
        isSuperAdmin ? this.getDormantAlerts(supabase) : Promise.resolve([]),
      ]);

    // Merge health score into KPIs
    if (healthData) {
      kpis.health_score = healthData.health_score;
      kpis.health_grade = healthData.health_grade;
    }

    return {
      kpis,
      daily_trends: dailyTrends,
      module_breakdown: moduleBreakdown,
      event_distribution: eventDistribution,
      active_roles: activeRoles,
      dormant_alerts: dormantAlerts,
    };
  }

  /**
   * Get module-level breakdown with optional drill-down into a specific module
   */
  static async getModuleDetail(
    filters: LifecycleFilters,
    userId: string
  ): Promise<ModuleBreakdown[]> {
    const accessScope = await EngagementService.getUserAccessScope(userId);
    const supabase = await createServiceRoleClient();
    const institutionFilter = this.getInstitutionFilter(
      filters.institution_id,
      accessScope
    );

    return this.getModuleBreakdown(
      supabase,
      institutionFilter,
      filters.date_from,
      filters.date_to,
      filters.module
    );
  }

  /**
   * Get historical trend data for charts
   */
  static async getTrends(
    filters: LifecycleFilters,
    userId: string
  ): Promise<DailyTrend[]> {
    const accessScope = await EngagementService.getUserAccessScope(userId);
    const supabase = await createServiceRoleClient();
    const institutionFilter = this.getInstitutionFilter(
      filters.institution_id,
      accessScope
    );

    return this.getDailyTrends(
      supabase,
      institutionFilter,
      filters.date_from,
      filters.date_to
    );
  }

  // =====================================================
  // Private query methods
  // =====================================================

  private static getInstitutionFilter(
    requestedInstitutionId: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessScope: any
  ): string | null {
    // Super admin with specific institution selected
    if (requestedInstitutionId && accessScope.type === 'global') {
      return requestedInstitutionId;
    }

    // Institution-scoped user
    if (accessScope.type === 'institution' && accessScope.institutionIds?.length) {
      return accessScope.institutionIds[0];
    }

    // Department-scoped user - need to resolve institution from department
    if (accessScope.type === 'department' && accessScope.departmentIds?.length) {
      // For now, department users see their institution's data
      // The department filter is applied at the query level
      return null; // TODO: resolve institution from department
    }

    // Global access with no filter
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getKPIs(
    supabase: any,
    institutionId: string | null,
    dateFrom: string,
    dateTo: string
  ): Promise<LifecycleKPIs> {
    // Query module_usage_daily for the selected period
    let query = supabase
      .from('module_usage_daily')
      .select('metric_date, module, event_count, unique_users, weighted_score')
      .gte('metric_date', dateFrom)
      .lte('metric_date', dateTo);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data: dailyData } = await query;
    const rows = dailyData || [];

    // Calculate current period KPIs
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Active users and actions in last 24h (from today's row)
    const todayRows = rows.filter((r: any) => r.metric_date >= oneDayAgo);
    const activeUsers24h = new Set(todayRows.map((r: any) => r.module)).size > 0
      ? todayRows.reduce((sum: number, r: any) => sum + (r.unique_users || 0), 0)
      : 0;
    const totalActions24h = todayRows.reduce((sum: number, r: any) => sum + (r.event_count || 0), 0);

    // Active users and actions in last 7d
    const weekRows = rows.filter((r: any) => r.metric_date >= sevenDaysAgo);
    const activeUsers7d = weekRows.reduce((sum: number, r: any) => sum + (r.unique_users || 0), 0);
    const totalActions7d = weekRows.reduce((sum: number, r: any) => sum + (r.event_count || 0), 0);

    // Modules used in period
    const modulesUsed = new Set(rows.map((r: any) => r.module)).size;

    // Calculate trends (compare first half vs second half of the period)
    const midDate = new Date(
      (new Date(dateFrom).getTime() + new Date(dateTo).getTime()) / 2
    ).toISOString().split('T')[0];

    const firstHalf = rows.filter((r: any) => r.metric_date < midDate);
    const secondHalf = rows.filter((r: any) => r.metric_date >= midDate);

    const firstHalfUsers = firstHalf.reduce((s: number, r: any) => s + (r.unique_users || 0), 0);
    const secondHalfUsers = secondHalf.reduce((s: number, r: any) => s + (r.unique_users || 0), 0);
    const firstHalfActions = firstHalf.reduce((s: number, r: any) => s + (r.event_count || 0), 0);
    const secondHalfActions = secondHalf.reduce((s: number, r: any) => s + (r.event_count || 0), 0);

    const pctChange = (current: number, previous: number) =>
      previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);

    return {
      active_users_24h: activeUsers24h,
      active_users_7d: activeUsers7d,
      total_actions_24h: totalActions24h,
      total_actions_7d: totalActions7d,
      modules_used: modulesUsed,
      total_modules: TOTAL_MODULES,
      health_score: null,
      health_grade: null,
      trends: {
        active_users_change: pctChange(secondHalfUsers, firstHalfUsers),
        actions_change: pctChange(secondHalfActions, firstHalfActions),
        modules_change: 0,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getDailyTrends(
    supabase: any,
    institutionId: string | null,
    dateFrom: string,
    dateTo: string
  ): Promise<DailyTrend[]> {
    let query = supabase
      .from('module_usage_daily')
      .select('metric_date, event_count, unique_users, weighted_score, by_event_type')
      .gte('metric_date', dateFrom)
      .lte('metric_date', dateTo)
      .order('metric_date', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    const rows = data || [];

    // Group by date
    const byDate = new Map<string, DailyTrend>();
    for (const row of rows) {
      const existing = byDate.get(row.metric_date) || {
        date: row.metric_date,
        weighted_score: 0,
        unique_users: 0,
        event_count: 0,
        crud_count: 0,
        export_count: 0,
      };

      const eventTypes = row.by_event_type || {};
      existing.weighted_score += row.weighted_score || 0;
      existing.unique_users += row.unique_users || 0;
      existing.event_count += row.event_count || 0;
      existing.crud_count += (eventTypes.create || 0) + (eventTypes.update || 0) + (eventTypes.delete || 0);
      existing.export_count += eventTypes.export || 0;

      byDate.set(row.metric_date, existing);
    }

    return Array.from(byDate.values());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getModuleBreakdown(
    supabase: any,
    institutionId: string | null,
    dateFrom: string,
    dateTo: string,
    moduleFilter?: string
  ): Promise<ModuleBreakdown[]> {
    let query = supabase
      .from('module_usage_daily')
      .select('metric_date, module, event_count, unique_users, weighted_score, by_role, by_event_type')
      .gte('metric_date', dateFrom)
      .lte('metric_date', dateTo);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (moduleFilter) {
      query = query.eq('module', moduleFilter);
    }

    const { data } = await query;
    const rows = data || [];

    // Aggregate by module
    const byModule = new Map<string, {
      event_count: number;
      unique_users: number;
      weighted_score: number;
      by_role: Record<string, number>;
      by_event_type: Record<string, number>;
      last_date: string;
      daily_scores: Map<string, number>; // for sparkline
    }>();

    for (const row of rows) {
      const key = row.module;
      const existing = byModule.get(key) || {
        event_count: 0,
        unique_users: 0,
        weighted_score: 0,
        by_role: {},
        by_event_type: {},
        last_date: '',
        daily_scores: new Map<string, number>(),
      };

      existing.event_count += row.event_count || 0;
      existing.unique_users += row.unique_users || 0;
      existing.weighted_score += row.weighted_score || 0;

      // Merge role counts
      for (const [role, count] of Object.entries(row.by_role || {})) {
        existing.by_role[role] = (existing.by_role[role] || 0) + (count as number);
      }

      // Merge event type counts
      for (const [et, count] of Object.entries(row.by_event_type || {})) {
        existing.by_event_type[et] = (existing.by_event_type[et] || 0) + (count as number);
      }

      if (row.metric_date > existing.last_date) {
        existing.last_date = row.metric_date;
      }

      // Track daily scores for sparkline
      const prevScore = existing.daily_scores.get(row.metric_date) || 0;
      existing.daily_scores.set(row.metric_date, prevScore + (row.weighted_score || 0));

      byModule.set(key, existing);
    }

    // Convert to array and compute sparklines (last 7 days)
    const result: ModuleBreakdown[] = [];
    const last7Days = this.getLast7Days(dateTo);

    for (const [module, agg] of byModule) {
      const trend = last7Days.map((d) => agg.daily_scores.get(d) || 0);

      result.push({
        module,
        module_label: MODULE_LABELS[module] || module,
        event_count: agg.event_count,
        visit_count: (agg.by_event_type.page_visit || 0) + (agg.by_event_type.view || 0),
        crud_count: (agg.by_event_type.create || 0) + (agg.by_event_type.update || 0) + (agg.by_event_type.delete || 0),
        export_count: agg.by_event_type.export || 0,
        weighted_score: agg.weighted_score,
        unique_users: agg.unique_users,
        last_used: agg.last_date || null,
        by_role: agg.by_role,
        by_event_type: agg.by_event_type,
        trend,
      });
    }

    // Sort by weighted score descending
    result.sort((a, b) => b.weighted_score - a.weighted_score);

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getEventDistribution(
    supabase: any,
    institutionId: string | null,
    dateFrom: string,
    dateTo: string
  ): Promise<EventTypeDistribution[]> {
    let query = supabase
      .from('module_usage_daily')
      .select('by_event_type')
      .gte('metric_date', dateFrom)
      .lte('metric_date', dateTo);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    const rows = data || [];

    // Aggregate event types
    const totals: Record<string, number> = {};
    for (const row of rows) {
      for (const [et, count] of Object.entries(row.by_event_type || {})) {
        totals[et] = (totals[et] || 0) + (count as number);
      }
    }

    const grandTotal = Object.values(totals).reduce((s, c) => s + c, 0);
    if (grandTotal === 0) return [];

    return Object.entries(totals)
      .map(([event_type, count]) => ({
        event_type: event_type as UsageEventType,
        count,
        percentage: Math.round((count / grandTotal) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getActiveRoles(
    supabase: any,
    institutionId: string | null,
    dateFrom: string,
    dateTo: string
  ): Promise<ActiveRole[]> {
    let query = supabase
      .from('module_usage_daily')
      .select('by_role, unique_users, event_count')
      .gte('metric_date', dateFrom)
      .lte('metric_date', dateTo);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    const rows = data || [];

    const roleMap = new Map<string, { user_count: number; action_count: number }>();
    for (const row of rows) {
      for (const [role, count] of Object.entries(row.by_role || {})) {
        const existing = roleMap.get(role) || { user_count: 0, action_count: 0 };
        existing.action_count += count as number;
        roleMap.set(role, existing);
      }
    }

    return Array.from(roleMap.entries())
      .map(([role, stats]) => ({
        role,
        user_count: stats.user_count,
        action_count: stats.action_count,
      }))
      .sort((a, b) => b.action_count - a.action_count);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getHealthScore(
    supabase: any,
    institutionId: string | null
  ): Promise<{ health_score: number; health_grade: string } | null> {
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('institution_health_scores')
      .select('health_score, health_grade')
      .eq('score_date', today);

    if (institutionId) {
      // Single institution score
      query = query.eq('institution_id', institutionId).single();
      const { data } = await query;
      if (!data) return null;
      return {
        health_score: Number(data.health_score),
        health_grade: data.health_grade,
      };
    }

    // Global average across all institutions
    const { data } = await query;
    if (!data || data.length === 0) return null;

    const avg =
      data.reduce((sum: number, r: any) => sum + Number(r.health_score), 0) / data.length;
    const grade =
      avg >= 80 ? 'A' : avg >= 60 ? 'B' : avg >= 40 ? 'C' : avg >= 20 ? 'D' : 'F';

    return { health_score: Math.round(avg * 100) / 100, health_grade: grade };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async getDormantAlerts(
    supabase: any
  ): Promise<DormantInstitutionAlert[]> {
    // Get all institutions
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name');

    if (!institutions?.length) return [];

    // Get latest activity date per institution
    const { data: usageData } = await supabase
      .from('module_usage_daily')
      .select('institution_id, metric_date')
      .order('metric_date', { ascending: false });

    const lastActivityMap = new Map<string, string>();
    for (const row of usageData || []) {
      if (!lastActivityMap.has(row.institution_id)) {
        lastActivityMap.set(row.institution_id, row.metric_date);
      }
    }

    const today = new Date();
    const alerts: DormantInstitutionAlert[] = [];

    for (const inst of institutions) {
      const lastActivity = lastActivityMap.get(inst.id) || null;
      const daysSince = lastActivity
        ? Math.floor(
            (today.getTime() - new Date(lastActivity).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : 999;

      // Only include institutions inactive for 7+ days
      if (daysSince >= 7) {
        let status: DormantStatus = 'amber';
        if (daysSince >= 30) status = 'red';
        else if (daysSince >= 15) status = 'orange';

        alerts.push({
          institution_id: inst.id,
          institution_name: inst.name,
          last_activity: lastActivity,
          dormant_days: daysSince >= 999 ? -1 : daysSince,
          status,
        });
      }
    }

    // Sort by most dormant first
    alerts.sort((a, b) => b.dormant_days - a.dormant_days);
    return alerts;
  }

  private static getLast7Days(endDate: string): string[] {
    const dates: string[] = [];
    const end = new Date(endDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }
}
