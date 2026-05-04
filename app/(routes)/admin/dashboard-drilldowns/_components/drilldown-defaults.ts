// =====================================================================
// Local stub — DRILLDOWN defaults
// =====================================================================
// TEMPORARY: this file is a local mirror of the substrate that B.1 (PR
// `feat/dashboard-drilldown-substrate-b1`) introduces at
// `lib/policies/dashboard-drilldown-keys.ts`.
//
// ⚠️ REMOVE BEFORE MERGE — once B.1 lands, swap every import of this file
// for `import { ... } from '@/lib/policies/dashboard-drilldown-keys'`.
// The shape below is the contract this admin UI binds to; B.1 must match
// it exactly. Surfaced explicitly in PR body.
//
// Why a local stub: B.3 (this PR) and B.1 are running in parallel per the
// substrate-first wave program. If we imported from B.1 right now,
// typecheck would fail on a not-yet-merged dependency. Local stub keeps
// the page renderable and lets the reviewer see the full UI shape; the
// real merge swap is one mechanical search-and-replace.
//
// Per spec §3.0.1 + §3.1 (group-dashboard-clickable-drill-downs-spec.md).
// =====================================================================

/**
 * Every drill-down metric (every clickable element) on the Group
 * Dashboard. Per spec §3.1 click-target inventory.
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

/**
 * Roles that get differentiated drill-down rendering. Per spec §3.2 —
 * one URL, three renderings.
 */
export const DRILLDOWN_ROLES = ['director', 'counselor', 'principal'] as const;

export type DrilldownRole = (typeof DRILLDOWN_ROLES)[number];

/**
 * Per-role action button options (counselor mode work-surface).
 * Spec §3.2: counselor gets Call / WhatsApp / Update Status; director +
 * principal get read-only by default.
 */
