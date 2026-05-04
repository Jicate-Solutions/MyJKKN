/**
 * Drilldown policy service — local to /admin/dashboard-drilldowns.
 *
 * Reads + writes `platform_policies` rows where
 * `policy_key LIKE 'dashboard.drilldown.%'`. Mirrors the nav-overrides
 * service pattern (see lib/services/admin/admin-nav-overrides-service.ts):
 * direct PostgREST table writes gated by the existing super_admin RLS on
 * `platform_policies` — no new admin RPC needed.
 *
 * The merge of (DB override) → (code default from drilldown-defaults.ts)
 * is done at read time in the table component. DB row absent ⇒ default
 * applies. DB row present ⇒ that field overrides only the field it sets.
 *
 * NOTE: lives under `_components/` because it's used only by this page;
 * if a second consumer arrives (e.g. the dashboard itself reading these
 * to wire B.2), promote to `lib/services/admin/`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

import {
  DRILLDOWN_DEFAULTS,
  DRILLDOWN_METRICS,
  DEFAULT_PERFORMANCE_BUDGET_MS,
  PERFORMANCE_BUDGET_KEY,
  POLICY_KEY_PREFIX,
  buildPolicyKey,
  type ActionButtonValue,
  type DrilldownMetric,
  type DrilldownPolicy,
  type DrilldownRole,
} from './drilldown-defaults';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One row from `platform_policies` filtered to our prefix. Shape matches
 * the existing platform_policies columns so we can read with the same
 * select used by sister admin pages.
 */
