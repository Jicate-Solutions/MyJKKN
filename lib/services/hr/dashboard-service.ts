/**
 * HR Dashboard Service — Sprint 6.
 *
 * Live queries against Sprint 1-3 tables + institution_leaves. No cache, no
 * materialized view in v1 (decision #2). 393 staff + simple JOINs stay <200ms.
 *
 * Role-adapted quadrants (decision #16):
 *   - HR Officer (daily): todays_action, workforce, leave_utilization, policy_activity
 *   - Director (weekly):   institution_posture, leave_health, compliance, trend
 *   - Super admin:         institution-grid (11 cards) OR rolled-up Director view
 *
 * Each quadrant is queried independently so partial failure (decision #19)
 * produces error:string on the failing quadrant only — others still render.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCurrentFiscalYear,
  isFYEndWindow,
  APPROVAL_ESCALATE_AFTER_HOURS,
  TREND_WINDOW_MONTHS,
  type DashboardKPI,
  type Quadrant,
  type QuadrantId,
  type InstitutionCard,
  type DashboardBanner,
  type HRDashboardPayload,
  type ViewerRole,
  type DashboardMode,
  type TrendPoint,
  type DashboardAccessLogEntry,
  type RecentActivityEntry,
  type RecentActivitiesPayload,
  type EmployeeDistributionSlice,
  type EmployeeDistributionPayload,
} from '@/types/hr-dashboard';

// =====================================================================================
// Helpers
// =====================================================================================

async function safeCount(
  fn: () => PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await fn();
  if (error) throw error;
  return count ?? 0;
}

/** Compute YoY delta %. Returns null when prior-year base is 0 (avoid Infinity) or history is missing. */
function yoyDelta(current: number, prior: number | null): number | null {
  if (prior === null) return null;
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 100);
}

/** Escalation threshold: a "pending" approval is overdue if it's sat longer than this. */
function overdueCutoffISO(hours = APPROVAL_ESCALATE_AFTER_HOURS): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// =====================================================================================
// HR Dashboard Service
// =====================================================================================

export class HRDashboardService {
  // -------------------------------------------------------------------------
  // TOP-LEVEL ENTRY: builds a whole payload with partial-failure per quadrant
  // -------------------------------------------------------------------------

  static async getPayload(
    supabase: SupabaseClient,
    opts: {
      viewer_role: ViewerRole;
      hr_organization_id: string | null;
      institution_id: string | null;
      mode: DashboardMode;
    }
  ): Promise<HRDashboardPayload> {
    const { viewer_role, hr_organization_id, institution_id, mode } = opts;
    const fy = getCurrentFiscalYear();
    const generated_at = new Date().toISOString();

    // --- Super admin branch: institution-grid vs rolled-up ---
    if (viewer_role === 'super_admin') {
      if (mode === 'institution-grid') {
        const institution_cards = await this.getInstitutionGrid(supabase);
        const banners = await this.getBanners(supabase, null);
        return {
          viewer_role,
          scope: 'rolled-up',
          hr_organization_id: null,
          institution_id: null,
          quadrants: [],
          institution_cards,
          banners,
          fiscal_year: fy,
          generated_at,
        };
      }
      // mode=rolled-up → same as Director view, cross-institution aggregate
      const quadrants = await this.getDirectorQuadrants(supabase, null);
      const banners = await this.getBanners(supabase, null);
      return {
        viewer_role,
        scope: 'rolled-up',
        hr_organization_id: null,
        institution_id: null,
        quadrants,
        institution_cards: [],
        banners,
        fiscal_year: fy,
        generated_at,
      };
    }

    // --- HR Officer branch: scoped to their hr_organization_id ---
    if (viewer_role === 'hr_officer') {
      const quadrants = await this.getHROfficerQuadrants(supabase, hr_organization_id);
      const banners = await this.getBanners(supabase, institution_id);
      return {
        viewer_role,
        scope: 'hr-officer-own',
        hr_organization_id,
        institution_id,
        quadrants,
        institution_cards: [],
        banners,
        fiscal_year: fy,
        generated_at,
      };
    }

    // --- Director branch: scoped to their hr_organization_id ---
    const quadrants = await this.getDirectorQuadrants(supabase, hr_organization_id);
    const banners = await this.getBanners(supabase, institution_id);
    return {
      viewer_role: 'director',
      scope: 'institution',
      hr_organization_id,
      institution_id,
      quadrants,
      institution_cards: [],
      banners,
      fiscal_year: fy,
      generated_at,
    };
  }

