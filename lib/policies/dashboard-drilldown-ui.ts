/**
 * Dashboard Drill-Down — UI adapter.
 *
 * Why this file exists:
 *   The canonical lib (`./dashboard-drilldown-keys.ts`, B.1 / PR #705) keeps
 *   a FLAT record — one entry per fully-qualified policy key
 *   `dashboard.drilldown.<metric>.<aspect>[.<role>]`. That shape mirrors the
 *   `platform_policies` row contract (one row per key) and is what gets read
 *   / written / seeded to the DB.
 *
 *   The admin UI (`/admin/dashboard-drilldowns`) needs a NESTED shape
 *   (`Record<DrilldownMetric, DrilldownPolicy>`) — one object per metric
 *   bundling destination, columns, action buttons by role, etc. That shape
 *   makes table rendering, the per-metric editor sheet, and reset semantics
 *   readable.
 *
 *   This adapter derives the nested shape from the flat record at
 *   module-load time so the two cannot drift. The flat record is the source
 *   of truth — when canonical changes, nested follows automatically.
 *
 *   It also re-exports the small set of UI-only symbols that previously
 *   lived in the local stub `_components/drilldown-defaults.ts`:
 *   `DrilldownPolicy`, `ACTION_BUTTON_OPTIONS`, `METRIC_LABELS`,
 *   `DEFAULT_PERFORMANCE_BUDGET_MS`, `PERFORMANCE_BUDGET_KEY`,
 *   `POLICY_KEY_PREFIX`, `buildPolicyKey()`. None of these belong in the
 *   canonical lib because none of them are part of the DB row contract;
 *   they are UI-render concerns.
 *
 * Spec: group-dashboard-clickable-drill-downs-spec.md §3.0 / §3.1.
 * Standing rule: feedback_policy_decisions_must_be_config_rows.md.
 */

import {
  DRILLDOWN_DEFAULTS,
  DRILLDOWN_METRICS,
  DRILLDOWN_ROLES,
  type DrilldownMetric,
  type DrilldownRole,
} from './dashboard-drilldown-keys';

// Re-export the flat-contract types so the admin UI imports everything from
// one place (this adapter) rather than reaching back into canonical.
export {
  DRILLDOWN_METRICS,
  DRILLDOWN_ROLES,
  type DrilldownMetric,
  type DrilldownRole,
};

// ---------------------------------------------------------------------------
// UI-only constants
// ---------------------------------------------------------------------------

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

/** Default performance budget (ms) — spec §3.7 meeting-velocity threshold. */
export const DEFAULT_PERFORMANCE_BUDGET_MS = 2000;

/** Global policy key for the performance budget (no metric segment). */
export const PERFORMANCE_BUDGET_KEY =
  'dashboard.drilldown.performance_budget_ms' as const;

/** Prefix used by every drill-down policy_key in `platform_policies`. */
export const POLICY_KEY_PREFIX = 'dashboard.drilldown.' as const;

// ---------------------------------------------------------------------------
// UI-only types
// ---------------------------------------------------------------------------

/**
 * The shape of a fully-resolved drill-down policy for one metric. Used by
 * the admin table render, the editor sheet, and the policy service that
 * merges DB overrides on top of code defaults.
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

// ---------------------------------------------------------------------------
// Flat-to-nested deriver
// ---------------------------------------------------------------------------

/**
 * Re-shape the canonical FLAT defaults record into the nested per-metric
 * shape the admin UI consumes. Runs once at module-load. Because this is
 * derived (not duplicated), the two shapes cannot drift: when canonical
 * changes, every consumer sees the new value automatically.
 *
 * Action button values in canonical are typed as `string[]` (the lib value
 * union accepts any string array); the UI narrows those to
 * `ActionButtonValue[]`. We assert the cast inside the deriver because the
 * canonical defaults are spec-aligned and only contain valid values; if a
 * future change introduces an unknown value, `ACTION_BUTTON_OPTIONS` is the
 * place to add it.
 */
function flatToNested(): Record<DrilldownMetric, DrilldownPolicy> {
  const out = {} as Record<DrilldownMetric, DrilldownPolicy>;
  for (const metric of DRILLDOWN_METRICS) {
    out[metric] = {
      destination: DRILLDOWN_DEFAULTS[
        `dashboard.drilldown.${metric}.destination`
      ] as string,
      columns: DRILLDOWN_DEFAULTS[
        `dashboard.drilldown.${metric}.columns`
      ] as string[],
      actionButtonsByRole: {
        director: DRILLDOWN_DEFAULTS[
          `dashboard.drilldown.${metric}.action_buttons.director`
        ] as ActionButtonValue[],
        counselor: DRILLDOWN_DEFAULTS[
          `dashboard.drilldown.${metric}.action_buttons.counselor`
        ] as ActionButtonValue[],
        principal: DRILLDOWN_DEFAULTS[
          `dashboard.drilldown.${metric}.action_buttons.principal`
        ] as ActionButtonValue[],
      },
      emptyStateCopy: DRILLDOWN_DEFAULTS[
        `dashboard.drilldown.${metric}.empty_state_copy`
      ] as string,
      enabled: DRILLDOWN_DEFAULTS[
        `dashboard.drilldown.${metric}.enabled`
      ] as boolean,
    };
  }
  return out;
}

/**
 * Nested per-metric defaults — derived from the canonical FLAT record. This
 * is the value the admin UI table, editor, and service consume.
 *
 * Re-exported as `DRILLDOWN_DEFAULTS` for source-compat with the deleted
 * stub (see admin UI imports). Both names point at the same object.
 */
export const DRILLDOWN_DEFAULTS_NESTED: Record<DrilldownMetric, DrilldownPolicy> =
  flatToNested();

/**
 * Source-compat alias. The deleted stub exported its nested record as
 * `DRILLDOWN_DEFAULTS`; the canonical lib uses that name for its FLAT
 * record. Inside the admin UI we want the nested shape, so we expose the
 * nested record under the historical name. (The flat `DRILLDOWN_DEFAULTS`
 * is still importable from `./dashboard-drilldown-keys` directly.)
 */
export { DRILLDOWN_DEFAULTS_NESTED as DRILLDOWN_DEFAULTS };

// ---------------------------------------------------------------------------
// Key builder
// ---------------------------------------------------------------------------

/**
 * Convert (metric, sub-key) → the platform_policies key string.
 *
 * Schema (spec §3.0):
 *   `dashboard.drilldown.<metric>.<field>`
 *   e.g.  `dashboard.drilldown.applied.destination`
 *         `dashboard.drilldown.applied.action_buttons.counselor`
 *         `dashboard.drilldown.performance_budget_ms` (no metric — global)
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
