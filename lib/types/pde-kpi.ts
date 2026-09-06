// =====================================================================
// lib/types/pde-kpi.ts
// PDE Tier 6 (T6.4) — KPI dashboard types
// =====================================================================
//
// Surfaces Director's locked strategic metric (memory:
// project_hr_strategic_lock_2026_05_11):
//
//   "60% coordinator active-use ratio within 90 days of onboarding."
//
// active_use_ratio = (active in last 30d) / (onboarded in last 90d) × 100
//
// A coordinator is "active in last 30d" if they have ≥1 of:
//   - validator on a pde_demonstrations row
//   - submitter (created_by) on a pde_demonstrations row
//   - triggered a pde_bridge_audit run (created_by)
// =====================================================================

export type PdeKpiPerInstitution = {
  institution_id: string;
  name: string;
  ratio: number;            // 0..100
  active: number;
  total: number;
};

export type PdeKpiPerCategory = {
  category_key: string;
  demonstration_count: number;
  scored_count: number;
};

export type PdeKpiTrendPoint = {
  date: string;             // ISO yyyy-mm-dd
  active_count: number;
  ratio: number;            // 0..100
};

export type PdeKpiSnapshot = {
  active_use_ratio: number;     // 0..100
  active_count: number;
  total_onboarded_count: number;
  window_days: 90;
  lookback_days: 30;
  computed_at: string;          // ISO timestamp
  per_institution: PdeKpiPerInstitution[];
  per_category: PdeKpiPerCategory[];
  rolling_trend: PdeKpiTrendPoint[];
};

export type KpiTarget = {
  metric: 'active_use_ratio_90d';
  target: 0.6;
  deadline_days: 90;
};
