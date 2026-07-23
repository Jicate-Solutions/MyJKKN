/**
 * useClinicalReasoningPolicies
 * ============================================================================
 *
 * Reads + writes the 8 `clinical_reasoning.*` rows in `platform_policies` for
 * the TypedWidgetPolicyEditor.
 *
 * Read: direct table query (the rows are needed in full — value + ui_widget +
 * ui_options + ui_consequence + ui_cascade + ui_category — which the
 * `fn_get_policy_clinical_reasoning` RPC doesn't return). The RPC stays for
 * server-side typed reads (coach + scoring service).
 *
 * Write: single-row UPDATE on `value`, `updated_by`, `updated_at` keyed by
 * `policy_key` + `scope_type='global'`. Mirrors the audit pattern used by
 * `ScoringPolicyEditor`.
 *
 * Caller scope: Director + institution_admin only — page-level
 * `<SuperAdminOnly>` guard enforces this.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ----------------------------------------------------------------------------
// Shape returned by the platform_policies row for the typed-widget UI.
// ----------------------------------------------------------------------------

export interface UICascadeEntry {
  effect: string;
  severity: 'low' | 'medium' | 'high';
}

export interface UIDropdownOption {
  value: string;
  label: string;
}

export type UIWidgetKind =
  | 'number'
  | 'dropdown'
  | 'textarea'
  | 'toggle'
  | 'multi_select'
  | 'text'
  | 'json';

export interface ClinicalReasoningPolicyRow {
  id: string;
  policy_key: string;
  value: unknown;
  description: string | null;
  data_type: string;
  ui_widget: UIWidgetKind | null;
  ui_options: UIDropdownOption[] | null;
  ui_consequence: string | null;
  ui_cascade: UICascadeEntry[] | null;
  ui_category: string | null;
}

const POLICY_NAMESPACE = 'clinical_reasoning.';

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export interface UseClinicalReasoningPoliciesResult {
  rows: ClinicalReasoningPolicyRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  savePolicy: (policyKey: string, newValue: unknown) => Promise<void>;
  groupedByCategory: Map<string, ClinicalReasoningPolicyRow[]>;
}

export function useClinicalReasoningPolicies(): UseClinicalReasoningPoliciesResult {
  const [rows, setRows] = useState<ClinicalReasoningPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select(
          'id, policy_key, value, description, data_type, ui_widget, ui_options, ui_consequence, ui_cascade, ui_category',
        )
        .like('policy_key', `${POLICY_NAMESPACE}%`)
        .eq('scope_type', 'global')
        .eq('is_active', true)
        .order('ui_category', { ascending: true })
        .order('policy_key', { ascending: true });
      if (fetchErr) throw fetchErr;
      setRows((data || []) as unknown as ClinicalReasoningPolicyRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const savePolicy = useCallback(
    async (policyKey: string, newValue: unknown) => {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: updErr } = await supabase
        .from('platform_policies')
        .update({
          value: newValue as never,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'global');
      if (updErr) throw new Error(updErr.message);

      // Optimistic local update
      setRows((prev) =>
        prev.map((r) => (r.policy_key === policyKey ? { ...r, value: newValue } : r)),
      );
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ClinicalReasoningPolicyRow[]>();
    for (const r of rows) {
      const cat = r.ui_category ?? 'Uncategorized';
      const bucket = map.get(cat) ?? [];
      bucket.push(r);
      map.set(cat, bucket);
    }
    return map;
  }, [rows]);

  return { rows, loading, error, reload, savePolicy, groupedByCategory };
}
