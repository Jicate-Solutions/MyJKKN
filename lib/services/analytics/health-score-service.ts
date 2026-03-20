// ============================================
// HEALTH SCORE SERVICE
// ============================================
// Created: 2026-02-06
// Purpose: Retrieve and compute institution health scores
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { EngagementService } from './engagement-service';
import { MODULE_LABELS } from '@/types/usage-analytics';
import type {
  InstitutionHealthScore,
  InstitutionComparison,
  HealthGrade,
  DormantStatus,
} from '@/types/usage-analytics';

export class HealthScoreService {
  /**
   * Get health scores for all institutions (super admin) or a specific institution
   */
  static async getHealthScores(
    userId: string,
    institutionId?: string,
    scoreDate?: string
  ): Promise<InstitutionHealthScore[]> {
    const accessScope = await EngagementService.getUserAccessScope(userId);
    const supabase = await createServiceRoleClient();

    const targetDate = scoreDate || new Date().toISOString().split('T')[0];

    let query = supabase
      .from('institution_health_scores')
      .select('*')
      .eq('score_date', targetDate)
      .order('health_score', { ascending: false });

    // Apply access scope
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    } else if (accessScope.type === 'institution' && accessScope.institutionIds?.length) {
      query = query.in('institution_id', accessScope.institutionIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch health scores: ${error.message}`);

    // Enrich with institution names
    const scores = data || [];
    if (scores.length === 0) return [];

    const instIds = [...new Set(scores.map((s: any) => s.institution_id))];
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', instIds);

    const nameMap = new Map((institutions || []).map((i: any) => [i.id, i.name]));

    return scores.map((s: any) => ({
      ...s,
      institution_name: nameMap.get(s.institution_id) || 'Unknown',
    }));
  }

  /**
   * Get a single institution's health score with historical trend
   */
  static async getHealthScoreDetail(
    userId: string,
    institutionId: string,
    days: number = 30
  ): Promise<{
    current: InstitutionHealthScore | null;
    history: InstitutionHealthScore[];
  }> {
    const supabase = await createServiceRoleClient();

    const today = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data } = await supabase
      .from('institution_health_scores')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('score_date', from)
      .lte('score_date', today)
      .order('score_date', { ascending: true });

    const history = data || [];

    // Get institution name
    const { data: inst } = await supabase
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .single();

    const enriched = history.map((s: any) => ({
      ...s,
      institution_name: inst?.name || 'Unknown',
    }));

    const current = enriched.length > 0 ? enriched[enriched.length - 1] : null;

    return { current, history: enriched };
  }

  /**
   * Get cross-institution comparison data (super admin only)
   */
  static async getInstitutionComparison(
    userId: string,
    days: number = 30
  ): Promise<InstitutionComparison[]> {
    const accessScope = await EngagementService.getUserAccessScope(userId);
    if (accessScope.type !== 'global') {
      throw new Error('Institution comparison is only available for super admins');
    }

    const supabase = await createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Get all institutions
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');

    if (!institutions?.length) return [];

    // Get latest health scores
    const { data: healthScores } = await supabase
      .from('institution_health_scores')
      .select('*')
      .eq('score_date', today);

    const healthMap = new Map(
      (healthScores || []).map((s: any) => [s.institution_id, s])
    );

    // Get usage data for the period
    const { data: usageData } = await supabase
      .from('module_usage_daily')
      .select('institution_id, module, event_count, unique_users, weighted_score, metric_date')
      .gte('metric_date', fromDate)
      .lte('metric_date', today);

    // Aggregate usage by institution
    const usageByInst = new Map<
      string,
      {
        total_actions: number;
        active_users: number;
        modules: Map<string, number>;
        last_activity: string;
      }
    >();

    for (const row of usageData || []) {
      const existing = usageByInst.get(row.institution_id) || {
        total_actions: 0,
        active_users: 0,
        modules: new Map<string, number>(),
        last_activity: '',
      };

      existing.total_actions += row.event_count || 0;
      existing.active_users += row.unique_users || 0;

      const modScore = existing.modules.get(row.module) || 0;
      existing.modules.set(row.module, modScore + (row.weighted_score || 0));

      if (row.metric_date > existing.last_activity) {
        existing.last_activity = row.metric_date;
      }

      usageByInst.set(row.institution_id, existing);
    }

    // Get total users per institution from profiles
    const { data: profileCounts } = await supabase
      .from('profiles')
      .select('institution_id')
      .not('institution_id', 'is', null);

    const userCountByInst = new Map<string, number>();
    for (const p of profileCounts || []) {
      userCountByInst.set(
        p.institution_id,
        (userCountByInst.get(p.institution_id) || 0) + 1
      );
    }

    // Build comparison entries
    return institutions.map((inst: any) => {
      const health = healthMap.get(inst.id);
      const usage = usageByInst.get(inst.id);

      // Find top module
      let topModule = '';
      let topModuleScore = 0;
      if (usage?.modules) {
        for (const [mod, score] of usage.modules) {
          if (score > topModuleScore) {
            topModule = mod;
            topModuleScore = score;
          }
        }
      }

      // Calculate dormant days
      const lastActivity = usage?.last_activity || null;
      let dormantDays: number | null = null;
      let status: DormantStatus = 'active';

      if (lastActivity) {
        const daysSince = Math.floor(
          (Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000)
        );
        if (daysSince >= 30) {
          status = 'red';
          dormantDays = daysSince;
        } else if (daysSince >= 15) {
          status = 'orange';
          dormantDays = daysSince;
        } else if (daysSince >= 7) {
          status = 'amber';
          dormantDays = daysSince;
        }
      } else {
        status = 'red';
        dormantDays = 999;
      }

      return {
        institution_id: inst.id,
        institution_name: inst.name,
        health_score: health?.health_score ?? 0,
        health_grade: (health?.health_grade || 'F') as HealthGrade,
        active_users: usage?.active_users || 0,
        total_users: userCountByInst.get(inst.id) || 0,
        actions_30d: usage?.total_actions || 0,
        top_module: topModule,
        top_module_label: MODULE_LABELS[topModule] || topModule || 'None',
        last_activity: lastActivity,
        dormant_days: dormantDays,
        status,
      };
    });
  }
}
