/**
 * HR Command Center Dashboard — Sprint 6 types.
 *
 * Rebuilt from specs/myjkkn-hr-sprint-06-plan.md (28 locked decisions).
 * DB foundation (hr_dashboard_access_log + realtime publication) was applied
 * to production 2026-04-15; TypeScript code was lost in a working-tree revert
 * event and is being rebuilt here.
 *
 * Role-adapted 4-quadrant dashboard at /hr:
 *  - HR Officer view (daily operational): today's_action, workforce, leave_utilization, policy_activity
 *  - Director view (weekly strategic):     institution_posture, leave_health, compliance, trend
 *  - Super admin default:                   11-institution grid with toggle to rolled-up Director view
 */

// =====================================================================================
// KPI (a single metric inside a quadrant)
// =====================================================================================

/**
 * Stable machine names for every KPI in every role-view. Used as kpi_name in
 * hr_dashboard_access_log rows and as keys for React Query invalidation.
 */
export type DashboardKPIName =
  // HR Officer: Today's Action
  | 'pending_approvals'
  | 'staff_on_leave_today'
  | 'active_blackouts'
  // HR Officer: Workforce
  | 'total_headcount'
  | 'permanent_staff'
  | 'non_staff_active'
  // HR Officer: Leave Utilization
  | 'fy_utilization_pct'
  | 'fy_days_used'
  | 'fy_days_remaining'
  // HR Officer: Policy Activity
  | 'active_leave_types'
  | 'active_approval_flows'
  // Director: Institution Posture
  | 'active_staff'
  // Director: Leave Health
  | 'overdue_approvals'
  | 'emergency_leave_fy'
  // Director: Compliance
  | 'active_blackouts_compliance'
  | 'pending_encashments'
  // Director: Trend
  | 'leave_applications_12mo';

export interface DashboardKPI {
  /** Stable machine name (audit-log safe). */
  name: DashboardKPIName;
  /** Human label shown on the card. */
  label: string;
  /** Primary numeric value. Always an aggregate count — NEVER individual names (decision #6). */
  value: number;
  /** Subset that is overdue (> escalate_after_hours, default 48h) — renders red badge. */
  overdue?: number;
  /** Year-over-year delta percentage (decision #14). null = pre-Sprint-3 history gap (decision #20). */
  yoy_delta_pct?: number | null;
  /** Where a click takes the user. Drill-down via filtered list navigation (decision #5). */
  drill_url: string;
  /** Optional lucide icon name (resolved in the kpi-card component). */
  icon?: string;
  /** If this KPI failed to load on the server, render an inline error (decision #19 partial failure). */
  error?: string;
}

// =====================================================================================
// Quadrant (4 per role view)
// =====================================================================================

export type QuadrantId =
  // HR Officer
  | 'todays_action'
  | 'workforce'
  | 'leave_utilization'
  | 'policy_activity'
  // Director
  | 'institution_posture'
  | 'leave_health'
  | 'compliance'
  | 'trend';

export interface TrendPoint {
  /** YYYY-MM month bucket. */
  month: string;
  /** Count for that month, OR null for pre-Sprint-3 history gap (decision #20). */
  value: number | null;
}

export interface Quadrant {
  id: QuadrantId;
  title: string;
  kpis: DashboardKPI[];
  /** Populated ONLY for id='trend' — a 12-month rolling series. */
  trend_series?: TrendPoint[];
  /** Set when this whole quadrant failed to load. Other quadrants still render (decision #19). */
  error?: string;
}

// =====================================================================================
// Institution card (super admin grid mode — 11 mini-dashboards per decision #17)
// =====================================================================================

export interface InstitutionCard {
  institution_id: string;
  institution_name: string;
  hr_organization_id: string;
  /** Compact rollup — not full quadrants, just what fits on a card. */
  active_staff: number;
  pending_approvals: number;
  pending_approvals_overdue: number;
  staff_on_leave_today: number;
  fy_utilization_pct: number;
  /** If this institution card failed to aggregate, others still render. */
  error?: string;
}

// =====================================================================================
// Banners (today-holiday + FY-end prompt — decisions #26, #27)
// =====================================================================================

export type BannerKind = 'today_holiday' | 'fy_end_prompt';

export interface DashboardBanner {
  kind: BannerKind;
  title: string;
  message: string;
  severity: 'info' | 'warning';
  /** e.g., { holiday_name, institution_id } or { fy_end, days_left, staff_with_unused } */
  meta?: Record<string, unknown>;
}

// =====================================================================================
// Viewer context
// =====================================================================================

/**
 * Who is looking at the dashboard. Non-HR users never reach this payload —
 * they get redirected to /dashboard with a toast (decision #13) at the route
 * level, not in the service.
 */
