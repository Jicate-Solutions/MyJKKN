// ============================================
// USAGE REPORT SERVICE
// ============================================
// Created: 2026-02-06
// Purpose: Generate downloadable lifecycle analytics reports
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { EngagementService } from './engagement-service';
import { MODULE_LABELS } from '@/types/usage-analytics';
import type {
  ReportConfig,
  ReportType,
  ModuleBreakdown,
  InstitutionHealthScore,
} from '@/types/usage-analytics';

export interface ReportData {
  title: string;
  subtitle: string;
  generated_at: string;
  date_range: { from: string; to: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
}

export class UsageReportService {
  /**
   * Generate a report based on config. Returns structured data for client-side export.
   */
  static async generateReport(
    config: ReportConfig,
    userId: string
  ): Promise<ReportData> {
    const accessScope = await EngagementService.getUserAccessScope(userId);

    // Validate super admin access for restricted reports
    if (
      (config.type === 'institution_comparison' || config.type === 'dormant_analysis') &&
      accessScope.type !== 'global'
    ) {
      throw new Error('This report requires super admin access');
    }

    const institutionId =
      config.institution_id ||
      (accessScope.type === 'institution' && accessScope.institutionIds?.length
        ? accessScope.institutionIds[0]
        : undefined);

    switch (config.type) {
      case 'usage_summary':
        return this.generateUsageSummaryReport(config, institutionId);
      case 'module_adoption':
        return this.generateModuleAdoptionReport(config, institutionId);
      case 'user_engagement':
        return this.generateUserEngagementReport(config, institutionId);
      case 'institution_comparison':
        return this.generateInstitutionComparisonReport(config);
      case 'feature_utilization':
        return this.generateFeatureUtilizationReport(config, institutionId);
      case 'dormant_analysis':
        return this.generateDormantAnalysisReport(config);
      default:
        throw new Error(`Unknown report type: ${config.type}`);
    }
  }

