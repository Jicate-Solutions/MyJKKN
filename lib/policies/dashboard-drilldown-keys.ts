/**
 * Dashboard Drill-Down — typed key catalog + code defaults.
 *
 * Substrate: every drill-down decision is a `platform_policies` row keyed
 * `dashboard.drilldown.<metric>.<aspect>`. DB override wins; code default is
 * the fallback. See `specs/group-dashboard-clickable-drill-downs-spec.md`
 * §3.0 (substrate) and §3.1 (click-target inventory).
 *
 * B.1 substrate (2026-05-04). B.2 wires the dashboard. B.3 builds the
 * `/admin/dashboard-drilldowns` admin UI to edit these rows.
 *
 * Standing rule (CLAUDE.md feedback `feedback_policy_decisions_must_be_config_rows.md`):
 *   every threshold/mapping/feature-flag = row in config table + super_admin UI.
 *
 * IMPORTANT — verified route shapes (2026-05-04):
 *   - `/admission/leads` accepts: `funnel_stage`, `priority`, `source`,
 *     `counselor_id`, `expo_event_id`, `program_id`, `institution_id` (singular),
 *     `stale_min_days`. It does NOT currently accept `status`, `admission_year`,
 *     `institution_ids` (plural), or `seat_filled`. The defaults below use the
 *     spec's intended URLs; B.2 must either (a) add those filters to the leads
 *     page or (b) edit the policy rows in the admin UI to match what the leads
 *     page actually accepts. Either way, no SQL change.
 *   - `/admission/seat-configuration` does NOT exist. Actual route is
 *     `/admission/settings/seat-config`. Defaults below use the actual route.
 *   - Per-institution dashboard route (chart_bar / comparison_row destinations)
 *     does NOT exist. Default is `/admission/dashboard?institution_id=:id` as
 *     a placeholder; B.2 either creates the route or the admin UI re-routes
 *     these via override.
 */

export const DRILLDOWN_METRICS = [
  'total_leads',
  'applied',
  'filled',
  'rejected',
  'total_seats',
  'fill_rate',
  'seat_balance',
  'chart_bar',
  'comparison_row',
] as const;

export type DrilldownMetric = (typeof DRILLDOWN_METRICS)[number];

export const DRILLDOWN_ROLES = ['director', 'counselor', 'principal'] as const;
export type DrilldownRole = (typeof DRILLDOWN_ROLES)[number];

/**
 * Typed policy-key shape. Every key in `DRILLDOWN_DEFAULTS` must match this
 * union (TS guards this via the keyof check below).
 */
export type DrilldownPolicyKey =
  | `dashboard.drilldown.${DrilldownMetric}.destination`
  | `dashboard.drilldown.${DrilldownMetric}.columns`
  | `dashboard.drilldown.${DrilldownMetric}.action_buttons.${DrilldownRole}`
  | `dashboard.drilldown.${DrilldownMetric}.empty_state_copy`
  | `dashboard.drilldown.${DrilldownMetric}.enabled`
  | 'dashboard.drilldown.performance_budget_ms';

/** All possible drill-down policy keys, generated from the metric × aspect grid. */
export const DRILLDOWN_KEYS: readonly DrilldownPolicyKey[] = (() => {
  const keys: DrilldownPolicyKey[] = [];
  for (const m of DRILLDOWN_METRICS) {
    keys.push(`dashboard.drilldown.${m}.destination`);
    keys.push(`dashboard.drilldown.${m}.columns`);
    keys.push(`dashboard.drilldown.${m}.empty_state_copy`);
    keys.push(`dashboard.drilldown.${m}.enabled`);
    for (const r of DRILLDOWN_ROLES) {
      keys.push(`dashboard.drilldown.${m}.action_buttons.${r}`);
    }
  }
  keys.push('dashboard.drilldown.performance_budget_ms');
  return keys;
})();