export const ACTION_BUTTON_OPTIONS = [
  { value: 'call', label: 'Call (telephony)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'update_status', label: 'Update Status' },
] as const;

export type ActionButtonValue = (typeof ACTION_BUTTON_OPTIONS)[number]['value'];

/**
 * The shape of a fully-resolved drill-down policy for one (metric, role)
 * pair. Code defaults from spec §3.1; admin UI overrides land in
 * `platform_policies` rows under the `dashboard.drilldown.*` prefix.
 */
export interface DrilldownPolicy {
  /** Where the click navigates. Inherits filters per spec §3.3. */
  destination: string;
  /** Columns shown on the destination list. */
  columns: string[];
  /** Action buttons rendered inline on each row, by viewer role. */
  actionButtonsByRole: Record<DrilldownRole, ActionButtonValue[]>;
  /** Empty-state copy (spec §3.5). */
  emptyStateCopy: string;
  /** Toggle the drill-down off entirely (cards still render but click no-ops). */
  enabled: boolean;
}

/**
 * Code-default policies — match spec §3.1 click-target inventory exactly.
 * The DB override (a `platform_policies` row) wins when present.
 *
 * NOTE: B.1 will move this to `lib/policies/dashboard-drilldown-keys.ts`
 * with the exact same shape. Reviewer should diff this against B.1's
 * version before merge.
 */
export const DRILLDOWN_DEFAULTS: Record<DrilldownMetric, DrilldownPolicy> = {
  total_leads: {
    destination: '/admission/leads',
    columns: ['name', 'status', 'institution', 'date', 'source'],
    actionButtonsByRole: {
      director: [],
      counselor: ['call', 'whatsapp', 'update_status'],
      principal: [],
    },
    emptyStateCopy: 'No leads in this admission year.',
    enabled: true,
  },
  applied: {
    destination: '/admission/leads?status=applied',
    columns: ['name', 'date_applied', 'institution', 'source'],
    actionButtonsByRole: {
      director: [],
      counselor: ['call', 'whatsapp', 'update_status'],
      principal: [],
    },
    emptyStateCopy: 'No applied leads in this admission year.',
    enabled: true,
  },
  filled: {
    destination: '/admission/leads?status=enrolled',
    columns: ['name', 'date_enrolled', 'institution', 'program'],
    actionButtonsByRole: {
      director: [],
      counselor: ['update_status'],
      principal: [],
    },
    emptyStateCopy: 'No enrolled (filled) leads in this admission year.',
    enabled: true,
  },
  rejected: {
    destination: '/admission/leads?status=rejected',
    columns: ['name', 'date_rejected', 'institution', 'reason'],
    actionButtonsByRole: {
      director: [],
      counselor: ['call', 'whatsapp', 'update_status'],
      principal: [],
    },
    emptyStateCopy: 'No rejected leads in this admission year.',
    enabled: true,
  },
  total_seats: {
    destination: '/admission/seat-configuration',
    columns: ['institution', 'program', 'total_seats', 'filled', 'balance'],
    actionButtonsByRole: {
      director: [],
      counselor: [],
      principal: [],
    },
    emptyStateCopy: 'Seat configuration not set for this admission year.',
    enabled: true,
  },
  fill_rate: {
    destination: '/admission/leads?status=enrolled&seat_filled=true',
    columns: ['name', 'institution', 'program', 'date_enrolled'],
    actionButtonsByRole: {
      director: [],
      counselor: ['update_status'],
      principal: [],
    },
    emptyStateCopy: 'No seat-filled enrollments in this admission year.',
    enabled: true,
  },
  seat_balance: {
    destination: '/admission/seat-configuration?fill_state=open',
    columns: ['institution', 'program', 'total_seats', 'filled', 'balance'],
    actionButtonsByRole: {
      director: [],
      counselor: [],
      principal: [],
    },
    emptyStateCopy: 'No open seats remaining in this admission year.',
    enabled: true,
  },
  chart_bar: {
    destination: '/admission/dashboard?institution_id={institution_id}',
    columns: ['name', 'status', 'program', 'date'],
    actionButtonsByRole: {
      director: [],
      counselor: ['call', 'whatsapp', 'update_status'],
      principal: [],
    },
    emptyStateCopy: 'No data for this institution in the selected year.',
    enabled: true,
  },
  comparison_row: {
    destination: '/admission/dashboard?institution_id={institution_id}',
    columns: ['name', 'status', 'program', 'date'],
    actionButtonsByRole: {
      director: [],
      counselor: ['call', 'whatsapp', 'update_status'],
      principal: [],
    },
    emptyStateCopy: 'No data for this institution in the selected year.',
    enabled: true,
  },
};

/**
 * Default performance budget (ms) — spec §3.7 meeting-velocity threshold.
 */
export const DEFAULT_PERFORMANCE_BUDGET_MS = 2000;

/**
 * Human-readable label for each metric, for the admin table.
 */
export const METRIC_LABELS: Record<DrilldownMetric, string> = {
  total_leads: 'Total Leads (top stat)',
  applied: 'Applied (top stat)',
  filled: 'Filled / Enrolled (top stat)',
  rejected: 'Rejected (top stat)',
  total_seats: 'Total Seats (top stat)',
  fill_rate: 'Fill Rate (top stat)',
  seat_balance: 'Seat Balance (Seat Analytics)',
  chart_bar: 'Chart bar — per institution',
  comparison_row: 'Comparison table — institution row',
};

/**
 * Convert (metric, sub-key) → the platform_policies key string.
 *
 * Schema (spec §3.0):
 *   `dashboard.drilldown.<metric>.<field>`
 *   e.g.  `dashboard.drilldown.applied.destination`
 *         `dashboard.drilldown.applied.action_buttons.counselor`
 *         `dashboard.drilldown.performance_budget_ms` (no metric)
 */
export function buildPolicyKey(
  metric: DrilldownMetric,
  field:
    | 'destination'
    | 'columns'
    | 'empty_state_copy'
    | 'enabled'
    | { kind: 'action_buttons'; role: DrilldownRole },
): string {
  if (typeof field === 'object' && field.kind === 'action_buttons') {
    return `dashboard.drilldown.${metric}.action_buttons.${field.role}`;
  }
  return `dashboard.drilldown.${metric}.${field}`;
}

export const PERFORMANCE_BUDGET_KEY =
  'dashboard.drilldown.performance_budget_ms' as const;

export const POLICY_KEY_PREFIX = 'dashboard.drilldown.' as const;
