// ============================================
// HEALTH SCORE SERVICE
// ============================================
// Created: 2026-02-06
// Purpose: Retrieve and compute institution health scores
// ============================================
//
// WHO SEES WHICH INSTITUTION'S HEALTH SCORE
//   super admin                        -> every institution
//   principal, HOD, admin, accounts    -> only their own institution
//   anyone else                        -> none
//
// WHERE THE SCOPE COMES FROM
//   EngagementService.getUserAccessScope() is the analytics module's one scope
//   source, and it is unchanged here. It gives a super admin global access and
//   a principal their institution. It gives an HOD a department, and admin or
//   accounts no scope at all; a health score belongs to an institution, so for
//   those three roles the institution is the one on their own profile.
//
// WHY IT IS ENFORCED IN CODE
//   Every read here uses the service-role client, which bypasses row-level
//   security. So the list and detail paths check twice, as Engagement does:
//     1. a gate: checkAccess() refuses an institution outside the scope before
//        any health score row is read (the routes answer 403, never an empty
//        200);
//     2. a filter: the viewer's institutions are added to every health score
//        query, so even an allowed request only returns rows inside the scope.
//
//   Before this, an institution_id in the query string or the path was read as
//   asked for anyone the routes let in, and the list with no id was filtered
//   only for a principal, so an HOD, admin or accounts user got every
//   institution.
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

/** Roles that see the health score of their own institution only. */
const OWN_INSTITUTION_ROLES = ['principal', 'hod', 'admin', 'accounts'];

/** The plain message for an institution outside the viewer's scope. */
export const HEALTH_SCORE_SCOPE_REASON =
  "You do not have access to this institution's health score. You can only view the health score of your own institution.";

/** The plain message when the viewer has no institution to view at all. */
export const NO_HEALTH_SCORE_SCOPE_REASON =
  'You do not have access to institution health scores. They are shown to super admins, and to principals, HODs, admins and accounts team members for their own institution.';

/**
 * The gate's answer. One flat shape (not a union) because this repo compiles
 * without strictNullChecks, where `if (!access.allowed)` would not narrow.
 */
export interface HealthScoreAccess {
  allowed: boolean;
  /** The institutions the viewer may read; null means every institution (super admin). */
  institutionIds: string[] | null;
  /** The HTTP status to answer a refusal with; 200 when allowed. */
  status: 200 | 403;
  /** A plain message for a refusal; empty when allowed. */
  reason: string;
}

export class HealthScoreService {
  /**
   * The institutions this viewer may read health scores for: null for every
   * institution (super admin), otherwise a list, which may be empty.
   */
  static async getViewerInstitutionIds(userId: string): Promise<string[] | null> {
    const scope = await EngagementService.getUserAccessScope(userId);
    if (scope.type === 'global') return null;
    if (scope.type === 'institution') return scope.institutionIds ?? [];

    // getUserAccessScope() resolves no institution for an HOD (a department)
    // or for admin and accounts (no scope), so use the one on their profile.
    const supabase = await createServiceRoleClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', userId)
      .single();

    if (profile && OWN_INSTITUTION_ROLES.includes(profile.role) && profile.institution_id) {
      return [profile.institution_id];
    }
    return [];
  }

  /**
   * The gate: may this viewer see health scores for this institution (or, with
   * no id, for the institutions in their scope)? Refuses before any health
   * score row is read.
   */
  static async checkAccess(
    userId: string,
    institutionId?: string
  ): Promise<HealthScoreAccess> {
    const institutionIds = await this.getViewerInstitutionIds(userId);

    if (institutionIds === null) {
      return { allowed: true, institutionIds: null, status: 200, reason: '' };
    }
    if (institutionIds.length === 0) {
      return { allowed: false, institutionIds, status: 403, reason: NO_HEALTH_SCORE_SCOPE_REASON };
    }
    if (institutionId && !institutionIds.includes(institutionId)) {
      return { allowed: false, institutionIds, status: 403, reason: HEALTH_SCORE_SCOPE_REASON };
    }
    return { allowed: true, institutionIds, status: 200, reason: '' };
  }

  /**
   * Get health scores for every institution (super admin) or the viewer's own
   * institution, optionally narrowed to one institution inside that scope
   */
  static async getHealthScores(
    userId: string,
    institutionId?: string,
    scoreDate?: string
  ): Promise<InstitutionHealthScore[]> {
    // Gate: an institution outside the viewer's scope reads nothing.
    const access = await this.checkAccess(userId, institutionId);
    if (!access.allowed) {
      return [];
    }

    const supabase = await createServiceRoleClient();

    const targetDate = scoreDate || new Date().toISOString().split('T')[0];

    let query = supabase
      .from('institution_health_scores')
      .select('*')
      .eq('score_date', targetDate)
      .order('health_score', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    // Filter: every query is held to the viewer's institutions (none for super admin).
    if (access.institutionIds !== null) {
      query = query.in('institution_id', access.institutionIds);
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
    // Gate: an institution outside the viewer's scope reads nothing.
    const access = await this.checkAccess(userId, institutionId);
    if (!access.allowed) {
      return { current: null, history: [] };
    }

    const supabase = await createServiceRoleClient();

    const today = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    let query = supabase
      .from('institution_health_scores')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('score_date', from)
      .lte('score_date', today)
      .order('score_date', { ascending: true });

    // Filter: held to the viewer's institutions as well (none for super admin).
    if (access.institutionIds !== null) {
      query = query.in('institution_id', access.institutionIds);
    }

    const { data } = await query;

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