export type ViewerRole = 'super_admin' | 'hr_officer' | 'director';

/**
 * Which slice the payload represents. Mirrors the CHECK constraint on
 * hr_dashboard_access_log.scope.
 */
export type DashboardScope = 'rolled-up' | 'institution' | 'hr-officer-own';

/**
 * Super-admin-only choice of display mode. Default = grid per decision #17.
 * Header toggle in the page lets super admin switch to rolled-up (Director view).
 */
export type DashboardMode = 'institution-grid' | 'rolled-up';

// =====================================================================================
// Payload — what the API returns in one call
// =====================================================================================

export interface FiscalYear {
  /** Inclusive ISO date. */
  start: string;
  end: string;
  /** Human label like "2026-27". */
  label: string;
}

export interface HRDashboardPayload {
  viewer_role: ViewerRole;
  scope: DashboardScope;
  hr_organization_id: string | null;
  institution_id: string | null;
  /**
   * Populated for HR Officer / Director / super-admin-rolled-up modes.
   * Empty when mode='institution-grid' on super admin (use institution_cards instead).
   */
  quadrants: Quadrant[];
  /**
   * Populated ONLY for super admin in institution-grid mode. 11 entries
   * (one per JKKN institution). Empty otherwise.
   */
  institution_cards: InstitutionCard[];
  banners: DashboardBanner[];
  fiscal_year: FiscalYear;
  /** ISO timestamp of generation. Shown next to manual refresh button (decision #9). */
  generated_at: string;
}

// =====================================================================================
// Realtime invalidation map (decision #21 — Supabase Realtime subscriptions)
// =====================================================================================

/**
 * When a table in this map receives an INSERT / UPDATE / DELETE on the
 * Supabase Realtime channel, the React Query hook invalidates the associated
 * quadrant IDs so they re-fetch. Cross-tab live update per decision #21.
 *
 * Publication was added on production 2026-04-15:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_applications;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_balances;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_encashments;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_blackouts;
 */
export const REALTIME_INVALIDATION_MAP: Record<string, QuadrantId[]> = {
  hr_leave_applications: ['todays_action', 'leave_utilization', 'leave_health', 'trend'],
  hr_leave_balances: ['leave_utilization', 'leave_health'],
  hr_leave_encashments: ['compliance', 'todays_action'],
  hr_leave_blackouts: ['todays_action', 'compliance'],
};

// =====================================================================================
// Access log
// =====================================================================================

export interface DashboardAccessLogEntry {
  /** auth.uid() server-side; never trusted from client. */
  user_id?: string;
  quadrant: string;
  kpi_name: string;
  scope: DashboardScope;
  hr_organization_id?: string | null;
  institution_id?: string | null;
}

// =====================================================================================
// Fiscal year helper (decision #4 — Apr 1 to Mar 31)
// =====================================================================================

/**
 * JKKN fiscal year starts April 1. UTC-safe: we intentionally use UTC
 * getters because all times on this dashboard are rendered in IST at the
 * UI layer (decision #22), and our back-end aggregations use date columns.
 */
export function getCurrentFiscalYear(): FiscalYear {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed; April = 3
  const fyStartYear = month >= 3 ? year : year - 1;
  return {
    start: `${fyStartYear}-04-01`,
    end: `${fyStartYear + 1}-03-31`,
    label: `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
  };
}

/**
 * Derive the same FiscalYear shape for N years ago (for YoY delta queries).
 */
export function getFiscalYearOffset(yearsAgo: number): FiscalYear {
  const now = new Date();
  const year = now.getUTCFullYear() - yearsAgo;
  const month = now.getUTCMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  return {
    start: `${fyStartYear}-04-01`,
    end: `${fyStartYear + 1}-03-31`,
    label: `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
  };
}

/**
 * Is today within the last 14 days of the current fiscal year?
 * Used to decide whether to render the FY-end prompt banner (decision #27).
 */
export function isFYEndWindow(): boolean {
  const fy = getCurrentFiscalYear();
  const end = new Date(`${fy.end}T23:59:59Z`);
  const now = new Date();
  const msLeft = end.getTime() - now.getTime();
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  return daysLeft >= 0 && daysLeft <= 14;
}

// =====================================================================================
// UI constants — escalation + thresholds
// =====================================================================================

/** hr_approval_flows default from HR Sprint 3 spec. Used to mark "overdue" KPIs. */
export const APPROVAL_ESCALATE_AFTER_HOURS = 48;

/** 12-month rolling window for trend quadrant (decision #7). */
export const TREND_WINDOW_MONTHS = 12;