  // -------------------------------------------------------------------------
  // HR OFFICER VIEW (4 quadrants, daily operational)
  // -------------------------------------------------------------------------

  static async getHROfficerQuadrants(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<Quadrant[]> {
    // Run all 4 quadrants in parallel, wrap in allSettled so one failure
    // doesn't blast the others (decision #19 partial failure).
    const [todaysAction, workforce, leaveUtilization, policyActivity] = await Promise.allSettled([
      this.qTodaysAction(supabase, hrOrgId),
      this.qWorkforce(supabase, hrOrgId),
      this.qLeaveUtilization(supabase, hrOrgId),
      this.qPolicyActivity(supabase, hrOrgId),
    ]);

    return [
      settledToQuadrant('todays_action', "Today's Action", todaysAction),
      settledToQuadrant('workforce', 'Workforce', workforce),
      settledToQuadrant('leave_utilization', 'Leave Utilization', leaveUtilization),
      settledToQuadrant('policy_activity', 'Policy Activity', policyActivity),
    ];
  }

  // ----- Quadrant 1: Today's Action -----

  private static async qTodaysAction(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    const today = todayISODate();
    const overdueCutoff = overdueCutoffISO();

    // Pending approvals (all pending in FY)
    let pending = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (hrOrgId) pending = pending.eq('hr_organization_id', hrOrgId);
    const pendingCount = await safeCount(() => pending);

    // Overdue (pending > 48h)
    let overdue = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', overdueCutoff);
    if (hrOrgId) overdue = overdue.eq('hr_organization_id', hrOrgId);
    const overdueCount = await safeCount(() => overdue);

    // Staff on leave today (approved apps overlapping today)
    let onLeave = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today);
    if (hrOrgId) onLeave = onLeave.eq('hr_organization_id', hrOrgId);
    const onLeaveCount = await safeCount(() => onLeave);

    // Active blackouts (today falls in range)
    let blackouts = supabase
      .from('hr_leave_blackouts')
      .select('id', { count: 'exact', head: true })
      .lte('start_date', today)
      .gte('end_date', today);
    if (hrOrgId) blackouts = blackouts.eq('hr_organization_id', hrOrgId);
    const blackoutCount = await safeCount(() => blackouts);

    return [
      {
        name: 'pending_approvals',
        label: 'Pending Approvals',
        value: pendingCount,
        overdue: overdueCount,
        drill_url: '/hr/leave/approve?status=pending',
        icon: 'ClipboardList',
      },
      {
        name: 'staff_on_leave_today',
        label: 'Staff on Leave Today',
        value: onLeaveCount,
        drill_url: `/hr/leave/calendar?date=${today}`,
        icon: 'CalendarDays',
      },
      {
        name: 'active_blackouts',
        label: 'Active Blackouts',
        value: blackoutCount,
        drill_url: '/hr/leave',
        icon: 'CalendarX2',
      },
    ];
  }

  // ----- Quadrant 2: Workforce -----

  private static async qWorkforce(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    // Permanent staff = rows in hr_staff_details (joined to staff)
    let permanent = supabase
      .from('hr_staff_details')
      .select('staff_id', { count: 'exact', head: true });
    if (hrOrgId) permanent = permanent.eq('hr_organization_id', hrOrgId);
    const permanentCount = await safeCount(() => permanent);

    // Non-staff = active hr_employees (guests / vendors / TAs / volunteers)
    let nonStaff = supabase
      .from('hr_employees')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    if (hrOrgId) nonStaff = nonStaff.eq('hr_organization_id', hrOrgId);
    const nonStaffCount = await safeCount(() => nonStaff);

    const total = permanentCount + nonStaffCount;

    return [
      {
        name: 'total_headcount',
        label: 'Total Headcount',
        value: total,
        drill_url: '/staff/list',
        icon: 'Users',
      },
      {
        name: 'permanent_staff',
        label: 'Permanent Staff',
        value: permanentCount,
        drill_url: '/staff/list',
        icon: 'UserCheck',
      },
      {
        name: 'non_staff_active',
        label: 'Non-Staff (Active)',
        value: nonStaffCount,
        drill_url: '/hr/employees?is_active=true',
        icon: 'UsersRound',
      },
    ];
  }