interface RawPolicyRow {
  id: string;
  policy_key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

/**
 * The fully-resolved drill-down policy for one metric. `overrides` lists
 * which fields are set in the DB (so the UI can show "default" vs
 * "override" badges); `policy` is the merged result (DB wins per field).
 */
export interface ResolvedDrilldownRow {
  metric: DrilldownMetric;
  policy: DrilldownPolicy;
  /**
   * Set of fields that came from the DB (not the code default). Used to
   * render the "Current Override" column visually.
   */
  overriddenFields: Set<string>;
  /**
   * Map from policy_key → row id, so the UI can issue per-key DELETEs
   * when the user clicks "Reset to default".
   */
  rowIdsByKey: Record<string, string>;
  /** Last updated_at across all DB rows for this metric. */
  lastUpdated: string | null;
}

export interface ResolvedDrilldownState {
  rows: ResolvedDrilldownRow[];
  performanceBudgetMs: number;
  performanceBudgetOverridden: boolean;
  performanceBudgetRowId: string | null;
  performanceBudgetUpdatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const QUERY_KEY = ['admin', 'dashboard-drilldowns'] as const;

/**
 * Parse a policy_key like `dashboard.drilldown.applied.destination` into
 * its parts. Returns null if the key is malformed (defensive — strange
 * keys are dropped from the merge).
 */
interface ParsedKey {
  metric: DrilldownMetric;
  field:
    | 'destination'
    | 'columns'
    | 'empty_state_copy'
    | 'enabled'
    | { kind: 'action_buttons'; role: DrilldownRole };
}

const VALID_FIELDS = new Set([
  'destination',
  'columns',
  'empty_state_copy',
  'enabled',
]);

const VALID_ROLES = new Set<DrilldownRole>([
  'director',
  'counselor',
  'principal',
]);

const VALID_METRICS = new Set<DrilldownMetric>(DRILLDOWN_METRICS);

function parsePolicyKey(policyKey: string): ParsedKey | null {
  if (!policyKey.startsWith(POLICY_KEY_PREFIX)) return null;
  const tail = policyKey.slice(POLICY_KEY_PREFIX.length);
  // performance_budget_ms is handled separately
  if (tail === 'performance_budget_ms') return null;

  const parts = tail.split('.');
  if (parts.length < 2) return null;

  const metric = parts[0] as DrilldownMetric;
  if (!VALID_METRICS.has(metric)) return null;

  // dashboard.drilldown.<metric>.<simple_field>
  if (parts.length === 2 && VALID_FIELDS.has(parts[1])) {
    return {
      metric,
      field: parts[1] as ParsedKey['field'],
    };
  }
  // dashboard.drilldown.<metric>.action_buttons.<role>
  if (parts.length === 3 && parts[1] === 'action_buttons') {
    const role = parts[2] as DrilldownRole;
    if (!VALID_ROLES.has(role)) return null;
    return {
      metric,
      field: { kind: 'action_buttons', role },
    };
  }
  return null;
}

/**
 * Build the merged state from the raw rows + code defaults.
 */
function mergeRowsWithDefaults(rows: RawPolicyRow[]): ResolvedDrilldownState {
  // Seed every metric with its code default (deep-cloned so per-row
  // mutations don't bleed across metrics).
  const merged = new Map<DrilldownMetric, ResolvedDrilldownRow>();
  for (const metric of DRILLDOWN_METRICS) {
    const def = DRILLDOWN_DEFAULTS[metric];
    merged.set(metric, {
      metric,
      policy: {
        destination: def.destination,
        columns: [...def.columns],
        actionButtonsByRole: {
          director: [...def.actionButtonsByRole.director],
          counselor: [...def.actionButtonsByRole.counselor],
          principal: [...def.actionButtonsByRole.principal],
        },
        emptyStateCopy: def.emptyStateCopy,
        enabled: def.enabled,
      },
      overriddenFields: new Set<string>(),
      rowIdsByKey: {},
      lastUpdated: null,
    });
  }

  let performanceBudgetMs = DEFAULT_PERFORMANCE_BUDGET_MS;
  let performanceBudgetOverridden = false;
  let performanceBudgetRowId: string | null = null;
  let performanceBudgetUpdatedAt: string | null = null;

  for (const row of rows) {
    if (row.policy_key === PERFORMANCE_BUDGET_KEY) {
      const v = row.value;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        performanceBudgetMs = v;
        performanceBudgetOverridden = true;
        performanceBudgetRowId = row.id;
        performanceBudgetUpdatedAt = row.updated_at;
      }
      continue;
    }

    const parsed = parsePolicyKey(row.policy_key);
    if (!parsed) {
      logger.warn(
        'admin/dashboard-drilldowns',
        `Ignoring unrecognized policy_key under prefix: ${row.policy_key}`,
      );
      continue;
    }
    const target = merged.get(parsed.metric);
    if (!target) continue;

    target.rowIdsByKey[row.policy_key] = row.id;
    if (
      row.updated_at &&
      (!target.lastUpdated || row.updated_at > target.lastUpdated)
    ) {
      target.lastUpdated = row.updated_at;
    }

    const v = row.value;
    if (typeof parsed.field === 'string') {
      switch (parsed.field) {
        case 'destination':
          if (typeof v === 'string') {
            target.policy.destination = v;
            target.overriddenFields.add('destination');
          }
          break;
        case 'empty_state_copy':
          if (typeof v === 'string') {
            target.policy.emptyStateCopy = v;
            target.overriddenFields.add('empty_state_copy');
          }
          break;
        case 'columns':
          if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
            target.policy.columns = v as string[];
            target.overriddenFields.add('columns');
          }
          break;
        case 'enabled':
          if (typeof v === 'boolean') {
            target.policy.enabled = v;
            target.overriddenFields.add('enabled');
          }
          break;
      }
    } else {
      // action_buttons.<role>
      const role = parsed.field.role;
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        target.policy.actionButtonsByRole[role] = v as ActionButtonValue[];
        target.overriddenFields.add(`action_buttons.${role}`);
      }
    }
  }

  return {
    rows: Array.from(merged.values()),
    performanceBudgetMs,
    performanceBudgetOverridden,
    performanceBudgetRowId,
    performanceBudgetUpdatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DashboardDrilldownService {
  /**
   * Fetch every `dashboard.drilldown.*` row, merged with code defaults.
   * Fail-soft: on error, returns the all-defaults state per spec §3.0.1.
   */
  static async list(): Promise<ResolvedDrilldownState> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value, description, updated_at')
        .like('policy_key', `${POLICY_KEY_PREFIX}%`)
        .eq('scope_type', 'global')
        .is('scope_id', null);

      if (error) {
        logger.error(
          'admin/dashboard-drilldowns',
          'Failed to fetch drill-down policies; falling back to code defaults',
          error,
        );
        return mergeRowsWithDefaults([]);
      }

      return mergeRowsWithDefaults((data ?? []) as RawPolicyRow[]);
    } catch (e) {
      logger.error(
        'admin/dashboard-drilldowns',
        'Unexpected error in list(); falling back to code defaults',
        e,
      );
      return mergeRowsWithDefaults([]);
    }
  }

  /**
   * Upsert one policy_key with a fresh value. Inserts when no row exists
   * for the (key, scope_type=global, scope_id IS NULL) tuple, otherwise
   * updates the existing row.
   */
  static async upsertField(
    policyKey: string,
    value: unknown,
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: existing, error: selectError } = await supabase
      .from('platform_policies')
      .select('id')
      .eq('policy_key', policyKey)
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .maybeSingle();

    if (selectError) {
      logger.error(
        'admin/dashboard-drilldowns',
        `Lookup failed for ${policyKey}`,
        selectError,
      );
      throw selectError;
    }

    if (existing) {
      const { error } = await supabase
        .from('platform_policies')
        .update({
          value,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        logger.error(
          'admin/dashboard-drilldowns',
          `Update failed for ${policyKey}`,
          error,
        );
        throw error;
      }
      return;
    }

    const dataType = inferDataType(value);
    const { error } = await supabase.from('platform_policies').insert({
      policy_key: policyKey,
      scope_type: 'global',
      scope_id: null,
      value,
      data_type: dataType,
      description: `Override for drill-down policy key ${policyKey}`,
      is_system: false,
      is_active: true,
      updated_by: user?.id ?? null,
    });
    if (error) {
      logger.error(
        'admin/dashboard-drilldowns',
        `Insert failed for ${policyKey}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete a single override row by id. The code default re-applies on
   * the next read.
   */
  static async resetField(rowId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('platform_policies')
      .delete()
      .eq('id', rowId);
    if (error) {
      logger.error(
        'admin/dashboard-drilldowns',
        `Delete failed for row ${rowId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete every override for the given metric in one round-trip. Used
   * by the row-level "Reset to defaults" action.
   */
  static async resetMetric(rowIds: string[]): Promise<void> {
    if (rowIds.length === 0) return;
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('platform_policies')
      .delete()
      .in('id', rowIds);
    if (error) {
      logger.error(
        'admin/dashboard-drilldowns',
        `Bulk delete failed for ${rowIds.length} rows`,
        error,
      );
      throw error;
    }
  }
}

function inferDataType(value: unknown): string {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'integer';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  return 'object';
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

export function useDrilldownPolicies(): UseQueryResult<
  ResolvedDrilldownState,
  Error
> {
  return useQuery<ResolvedDrilldownState, Error>({
    queryKey: QUERY_KEY,
    queryFn: () => DashboardDrilldownService.list(),
    staleTime: 30 * 1000, // 30s — overrides change rarely; matches nav-overrides
  });
}

export interface UpsertFieldArgs {
  policyKey: string;
  value: unknown;
}

export function useUpsertDrilldownField(): UseMutationResult<
  void,
  Error,
  UpsertFieldArgs
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpsertFieldArgs>({
    mutationFn: ({ policyKey, value }) =>
      DashboardDrilldownService.upsertField(policyKey, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useResetDrilldownField(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (rowId) => DashboardDrilldownService.resetField(rowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useResetDrilldownMetric(): UseMutationResult<
  void,
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string[]>({
    mutationFn: (rowIds) => DashboardDrilldownService.resetMetric(rowIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// Re-export the policy-key builder for the editor component.
export { buildPolicyKey, PERFORMANCE_BUDGET_KEY };
