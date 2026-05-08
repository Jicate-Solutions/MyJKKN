// lib/services/internships/policy-service.ts
// Wraps fn_internship_evaluate_policy and fn_internship_cascade_preview RPCs.
// TODO: Replace RPC function signatures with actual names from Agent A's migration.
//       Current names are spec-defined placeholders.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipPolicyValue,
  CascadePreviewChange,
  CascadePreviewResult,
  ServiceResult,
} from './types';

/**
 * Resolve the effective policy value for a key, optionally scoped to a college.
 * Calls fn_internship_evaluate_policy(p_key, p_college_id).
 * Returns the resolved value + a cascade audit trail showing which level set it.
 *
 * TODO: Replace RPC name after Agent A confirms fn_internship_evaluate_policy exists.
 */
export async function getPolicyValue(
  supabase: SupabaseClient,
  key: string,
  collegeId?: string | null
): Promise<ServiceResult<InternshipPolicyValue>> {
  const { data, error } = await supabase.rpc('fn_internship_evaluate_policy', {
    p_key: key,
    p_college_id: collegeId ?? null,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // fn_internship_evaluate_policy returns a single row
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { data: null, error: new Error(`No policy found for key: ${key}`) };
  }

  const result: InternshipPolicyValue = {
    key,
    value: row.resolved_value ?? null,
    college_id: collegeId ?? null,
    source: row.source ?? 'global',
    audit_trail: row.audit_trail ?? [],
  };

  return { data: result, error: null };
}

/**
 * Preview the English-language consequences of a batch of policy changes
 * before committing them. Calls fn_internship_cascade_preview(changes jsonb).
 *
 * TODO: Replace RPC name after Agent A confirms fn_internship_cascade_preview exists.
 */
export async function getCascadePreview(
  supabase: SupabaseClient,
  changes: CascadePreviewChange[]
): Promise<ServiceResult<CascadePreviewResult>> {
  const { data, error } = await supabase.rpc('fn_internship_cascade_preview', {
    p_changes: changes,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const result: CascadePreviewResult = {
    consequences: row?.consequences ?? [],
    affected_rows: row?.affected_rows ?? null,
  };

  return { data: result, error: null };
}