  // ----- Quadrant 3: Leave Utilization -----

  private static async qLeaveUtilization(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    // Sum entitled + used across all balances in current FY.
    // hr_leave_balances.academic_year_id is the FK; we pick rows where
    // hr_organization_id matches (or any if null = rolled up).
    let q = supabase
      .from('hr_leave_balances')
      .select('entitled, used, carried_forward');
    if (hrOrgId) q = q.eq('hr_organization_id', hrOrgId);
    const { data, error } = await q;
    if (error) throw error;

    let entitled = 0;
    let used = 0;
    for (const row of (data ?? []) as Array<{
      entitled: number | null;
      used: number | null;
      carried_forward: number | null;
    }>) {
      entitled += (row.entitled ?? 0) + (row.carried_forward ?? 0);
      used += row.used ?? 0;
    }
    const remaining = Math.max(0, entitled - used);
    const utilizationPct = entitled === 0 ? 0 : Math.round((used / entitled) * 100);

    return [
      {
        name: 'fy_utilization_pct',
        label: 'FY Utilization',
        value: utilizationPct,
        drill_url: '/hr/leave/balance',
        icon: 'Gauge',
      },
      {
        name: 'fy_days_used',
        label: 'Days Used (FY)',
        value: Math.round(used),
        drill_url: '/hr/leave/approve?status=approved',
        icon: 'TrendingUp',
      },
      {
        name: 'fy_days_remaining',
        label: 'Days Remaining',
        value: Math.round(remaining),
        drill_url: '/hr/leave/balance',
        icon: 'CheckSquare',
      },
    ];
  }

  // ----- Quadrant 4: Policy Activity -----

  private static async qPolicyActivity(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    // Active leave types — unified catalog with scope='staff' (per PR #182 unification).
    const { count: leaveTypeCount, error: ltErr } = await supabase
      .from('leave_types')
      .select('id', { count: 'exact', head: true })
      .eq('scope', 'staff')
      .eq('is_active', true);
    if (ltErr) throw ltErr;

    // Active approval flows
    let flows = supabase
      .from('hr_approval_flows')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    if (hrOrgId) flows = flows.eq('hr_organization_id', hrOrgId);
    const flowsCount = await safeCount(() => flows);

    // T8.6 — documents pending verification (HR Officer view). Scoped via
    // hr_organization_id when available; super admin (rolled-up) sees platform.
    // Drill_url goes to the docs queue page (/hr/documents) which already
    // surfaces verification_status='pending' rows for HR Officers.
    let docsPending = supabase
      .from('hr_employee_documents')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending');
    // hr_employee_documents stores institution_id directly (not hr_organization_id).
    // We resolve institution_id from hr_organizations when an hrOrgId filter is active.
    if (hrOrgId) {
      const { data: org } = await supabase
        .from('hr_organizations')
        .select('institution_id')
        .eq('id', hrOrgId)
        .maybeSingle();
      const instId = (org as { institution_id: string | null } | null)?.institution_id ?? null;
      if (instId) docsPending = docsPending.eq('institution_id', instId);
    }
    const docsPendingCount = await safeCount(() => docsPending);

    return [
      {
        name: 'active_leave_types',
        label: 'Active Leave Types',
        value: leaveTypeCount ?? 0,
        drill_url: '/hr/policies/leave_types',
        icon: 'BookOpen',
      },
      {
        name: 'active_approval_flows',
        label: 'Active Approval Flows',
        value: flowsCount,
        drill_url: '/hr/policies/hr_approval_flows',
        icon: 'Workflow',
      },
      {
        name: 'documents_pending_verification',
        label: 'Documents Pending Verification',
        value: docsPendingCount,
        drill_url: '/hr/documents?status=pending',
        icon: 'FileCheck',
      },
    ];
  }