/**
 * Code defaults — fallback when DB has no override row. Mirrors spec §3.1.
 *
 * Value types:
 *   - destination: string (URL with optional `:id` placeholder for chart_bar /
 *     comparison_row, replaced by dashboard at click time)
 *   - columns: string[] (column keys to show in destination list)
 *   - action_buttons.<role>: string[] (button keys; empty for read-only roles)
 *   - empty_state_copy: string
 *   - enabled: boolean
 *   - performance_budget_ms: number
 */
export const DRILLDOWN_DEFAULTS: Record<DrilldownPolicyKey, string | number | boolean | string[]> = {
  // ---- total_leads ----
  'dashboard.drilldown.total_leads.destination': '/admission/leads',
  'dashboard.drilldown.total_leads.columns': ['name', 'status', 'institution', 'date', 'source'],
  'dashboard.drilldown.total_leads.action_buttons.director': [],
  'dashboard.drilldown.total_leads.action_buttons.counselor': ['call', 'whatsapp', 'update_status'],
  'dashboard.drilldown.total_leads.action_buttons.principal': [],
  'dashboard.drilldown.total_leads.empty_state_copy': 'No leads in this admission year.',
  'dashboard.drilldown.total_leads.enabled': true,

  // ---- applied ----
  'dashboard.drilldown.applied.destination': '/admission/leads?status=applied',
  'dashboard.drilldown.applied.columns': ['name', 'date_applied', 'institution', 'source'],
  'dashboard.drilldown.applied.action_buttons.director': [],
  'dashboard.drilldown.applied.action_buttons.counselor': ['call', 'whatsapp', 'update_status'],
  'dashboard.drilldown.applied.action_buttons.principal': [],
  'dashboard.drilldown.applied.empty_state_copy': 'No applied leads in this admission year.',
  'dashboard.drilldown.applied.enabled': true,

  // ---- filled (enrolled) ----
  'dashboard.drilldown.filled.destination': '/admission/leads?status=enrolled',
  'dashboard.drilldown.filled.columns': ['name', 'date_enrolled', 'institution', 'program'],
  'dashboard.drilldown.filled.action_buttons.director': [],
  'dashboard.drilldown.filled.action_buttons.counselor': ['call', 'whatsapp', 'update_status'],
  'dashboard.drilldown.filled.action_buttons.principal': [],
  'dashboard.drilldown.filled.empty_state_copy': 'No enrolled learners in this admission year.',
  'dashboard.drilldown.filled.enabled': true,

  // ---- rejected ----
  'dashboard.drilldown.rejected.destination': '/admission/leads?status=rejected',
  'dashboard.drilldown.rejected.columns': ['name', 'rejection_reason', 'institution', 'date'],
  'dashboard.drilldown.rejected.action_buttons.director': [],
  'dashboard.drilldown.rejected.action_buttons.counselor': ['call', 'whatsapp', 'update_status'],
  'dashboard.drilldown.rejected.action_buttons.principal': [],
  'dashboard.drilldown.rejected.empty_state_copy': 'No rejected leads in this admission year.',
  'dashboard.drilldown.rejected.enabled': true,

  // ---- total_seats ----
  'dashboard.drilldown.total_seats.destination': '/admission/settings/seat-config',
  'dashboard.drilldown.total_seats.columns': ['institution', 'program', 'sanctioned_intake', 'filled', 'balance'],
  'dashboard.drilldown.total_seats.action_buttons.director': [],
  'dashboard.drilldown.total_seats.action_buttons.counselor': [],
  'dashboard.drilldown.total_seats.action_buttons.principal': ['edit_intake'],
  'dashboard.drilldown.total_seats.empty_state_copy': 'Seat data not configured for this admission year.',
  'dashboard.drilldown.total_seats.enabled': true,

  // ---- fill_rate ----
  'dashboard.drilldown.fill_rate.destination': '/admission/leads?status=enrolled&seat_filled=true',
  'dashboard.drilldown.fill_rate.columns': ['name', 'institution', 'program', 'date_enrolled'],
  'dashboard.drilldown.fill_rate.action_buttons.director': [],
  'dashboard.drilldown.fill_rate.action_buttons.counselor': ['call', 'whatsapp'],
  'dashboard.drilldown.fill_rate.action_buttons.principal': [],
  'dashboard.drilldown.fill_rate.empty_state_copy': 'No filled seats in this admission year.',
  'dashboard.drilldown.fill_rate.enabled': true,

  // ---- seat_balance ----
  'dashboard.drilldown.seat_balance.destination': '/admission/settings/seat-config?fill_state=open',
  'dashboard.drilldown.seat_balance.columns': ['institution', 'program', 'sanctioned_intake', 'filled', 'balance'],
  'dashboard.drilldown.seat_balance.action_buttons.director': [],
  'dashboard.drilldown.seat_balance.action_buttons.counselor': [],
  'dashboard.drilldown.seat_balance.action_buttons.principal': ['edit_intake'],
  'dashboard.drilldown.seat_balance.empty_state_copy': 'No open seats remaining for this admission year.',
  'dashboard.drilldown.seat_balance.enabled': true,

  // ---- chart_bar (per-institution chart bar in Seat Analytics) ----
  // `:id` is replaced at click time by the dashboard with the institution UUID.
  'dashboard.drilldown.chart_bar.destination': '/admission/dashboard?institution_id=:id',
  'dashboard.drilldown.chart_bar.columns': ['program', 'sanctioned_intake', 'filled', 'balance', 'fill_rate'],
  'dashboard.drilldown.chart_bar.action_buttons.director': [],
  'dashboard.drilldown.chart_bar.action_buttons.counselor': [],
  'dashboard.drilldown.chart_bar.action_buttons.principal': ['edit_intake'],
  'dashboard.drilldown.chart_bar.empty_state_copy': 'No admission data for this institution in the selected year.',
  'dashboard.drilldown.chart_bar.enabled': true,

  // ---- comparison_row (institution row in comparison table) ----
  'dashboard.drilldown.comparison_row.destination': '/admission/dashboard?institution_id=:id',
  'dashboard.drilldown.comparison_row.columns': ['program', 'sanctioned_intake', 'filled', 'balance', 'fill_rate'],
  'dashboard.drilldown.comparison_row.action_buttons.director': [],
  'dashboard.drilldown.comparison_row.action_buttons.counselor': [],
  'dashboard.drilldown.comparison_row.action_buttons.principal': ['edit_intake'],
  'dashboard.drilldown.comparison_row.empty_state_copy': 'No admission data for this institution in the selected year.',
  'dashboard.drilldown.comparison_row.enabled': true,

  // ---- global ----
  'dashboard.drilldown.performance_budget_ms': 2000,
};

/**
 * Convenience accessors for typed default lookups. Used by the helper fns
 * in `lib/policies/get-policy.ts` and `get-policy-client.ts`.
 */
export function destinationKey(metric: DrilldownMetric): DrilldownPolicyKey {
  return `dashboard.drilldown.${metric}.destination`;
}
export function columnsKey(metric: DrilldownMetric): DrilldownPolicyKey {
  return `dashboard.drilldown.${metric}.columns`;
}
export function actionButtonsKey(metric: DrilldownMetric, role: DrilldownRole): DrilldownPolicyKey {
  return `dashboard.drilldown.${metric}.action_buttons.${role}`;
}
export function emptyStateCopyKey(metric: DrilldownMetric): DrilldownPolicyKey {
  return `dashboard.drilldown.${metric}.empty_state_copy`;
}
export function enabledKey(metric: DrilldownMetric): DrilldownPolicyKey {
  return `dashboard.drilldown.${metric}.enabled`;
}

/** Defaults reader (typed). */
export function getDrilldownDefault<T = string | number | boolean | string[]>(
  key: DrilldownPolicyKey
): T {
  return DRILLDOWN_DEFAULTS[key] as T;
}