  private static async generateUsageSummaryReport(
    config: ReportConfig,
    institutionId?: string
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();

    let query = supabase
      .from('module_usage_daily')
      .select('metric_date, module, event_count, unique_users, weighted_score, by_event_type')
      .gte('metric_date', config.date_from)
      .lte('metric_date', config.date_to)
      .order('metric_date', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data: rows } = await query;

    // Aggregate by date
    const byDate = new Map<string, {
      event_count: number;
      unique_users: number;
      weighted_score: number;
      modules_used: Set<string>;
    }>();

    for (const row of rows || []) {
      const existing = byDate.get(row.metric_date) || {
        event_count: 0,
        unique_users: 0,
        weighted_score: 0,
        modules_used: new Set<string>(),
      };
      existing.event_count += row.event_count || 0;
      existing.unique_users += row.unique_users || 0;
      existing.weighted_score += row.weighted_score || 0;
      existing.modules_used.add(row.module);
      byDate.set(row.metric_date, existing);
    }

    const summaryRows = Array.from(byDate.entries()).map(([date, agg]) => ({
      date,
      events: agg.event_count,
      users: agg.unique_users,
      score: agg.weighted_score,
      modules: agg.modules_used.size,
    }));

    return {
      title: 'Usage Summary Report',
      subtitle: `Platform usage from ${config.date_from} to ${config.date_to}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Daily Usage',
          headers: {
            date: 'Date',
            events: 'Total Events',
            users: 'Unique Users',
            score: 'Weighted Score',
            modules: 'Modules Used',
          },
          rows: summaryRows,
        },
      ],
    };
  }

  private static async generateModuleAdoptionReport(
    config: ReportConfig,
    institutionId?: string
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();

    let query = supabase
      .from('module_usage_daily')
      .select('module, event_count, unique_users, weighted_score, by_event_type')
      .gte('metric_date', config.date_from)
      .lte('metric_date', config.date_to);

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data: rows } = await query;

    // Aggregate by module
    const byModule = new Map<string, {
      event_count: number;
      unique_users: number;
      weighted_score: number;
      crud_count: number;
      export_count: number;
    }>();

    for (const row of rows || []) {
      const existing = byModule.get(row.module) || {
        event_count: 0,
        unique_users: 0,
        weighted_score: 0,
        crud_count: 0,
        export_count: 0,
      };
      existing.event_count += row.event_count || 0;
      existing.unique_users += row.unique_users || 0;
      existing.weighted_score += row.weighted_score || 0;

      const et = row.by_event_type || {};
      existing.crud_count += (et.create || 0) + (et.update || 0) + (et.delete || 0);
      existing.export_count += et.export || 0;

      byModule.set(row.module, existing);
    }

    const moduleRows = Array.from(byModule.entries())
      .map(([module, agg]) => ({
        module: MODULE_LABELS[module] || module,
        events: agg.event_count,
        users: agg.unique_users,
        score: agg.weighted_score,
        crud: agg.crud_count,
        exports: agg.export_count,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      title: 'Module Adoption Report',
      subtitle: `Module usage analysis from ${config.date_from} to ${config.date_to}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Module Breakdown',
          headers: {
            module: 'Module',
            events: 'Total Events',
            users: 'Unique Users',
            score: 'Weighted Score',
            crud: 'CRUD Actions',
            exports: 'Exports',
          },
          rows: moduleRows,
        },
      ],
    };
  }

  private static async generateUserEngagementReport(
    config: ReportConfig,
    institutionId?: string
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();

    let query = supabase
      .from('module_usage_daily')
      .select('by_role, unique_users, event_count, weighted_score')
      .gte('metric_date', config.date_from)
      .lte('metric_date', config.date_to);

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data: rows } = await query;

    // Aggregate by role
    const byRole = new Map<string, { action_count: number; weighted_score: number }>();

    for (const row of rows || []) {
      for (const [role, count] of Object.entries(row.by_role || {})) {
        const existing = byRole.get(role) || { action_count: 0, weighted_score: 0 };
        existing.action_count += count as number;
        byRole.set(role, existing);
      }
    }

    const roleRows = Array.from(byRole.entries())
      .map(([role, agg]) => ({
        role: role.charAt(0).toUpperCase() + role.slice(1),
        actions: agg.action_count,
      }))
      .sort((a, b) => b.actions - a.actions);

    return {
      title: 'User Engagement Report',
      subtitle: `User activity breakdown from ${config.date_from} to ${config.date_to}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Engagement by Role',
          headers: {
            role: 'Role',
            actions: 'Total Actions',
          },
          rows: roleRows,
        },
      ],
    };
  }

  private static async generateInstitutionComparisonReport(
    config: ReportConfig
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0];

    // Get health scores
    const { data: healthScores } = await supabase
      .from('institution_health_scores')
      .select('*')
      .eq('score_date', today)
      .order('health_score', { ascending: false });

    // Get institution names
    const instIds = (healthScores || []).map((s: any) => s.institution_id);
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', instIds.length ? instIds : ['none']);

    const nameMap = new Map((institutions || []).map((i: any) => [i.id, i.name]));

    const comparisonRows = (healthScores || []).map((s: any) => ({
      institution: nameMap.get(s.institution_id) || 'Unknown',
      health_score: Number(s.health_score).toFixed(1),
      grade: s.health_grade,
      active_user_pct: `${Number(s.active_user_pct).toFixed(1)}%`,
      module_breadth: `${Number(s.module_breadth_score).toFixed(1)}%`,
      action_depth: Number(s.action_depth_score).toFixed(1),
      consistency: Number(s.consistency_score).toFixed(1),
      feature_maturity: Number(s.feature_maturity_score).toFixed(1),
    }));

    return {
      title: 'Institution Comparison Report',
      subtitle: `Cross-institution health score comparison as of ${today}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Health Score Comparison',
          headers: {
            institution: 'Institution',
            health_score: 'Health Score',
            grade: 'Grade',
            active_user_pct: 'Active Users %',
            module_breadth: 'Module Breadth',
            action_depth: 'Action Depth',
            consistency: 'Consistency',
            feature_maturity: 'Feature Maturity',
          },
          rows: comparisonRows,
        },
      ],
    };
  }

  private static async generateFeatureUtilizationReport(
    config: ReportConfig,
    institutionId?: string
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();

    let query = supabase
      .from('module_usage_daily')
      .select('module, event_count, unique_users, weighted_score, by_event_type, by_role')
      .gte('metric_date', config.date_from)
      .lte('metric_date', config.date_to);

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data: rows } = await query;

    // Aggregate by module
    const byModule = new Map<string, {
      events: number;
      users: number;
      score: number;
      views: number;
      creates: number;
      updates: number;
      deletes: number;
      exports: number;
    }>();

    for (const row of rows || []) {
      const existing = byModule.get(row.module) || {
        events: 0, users: 0, score: 0,
        views: 0, creates: 0, updates: 0, deletes: 0, exports: 0,
      };
      existing.events += row.event_count || 0;
      existing.users += row.unique_users || 0;
      existing.score += row.weighted_score || 0;

      const et = row.by_event_type || {};
      existing.views += (et.page_visit || 0) + (et.view || 0);
      existing.creates += et.create || 0;
      existing.updates += et.update || 0;
      existing.deletes += et.delete || 0;
      existing.exports += et.export || 0;

      byModule.set(row.module, existing);
    }

    const featureRows = Array.from(byModule.entries())
      .map(([module, agg]) => ({
        module: MODULE_LABELS[module] || module,
        events: agg.events,
        users: agg.users,
        score: agg.score,
        views: agg.views,
        creates: agg.creates,
        updates: agg.updates,
        deletes: agg.deletes,
        exports: agg.exports,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      title: 'Feature Utilization Report',
      subtitle: `Detailed module usage from ${config.date_from} to ${config.date_to}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Feature Detail',
          headers: {
            module: 'Module',
            events: 'Total Events',
            users: 'Unique Users',
            score: 'Weighted Score',
            views: 'Views',
            creates: 'Creates',
            updates: 'Updates',
            deletes: 'Deletes',
            exports: 'Exports',
          },
          rows: featureRows,
        },
      ],
    };
  }

  private static async generateDormantAnalysisReport(
    config: ReportConfig
  ): Promise<ReportData> {
    const supabase = await createServiceRoleClient();

    // Get all institutions
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');

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
    const dormantRows = (institutions || []).map((inst: any) => {
      const lastActivity = lastActivityMap.get(inst.id) || null;
      const daysSince = lastActivity
        ? Math.floor((today.getTime() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      let status = 'Active';
      if (daysSince >= 30) status = 'Critical (30+ days)';
      else if (daysSince >= 15) status = 'Warning (15-30 days)';
      else if (daysSince >= 7) status = 'Caution (7-14 days)';

      return {
        institution: inst.name,
        last_activity: lastActivity || 'Never',
        days_inactive: daysSince >= 999 ? 'N/A' : daysSince,
        status,
      };
    }).sort((a: any, b: any) => {
      const aDays = a.days_inactive === 'N/A' ? 9999 : a.days_inactive;
      const bDays = b.days_inactive === 'N/A' ? 9999 : b.days_inactive;
      return (bDays as number) - (aDays as number);
    });

    return {
      title: 'Dormant Analysis Report',
      subtitle: `Institution activity analysis as of ${today.toISOString().split('T')[0]}`,
      generated_at: new Date().toISOString(),
      date_range: { from: config.date_from, to: config.date_to },
      sections: [
        {
          title: 'Dormant Institutions',
          headers: {
            institution: 'Institution',
            last_activity: 'Last Activity',
            days_inactive: 'Days Inactive',
            status: 'Status',
          },
          rows: dormantRows,
        },
      ],
    };
  }
}
