// lib/services/internships/policy-service.ts
// Wraps fn_internship_evaluate_policy and fn_internship_cascade_preview RPCs.
// Signatures match the as-applied migration 20260509_internship_module_reader_fn_v2.sql.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipPolicyValue,
  CascadePreviewChange,
  CascadePreviewResult,
  ServiceResult,
} from './types';

/**
 * Resolve the effective policy value for a key, optionally scoped to a college.
 * Calls fn_internship_evaluate_policy(p_key TEXT, p_context JSONB) — context carries
 * { college_id, institution_id } so the SQL function can do the 3-level cascade
 * (college_override > institution_policy > global_policy).
 *
 * Returns InternshipPolicyValue with the resolved JSON value + source label.
 */
export async function getPolicyValue(
  supabase: SupabaseClient,
  key: string,
  collegeId?: string | null,
  institutionId?: string | null
): Promise<ServiceResult<InternshipPolicyValue>> {
  const context: Record<string, string> = {};
  if (collegeId) context.college_id = collegeId;
  if (institutionId) context.institution_id = institutionId;

  const { data, error } = await supabase.rpc('fn_internship_evaluate_policy', {
    p_key: key,
    p_context: context,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // fn_internship_evaluate_policy returns a single jsonb object
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { data: null, error: new Error(`No policy found for key: ${key}`) };
  }

  // Map SQL `source` ('global_policy' | 'institution_policy' | 'college_override' | 'not_found')
  // to the typed enum ('global' | 'college_override').
  const sqlSource: string = row.source ?? 'not_found';
  const mappedSource: InternshipPolicyValue['source'] =
    sqlSource === 'college_override' ? 'college_override' : 'global';

  const result: InternshipPolicyValue = {
    key,
    value: row.resolved_value ?? null,
    college_id: row.college_id ?? collegeId ?? null,
    source: mappedSource,
    audit_trail: [],
  };

  return { data: result, error: null };
}

/**
 * Preview the English-language consequences of a batch of policy changes
 * before committing them. Calls fn_internship_cascade_preview(p_changes JSONB).
 *
 * The SQL function expects each change as { policy_key, new_value, old_value }.
 * We accept CascadePreviewChange ({ key, new_value, college_id }) and translate
 * `key -> policy_key` so existing call-sites don't break.
 */
export async function getCascadePreview(
  supabase: SupabaseClient,
  changes: CascadePreviewChange[]
): Promise<ServiceResult<CascadePreviewResult>> {
  const sqlChanges = changes.map((c) => ({
    policy_key: c.key,
    new_value: c.new_value,
    college_id: c.college_id ?? null,
  }));

  const { data, error } = await supabase.rpc('fn_internship_cascade_preview', {
    p_changes: sqlChanges,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // fn_internship_cascade_preview returns a single jsonb object with
  // { summary, consequences[], total_affected_assignments, total_affected_colleges, changes_count }
  const row = Array.isArray(data) ? data[0] : data;

  // Flatten consequence sentences for the typed return.
  const consequenceSentences: string[] = Array.isArray(row?.consequences)
    ? row.consequences
        .map((c: { sentence?: string }) => c?.sentence)
        .filter((s: string | undefined): s is string => typeof s === 'string')
    : [];

  const result: CascadePreviewResult = {
    consequences: consequenceSentences,
    affected_rows: row?.total_affected_assignments ?? null,
  };

  return { data: result, error: null };
}