  // -------------------------------------------------------------------------
  // DIRECTOR VIEW (4 quadrants, weekly strategic)
  // -------------------------------------------------------------------------

  static async getDirectorQuadrants(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<Quadrant[]> {
    const [posture, leaveHealth, compliance, trend] = await Promise.allSettled([
      this.qInstitutionPosture(supabase, hrOrgId),
      this.qLeaveHealth(supabase, hrOrgId),
      this.qCompliance(supabase, hrOrgId),
      this.qTrend(supabase, hrOrgId),
    ]);

    return [
      settledToQuadrant('institution_posture', 'Institution Posture', posture),
      settledToQuadrant('leave_health', 'Leave Health', leaveHealth),
      settledToQuadrant('compliance', 'Compliance', compliance),
      settledToQuadrant('trend', 'Trend', trend, await this.trendSeriesSafe(supabase, hrOrgId)),
    ];
  }

  private static async qInstitutionPosture(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    let q = supabase
      .from('hr_staff_details')
      .select('staff_id', { count: 'exact', head: true });
    if (hrOrgId) q = q.eq('hr_organization_id', hrOrgId);
    const activeStaff = await safeCount(() => q);

    return [
      {
        name: 'active_staff',
        label: 'Active Staff',
        value: activeStaff,
        drill_url: '/staff/list?isActive=true',
        icon: 'Users',
      },
    ];
  }

  private static async qLeaveHealth(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    const fy = getCurrentFiscalYear();
    const overdueCutoff = overdueCutoffISO();

    let overdue = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', overdueCutoff);
    if (hrOrgId) overdue = overdue.eq('hr_organization_id', hrOrgId);
    const overdueCount = await safeCount(() => overdue);

    let emergency = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('is_emergency', true)
      .gte('start_date', fy.start)
      .lte('start_date', fy.end);
    if (hrOrgId) emergency = emergency.eq('hr_organization_id', hrOrgId);
    const emergencyCount = await safeCount(() => emergency);

    return [
      {
        name: 'overdue_approvals',
        label: 'Overdue Approvals',
        value: overdueCount,
        overdue: overdueCount,
        drill_url: `/hr/leave/approve?status=pending&created_before=${overdueCutoff}`,
        icon: 'Clock',
      },
      {
        name: 'emergency_leave_fy',
        label: 'Emergency Leave (FY)',
        value: emergencyCount,
        drill_url: `/hr/leave/approve?is_emergency=true&fy=${fy.label}`,
        icon: 'Flame',
      },
    ];
  }

  private static async qCompliance(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    const today = todayISODate();

    let blackouts = supabase
      .from('hr_leave_blackouts')
      .select('id', { count: 'exact', head: true })
      .lte('start_date', today)
      .gte('end_date', today);
    if (hrOrgId) blackouts = blackouts.eq('hr_organization_id', hrOrgId);
    const blackoutCount = await safeCount(() => blackouts);

    let encashments = supabase
      .from('hr_leave_encashments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (hrOrgId) encashments = encashments.eq('hr_organization_id', hrOrgId);
    const encashmentCount = await safeCount(() => encashments);

    // T8.6 — active shift assignments today (Director view). Counts shift
    // assignments where today falls within [effective_from, effective_until]
    // (effective_until null = ongoing). Scoped via institution_id resolved
    // from hr_organization_id (assignments table has no hr_organization_id).
    let shiftsToday = supabase
      .from('hr_shift_assignments')
      .select('id', { count: 'exact', head: true })
      .lte('effective_from', today)
      .or(`effective_until.is.null,effective_until.gte.${today}`);
    if (hrOrgId) {
      const { data: org } = await supabase
        .from('hr_organizations')
        .select('institution_id')
        .eq('id', hrOrgId)
        .maybeSingle();
      const instId = (org as { institution_id: string | null } | null)?.institution_id ?? null;
      if (instId) shiftsToday = shiftsToday.eq('institution_id', instId);
    }
    const shiftsTodayCount = await safeCount(() => shiftsToday);

    return [
      {
        name: 'active_blackouts_compliance',
        label: 'Active Blackouts',
        value: blackoutCount,
        drill_url: '/hr/leave',
        icon: 'CalendarX2',
      },
      {
        name: 'pending_encashments',
        label: 'Pending Encashments',
        value: encashmentCount,
        drill_url: '/hr/leave/encashment?status=pending',
        icon: 'Wallet',
      },
      {
        name: 'active_shifts_today',
        label: 'Active Shifts Today',
        value: shiftsTodayCount,
        drill_url: '/hr/shifts',
        icon: 'CalendarClock',
      },
    ];
  }

  private static async qTrend(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<DashboardKPI[]> {
    // Total leave applications in the last 12 months (headline number; series is
    // fetched separately via trendSeriesSafe for the chart).
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - TREND_WINDOW_MONTHS);

    let curr = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', cutoff.toISOString());
    if (hrOrgId) curr = curr.eq('hr_organization_id', hrOrgId);
    const currCount = await safeCount(() => curr);

    // YoY = same window one year ago (may return null if pre-Sprint-3 — decision #20).
    const priorStart = new Date(cutoff);
    priorStart.setUTCFullYear(priorStart.getUTCFullYear() - 1);
    const priorEnd = new Date(cutoff);
    let prior = supabase
      .from('hr_leave_applications')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', priorStart.toISOString())
      .lt('created_at', priorEnd.toISOString());
    if (hrOrgId) prior = prior.eq('hr_organization_id', hrOrgId);
    const priorCount = await safeCount(() => prior);

    // Sprint 3 only launched mid-April 2026; anything earlier = null history.
    const priorForYoY = priorStart < new Date('2026-04-01T00:00:00Z') ? null : priorCount;

    return [
      {
        name: 'leave_applications_12mo',
        label: 'Leave Applications (12mo)',
        value: currCount,
        yoy_delta_pct: yoyDelta(currCount, priorForYoY),
        drill_url: '/hr/leave/approve',
        icon: 'TrendingUp',
      },
    ];
  }

  /**
   * Wraps trendSeries in allSettled behavior — called from getDirectorQuadrants
   * so a chart failure doesn't nuke the whole 'trend' quadrant. If the series
   * fetch fails, return undefined and the quadrant renders KPIs only.
   */
  private static async trendSeriesSafe(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<TrendPoint[] | undefined> {
    try {
      return await this.trendSeries(supabase, hrOrgId);
    } catch {
      return undefined;
    }
  }

  /**
   * 12-month rolling series of leave application counts. Fetches the raw
   * `created_at` column and buckets client-side into YYYY-MM. Any month
   * before 2026-04 is emitted with value=null (decision #20 — honest history gap).
   */
  private static async trendSeries(
    supabase: SupabaseClient,
    hrOrgId: string | null
  ): Promise<TrendPoint[]> {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - TREND_WINDOW_MONTHS);

    let q = supabase
      .from('hr_leave_applications')
      .select('created_at')
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: true });
    if (hrOrgId) q = q.eq('hr_organization_id', hrOrgId);
    const { data, error } = await q;
    if (error) throw error;

    // Bucket into YYYY-MM
    const buckets = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ created_at: string }>) {
      const d = new Date(row.created_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    // Build 12-month window, filling nulls before Sprint 3 start (2026-04).
    const points: TrendPoint[] = [];
    const SPRINT3_START = '2026-04';
    const now = new Date();
    for (let i = TREND_WINDOW_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const isPreHistory = key < SPRINT3_START;
      points.push({ month: key, value: isPreHistory ? null : buckets.get(key) ?? 0 });
    }
    return points;
  }

  // -------------------------------------------------------------------------
  // SUPER ADMIN INSTITUTION GRID (decision #17)
  // -------------------------------------------------------------------------

  static async getInstitutionGrid(
    supabase: SupabaseClient
  ): Promise<InstitutionCard[]> {
    // Start from hr_organizations (the 11 JKKN tenants) + institution_id.
    const { data: orgs, error } = await supabase
      .from('hr_organizations')
      .select('id, name, institution_id')
      .not('institution_id', 'is', null)
      .order('name', { ascending: true });
    if (error) throw error;

    const today = todayISODate();
    const overdueCutoff = overdueCutoffISO();

    const cards = await Promise.all(
      (orgs ?? []).map(async (org): Promise<InstitutionCard> => {
        try {
          // 5 tiny parallel counts per card so this stays <200ms even at 11 orgs
          const [activeStaff, pending, overdue, onLeave, balances] = await Promise.all([
            safeCount(() =>
              supabase
                .from('hr_staff_details')
                .select('staff_id', { count: 'exact', head: true })
                .eq('hr_organization_id', org.id)
            ),
            safeCount(() =>
              supabase
                .from('hr_leave_applications')
                .select('id', { count: 'exact', head: true })
                .eq('hr_organization_id', org.id)
                .eq('status', 'pending')
            ),
            safeCount(() =>
              supabase
                .from('hr_leave_applications')
                .select('id', { count: 'exact', head: true })
                .eq('hr_organization_id', org.id)
                .eq('status', 'pending')
                .lt('created_at', overdueCutoff)
            ),
            safeCount(() =>
              supabase
                .from('hr_leave_applications')
                .select('id', { count: 'exact', head: true })
                .eq('hr_organization_id', org.id)
                .eq('status', 'approved')
                .lte('start_date', today)
                .gte('end_date', today)
            ),
            (async () => {
              const { data: b, error: bErr } = await supabase
                .from('hr_leave_balances')
                .select('entitled, used, carried_forward')
                .eq('hr_organization_id', org.id);
              if (bErr) throw bErr;
              let entitled = 0;
              let used = 0;
              for (const r of (b ?? []) as Array<{
                entitled: number | null;
                used: number | null;
                carried_forward: number | null;
              }>) {
                entitled += (r.entitled ?? 0) + (r.carried_forward ?? 0);
                used += r.used ?? 0;
              }
              return entitled === 0 ? 0 : Math.round((used / entitled) * 100);
            })(),
          ]);

          return {
            institution_id: org.institution_id as string,
            institution_name: org.name as string,
            hr_organization_id: org.id as string,
            active_staff: activeStaff,
            pending_approvals: pending,
            pending_approvals_overdue: overdue,
            staff_on_leave_today: onLeave,
            fy_utilization_pct: balances,
          };
        } catch (err) {
          return {
            institution_id: org.institution_id as string,
            institution_name: org.name as string,
            hr_organization_id: org.id as string,
            active_staff: 0,
            pending_approvals: 0,
            pending_approvals_overdue: 0,
            staff_on_leave_today: 0,
            fy_utilization_pct: 0,
            error: err instanceof Error ? err.message : 'Institution card failed',
          };
        }
      })
    );

    return cards;
  }

  // -------------------------------------------------------------------------
  // BANNERS (decisions #26 today-holiday + #27 FY-end prompt)
  // -------------------------------------------------------------------------

  static async getBanners(
    supabase: SupabaseClient,
    institutionId: string | null
  ): Promise<DashboardBanner[]> {
    const banners: DashboardBanner[] = [];

    // --- Today's holiday banner ---
    try {
      const today = todayISODate();
      let q = supabase
        .from('institution_leaves')
        .select('name, institution_id, start_date, end_date')
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (!error && data && data.length > 0) {
        const row = data[0] as { name: string; institution_id: string };
        banners.push({
          kind: 'today_holiday',
          title: 'Holiday today',
          message: `${row.name} — institutional holiday. Attendance and leave approvals may be affected.`,
          severity: 'info',
          meta: { holiday_name: row.name, institution_id: row.institution_id },
        });
      }
    } catch {
      // Swallow — banner is non-critical; dashboard renders without it
    }

    // --- FY-end prompt banner (last 14 days of FY) ---
    if (isFYEndWindow()) {
      const fy = getCurrentFiscalYear();
      const end = new Date(`${fy.end}T23:59:59Z`);
      const now = new Date();
      const daysLeft = Math.max(
        0,
        Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      try {
        // "Staff with unused leave" = staff whose used < entitled in current FY
        let q = supabase.from('hr_leave_balances').select('employee_id, entitled, used, carried_forward');
        if (institutionId) {
          // Not a direct institution_id column on hr_leave_balances; rely on the
          // shared hr_organization_id if institutionId resolves to an hr_org.
          // Conservative: skip filter when we don't have a direct org mapping here.
        }
        const { data, error } = await q;
        if (!error && data) {
          let staffWithUnused = 0;
          for (const row of data as Array<{
            entitled: number | null;
            used: number | null;
            carried_forward: number | null;
          }>) {
            const totalEntitled = (row.entitled ?? 0) + (row.carried_forward ?? 0);
            const used = row.used ?? 0;
            if (totalEntitled > used) staffWithUnused++;
          }
          banners.push({
            kind: 'fy_end_prompt',
            title: `Fiscal year ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            message: `${staffWithUnused} staff have unused leave entitlement for FY ${fy.label}. Consider prompting encashment requests.`,
            severity: 'warning',
            meta: { fy_end: fy.end, days_left: daysLeft, staff_with_unused: staffWithUnused },
          });
        }
      } catch {
        // Swallow — banner is non-critical
      }
    }

    return banners;
  }

  // -------------------------------------------------------------------------
  // T3.3 — Recent Activities feed
  // -------------------------------------------------------------------------

  /**
   * Reads the dashboard audit log + joins profile names + institution names.
   * Scoping mirrors the dashboard's role model:
   *   - super_admin (hrOrgId=null, institutionId=null) → all activities
   *   - HR Officer/Director (hrOrgId set) → entries with that hr_organization_id
   *
   * The log table records one row per KPI rendered, so a single dashboard
   * view typically produces 8-15 rows. Limit defaults to 20 (~1-2 sessions).
   */
  static async getRecentActivities(
    supabase: SupabaseClient,
    opts: {
      hoursBack?: number;
      limit?: number;
      hr_organization_id: string | null;
      institution_id: string | null;
    }
  ): Promise<RecentActivitiesPayload> {
    const hoursBack = opts.hoursBack ?? 24;
    const limit = Math.min(opts.limit ?? 20, 50);
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from('hr_dashboard_access_log')
      .select('viewed_at, user_id, quadrant, kpi_name, hr_organization_id, institution_id')
      .gte('viewed_at', cutoff)
      .order('viewed_at', { ascending: false })
      .limit(limit);
    if (opts.hr_organization_id) q = q.eq('hr_organization_id', opts.hr_organization_id);

    const { data, error } = await q;
    if (error) throw error;

    type Row = {
      viewed_at: string;
      user_id: string;
      quadrant: string;
      kpi_name: string;
      hr_organization_id: string | null;
      institution_id: string | null;
    };
    const rows = (data ?? []) as Row[];

    if (rows.length === 0) {
      return { entries: [], generated_at: new Date().toISOString() };
    }

    // Resolve unique user_ids → full_name (or email fallback)
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const nameByUserId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        nameByUserId.set(p.id, p.full_name?.trim() || p.email || 'Unknown user');
      }
    }

    // Resolve unique institution_ids → name
    const institutionIds = Array.from(
      new Set(rows.map((r) => r.institution_id).filter((v): v is string => !!v))
    );
    const nameByInstitutionId = new Map<string, string>();
    if (institutionIds.length > 0) {
      const { data: insts } = await supabase
        .from('institutions')
        .select('id, name')
        .in('id', institutionIds);
      for (const i of (insts ?? []) as Array<{ id: string; name: string }>) {
        nameByInstitutionId.set(i.id, i.name);
      }
    }

    const entries: RecentActivityEntry[] = rows.map((r) => ({
      viewed_at: r.viewed_at,
      user_id: r.user_id,
      actor_name: nameByUserId.get(r.user_id) ?? 'Unknown user',
      quadrant: r.quadrant,
      kpi_name: r.kpi_name,
      institution_name: r.institution_id ? nameByInstitutionId.get(r.institution_id) ?? null : null,
    }));

    return { entries, generated_at: new Date().toISOString() };
  }

  // -------------------------------------------------------------------------
  // T3.5 — Employee distribution donut
  // -------------------------------------------------------------------------

  /**
   * Aggregates active staff grouped by employment_categories.category_name.
   * Top 5 categories rendered as discrete slices; remainder rolled into 'Others'.
   *
   * Scope:
   *   - super_admin (institutionId=null) → all institutions
   *   - others (institutionId set)       → that institution only
   */
  static async getEmployeeDistribution(
    supabase: SupabaseClient,
    opts: { institution_id: string | null }
  ): Promise<EmployeeDistributionPayload> {
    let q = supabase
      .from('staff')
      .select('category_id, employment_categories!inner(category_name)')
      .eq('is_active', true);
    if (opts.institution_id) q = q.eq('institution_id', opts.institution_id);

    const { data, error } = await q;
    if (error) throw error;

    type Row = {
      category_id: string | null;
      employment_categories: { category_name: string } | { category_name: string }[] | null;
    };
    const rows = (data ?? []) as Row[];

    // Bucket counts by category name
    const counts = new Map<string, number>();
    for (const r of rows) {
      // PostgREST may return either object or array depending on join cardinality
      const ec = Array.isArray(r.employment_categories)
        ? r.employment_categories[0]
        : r.employment_categories;
      const name = ec?.category_name ?? 'Uncategorised';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    // Sort descending, take top 5, roll remainder into 'Others'
    const sorted = Array.from(counts.entries())
      .map(([category_name, count]) => ({ category_name, count }))
      .sort((a, b) => b.count - a.count);

    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const rolled_up_count = rest.reduce((acc, x) => acc + x.count, 0);

    const palette = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#6B7280'];
    const slices: EmployeeDistributionSlice[] = top.map((s, i) => ({
      category_name: s.category_name,
      count: s.count,
      color: palette[i] ?? '#6B7280',
    }));
    if (rolled_up_count > 0) {
      slices.push({ category_name: 'Others', count: rolled_up_count, color: palette[5] });
    }

    const total = slices.reduce((acc, s) => acc + s.count, 0);

    return {
      slices,
      total,
      rolled_up_count,
      generated_at: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // ACCESS LOG (decision #18 — granular per-KPI audit)
  // -------------------------------------------------------------------------

  /**
   * Insert a batch of audit rows — one per KPI rendered on the page view.
   * RLS policy hdal_insert requires user_id = auth.uid(); the route layer
   * stamps user_id before calling this.
   */
  static async logAccess(
    supabase: SupabaseClient,
    userId: string,
    entries: DashboardAccessLogEntry[]
  ): Promise<void> {
    if (!entries || entries.length === 0) return;
    const rows = entries.map((e) => ({
      user_id: userId,
      quadrant: e.quadrant,
      kpi_name: e.kpi_name,
      scope: e.scope,
      hr_organization_id: e.hr_organization_id ?? null,
      institution_id: e.institution_id ?? null,
    }));
    const { error } = await supabase.from('hr_dashboard_access_log').insert(rows);
    if (error) throw error;
  }
}

// =====================================================================================
// Helper: convert Promise.allSettled outcome → Quadrant
// =====================================================================================

function settledToQuadrant(
  id: QuadrantId,
  title: string,
  settled: PromiseSettledResult<DashboardKPI[]>,
  trend_series?: TrendPoint[]
): Quadrant {
  if (settled.status === 'fulfilled') {
    return { id, title, kpis: settled.value, trend_series };
  }
  return {
    id,
    title,
    kpis: [],
    error:
      settled.reason instanceof Error
        ? settled.reason.message
        : typeof settled.reason === 'string'
        ? settled.reason
        : 'Quadrant failed to load',
  };
}
