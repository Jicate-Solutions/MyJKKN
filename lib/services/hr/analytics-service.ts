/**
 * HR Analytics Service — C1.
 *
 * Cross-institution analytics from existing tables:
 *   - staff (headcount, tenure, attrition)
 *   - hr_staff_details (department)
 *   - hr_leave_balances (leave utilization)
 *   - institutions (names)
 *
 * No new tables, no materialized views. All queries run against RLS-scoped
 * data — super_admin sees all institutions, others see their own.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRAnalyticsPayload,
  HRAnalyticsFilters,
  HeadcountByInstitution,
  HeadcountTrend,
  AttritionData,
  DepartmentDistribution,
  LeaveUtilizationByInstitution,
  HRAnalyticsSummary,
} from '@/types/hr-analytics';
import { HRAcademicYearService } from '@/lib/services/hr/hr-academic-year-service';

// =====================================================================================
// Helpers
// =====================================================================================

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function periodToMonths(period: string): number {
  switch (period) {
    case '3m':
      return 3;
    case '6m':
      return 6;
    default:
      return 12;
  }
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// =====================================================================================
// Service
// =====================================================================================

export class HRAnalyticsService {
  /**
   * Main entry point — returns the full analytics payload.
   */
  static async getAnalytics(
    supabase: SupabaseClient,
    filters: HRAnalyticsFilters = {}
  ): Promise<HRAnalyticsPayload> {
    const period = filters.period ?? '12m';
    const cutoff = monthsAgo(periodToMonths(period));

    const [
      headcountByInstitution,
      headcountTrend,
      attrition,
      departmentDistribution,
      leaveUtilization,
    ] = await Promise.all([
      this.getHeadcountByInstitution(supabase, filters.institution_id),
      this.getHeadcountTrend(supabase, cutoff, filters.institution_id),
      this.getAttrition(supabase, cutoff, filters.institution_id),
      this.getDepartmentDistribution(supabase, filters.institution_id),
      this.getLeaveUtilization(supabase, filters.institution_id),
    ]);

    // Compute summary from headcount data
    const totalStaff = headcountByInstitution.reduce((s, h) => s + h.total, 0);
    const activeStaff = headcountByInstitution.reduce((s, h) => s + h.active, 0);
    const inactiveStaff = headcountByInstitution.reduce(
      (s, h) => s + h.inactive,
      0
    );
    const totalLeft = attrition.reduce((s, a) => s + a.left, 0);
    const overallAttritionRate =
      totalStaff > 0 ? Math.round((totalLeft / totalStaff) * 100 * 10) / 10 : 0;

    // Average tenure: difference between now and each staff's created_at
    const avgTenure = await this.getAvgTenure(supabase, filters.institution_id);

    const summary: HRAnalyticsSummary = {
      total_staff: totalStaff,
      active_staff: activeStaff,
      inactive_staff: inactiveStaff,
      avg_tenure_months: avgTenure,
      overall_attrition_rate: overallAttritionRate,
    };

    return {
      summary,
      headcount_by_institution: headcountByInstitution,
      headcount_trend: headcountTrend,
      attrition,
      department_distribution: departmentDistribution,
      leave_utilization_by_institution: leaveUtilization,
      generated_at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Headcount by institution
  // ---------------------------------------------------------------------------

  private static async getHeadcountByInstitution(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<HeadcountByInstitution[]> {
    let query = supabase
      .from('staff')
      .select('id, institution_id, is_active, institutions!staff_institution_id_fkey!inner(name)');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const map = new Map<
      string,
      { institution_name: string; total: number; active: number; inactive: number }
    >();

    for (const row of data ?? []) {
      const iid = row.institution_id as string;
      const iname = (row as any).institutions?.name ?? 'Unknown';
      if (!map.has(iid)) {
        map.set(iid, { institution_name: iname, total: 0, active: 0, inactive: 0 });
      }
      const entry = map.get(iid)!;
      entry.total++;
      if (row.is_active) {
        entry.active++;
      } else {
        entry.inactive++;
      }
    }

    return Array.from(map.entries()).map(([institution_id, v]) => ({
      institution_id,
      ...v,
    }));
  }

  // ---------------------------------------------------------------------------
  // Headcount trend (monthly)
  // ---------------------------------------------------------------------------

  private static async getHeadcountTrend(
    supabase: SupabaseClient,
    cutoff: string,
    institutionId?: string
  ): Promise<HeadcountTrend[]> {
    let query = supabase
      .from('staff')
      .select('created_at, institution_id, institutions!staff_institution_id_fkey!inner(name)')
      .gte('created_at', cutoff);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const map = new Map<string, number>(); // key = "YYYY-MM|institution_name"

    for (const row of data ?? []) {
      const month = formatMonth(row.created_at as string);
      const iname = (row as any).institutions?.name ?? 'Unknown';
      const key = `${month}|${iname}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([key, count]) => {
        const [month, institution_name] = key.split('|');
        return { month, count, institution_name };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  // ---------------------------------------------------------------------------
  // Attrition
  // ---------------------------------------------------------------------------

  private static async getAttrition(
    supabase: SupabaseClient,
    cutoff: string,
    institutionId?: string
  ): Promise<AttritionData[]> {
    // Joined: staff created in period
    let joinedQuery = supabase
      .from('staff')
      .select('institution_id, institutions!staff_institution_id_fkey!inner(name)')
      .gte('created_at', cutoff);

    if (institutionId) joinedQuery = joinedQuery.eq('institution_id', institutionId);

    const { data: joinedData, error: joinedErr } = await joinedQuery;
    if (joinedErr) throw joinedErr;

    // Left: staff with is_active = false AND updated_at in period
    // (proxy for termination — no separate termination_date column guaranteed)
    let leftQuery = supabase
      .from('staff')
      .select('institution_id, institutions!staff_institution_id_fkey!inner(name)')
      .eq('is_active', false)
      .gte('updated_at', cutoff);

    if (institutionId) leftQuery = leftQuery.eq('institution_id', institutionId);

    const { data: leftData, error: leftErr } = await leftQuery;
    if (leftErr) throw leftErr;

    // Total active per institution (for rate denominator)
    let totalQuery = supabase
      .from('staff')
      .select('institution_id, is_active');

    if (institutionId) totalQuery = totalQuery.eq('institution_id', institutionId);

    const { data: totalData, error: totalErr } = await totalQuery;
    if (totalErr) throw totalErr;

    // Aggregate
    const institutions = new Map<
      string,
      { name: string; joined: number; left: number; totalActive: number }
    >();

    // Get institution names from joined data
    for (const row of joinedData ?? []) {
      const iid = row.institution_id as string;
      const iname = (row as any).institutions?.name ?? 'Unknown';
      if (!institutions.has(iid)) {
        institutions.set(iid, { name: iname, joined: 0, left: 0, totalActive: 0 });
      }
      institutions.get(iid)!.joined++;
    }

    for (const row of leftData ?? []) {
      const iid = row.institution_id as string;
      const iname = (row as any).institutions?.name ?? 'Unknown';
      if (!institutions.has(iid)) {
        institutions.set(iid, { name: iname, joined: 0, left: 0, totalActive: 0 });
      }
      institutions.get(iid)!.left++;
    }

    for (const row of totalData ?? []) {
      const iid = row.institution_id as string;
      if (!institutions.has(iid)) {
        institutions.set(iid, { name: 'Unknown', joined: 0, left: 0, totalActive: 0 });
      }
      if (row.is_active) {
        institutions.get(iid)!.totalActive++;
      }
    }

    return Array.from(institutions.entries()).map(([institution_id, v]) => ({
      institution_id,
      institution_name: v.name,
      joined: v.joined,
      left: v.left,
      rate:
        v.totalActive > 0
          ? Math.round((v.left / v.totalActive) * 100 * 10) / 10
          : 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Department distribution
  // ---------------------------------------------------------------------------

  private static async getDepartmentDistribution(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<DepartmentDistribution[]> {
    let query = supabase
      .from('hr_staff_details')
      .select('department, staff!inner(is_active, institution_id)')
      .eq('staff.is_active', true);

    if (institutionId) {
      query = query.eq('staff.institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const deptMap = new Map<string, number>();
    let total = 0;

    for (const row of data ?? []) {
      const dept = (row.department as string) || 'Unassigned';
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
      total++;
    }

    return Array.from(deptMap.entries())
      .map(([department, count]) => ({
        department,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ---------------------------------------------------------------------------
  // Leave utilization by institution
  // ---------------------------------------------------------------------------

  private static async getLeaveUtilization(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<LeaveUtilizationByInstitution[]> {
    // v_hr_leave_balance is a view, so it carries no FK metadata — PostgREST
    // cannot resolve a staff!inner embed against it (confirmed: PGRST200,
    // "Could not find a relationship between 'v_hr_leave_balance' and 'staff'").
    // Group by hr_organization_id instead and resolve institution names via a
    // second small query against hr_organizations (1 hr_organization : 1 institution).
    const { data: orgs, error: orgsError } = await supabase
      .from('hr_organizations')
      .select('id, institution_id, institutions!hr_organizations_institution_id_fkey(name)')
      .not('institution_id', 'is', null);
    if (orgsError) throw orgsError;

    const orgToInstitution = new Map<string, { institution_id: string; institution_name: string }>();
    for (const org of orgs ?? []) {
      const iid = (org as any).institution_id as string | null;
      if (!iid) continue;
      if (institutionId && iid !== institutionId) continue;
      orgToInstitution.set(org.id as string, {
        institution_id: iid,
        institution_name: (org as any).institutions?.name ?? 'Unknown',
      });
    }

    // v_hr_leave_balance derives a row for every OPEN year (frozen_at IS
    // NULL), which includes years that have not started yet — HR opens next
    // year's rows early for onboarding/planning. Scoping to the academic
    // year containing today keeps this "where do we stand right now," not a
    // blend that silently folds in next year's full, unused entitlement.
    const currentYear = await HRAcademicYearService.getCurrent(supabase);
    if (!currentYear) return [];

    let query = supabase
      .from('v_hr_leave_balance')
      .select('entitled, used, hr_organization_id')
      .eq('hr_academic_year_id', currentYear.id);

    if (institutionId) {
      const orgIds = Array.from(orgToInstitution.keys());
      if (orgIds.length === 0) return [];
      query = query.in('hr_organization_id', orgIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const map = new Map<
      string,
      { name: string; total_allocated: number; total_used: number }
    >();

    for (const row of data ?? []) {
      const orgId = row.hr_organization_id as string | null;
      if (!orgId) continue;
      const inst = orgToInstitution.get(orgId);
      const iid = inst?.institution_id ?? orgId;
      const iname = inst?.institution_name ?? 'Unknown';

      if (!map.has(iid)) {
        map.set(iid, { name: iname, total_allocated: 0, total_used: 0 });
      }
      const entry = map.get(iid)!;
      entry.total_allocated += (row.entitled as number) ?? 0;
      entry.total_used += (row.used as number) ?? 0;
    }

    return Array.from(map.entries()).map(([institution_id, v]) => ({
      institution_id,
      institution_name: v.name,
      total_allocated: v.total_allocated,
      total_used: v.total_used,
      utilization_pct:
        v.total_allocated > 0
          ? Math.round((v.total_used / v.total_allocated) * 100 * 10) / 10
          : 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Average tenure
  // ---------------------------------------------------------------------------

  private static async getAvgTenure(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<number> {
    let query = supabase
      .from('staff')
      .select('created_at')
      .eq('is_active', true);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) return 0;

    const now = Date.now();
    const totalMonths = data.reduce((sum, row) => {
      const created = new Date(row.created_at as string).getTime();
      const diffMs = now - created;
      return sum + diffMs / (1000 * 60 * 60 * 24 * 30.44); // approx months
    }, 0);

    return Math.round((totalMonths / data.length) * 10) / 10;
  }
}
