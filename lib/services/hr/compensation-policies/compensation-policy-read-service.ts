// lib/services/hr/compensation-policies/compensation-policy-read-service.ts
// ============================================================================
// One college's compensation policy row, read on the SERVER.
// ============================================================================
//
// SERVER ONLY. Imported by app/api/hr/compensation-policies/route.ts and by
// nothing that runs in the browser (the guard test
// __tests__/hr/pay-policies-server-only-guard.test.ts fails otherwise).
//
// WHY. `hr.pay_scales` and `hr.allowances_and_increments` hold every college's
// pay matrix and allowance amounts. The Pay Scales, Allowances and Motivation
// Fund editors used to read them from the browser, which only worked because
// platform_policies let any signed-in account read any row. Migration
// 20270506090000 closes that at the database; this reader lets the editors keep
// working behind a route that checks `hr.payroll.salary.view` first.
//
// READ ONLY. The editors still SAVE from the browser under the existing admin
// UPDATE policy on platform_policies; that path is unchanged.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** The only keys this reader will serve. Anything else is refused, so the route
 * can never become a general-purpose policy reader. */
export const COMPENSATION_POLICY_READ_KEYS = [
  'hr.pay_scales',
  'hr.allowances_and_increments',
  'hr.motivation_fund',
] as const;

export type CompensationPolicyReadKey = (typeof COMPENSATION_POLICY_READ_KEYS)[number];

export function isCompensationPolicyReadKey(key: string | null): key is CompensationPolicyReadKey {
  return key !== null && (COMPENSATION_POLICY_READ_KEYS as readonly string[]).includes(key);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null): value is string {
  return value !== null && UUID_RE.test(value);
}

/** The row as the editors already expected it. `null` = the college has no row. */
export interface CompensationPolicyRow {
  policy_key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CompensationPolicyResponse {
  row: CompensationPolicyRow | null;
}

export const CompensationPolicyReadService = {
  /**
   * Read one institution-scoped row with the caller's own session client. The
   * caller (the route) has already checked `hr.payroll.salary.view`; RLS on
   * platform_policies applies the same rule again underneath.
   */
  async load(
    supabase: SupabaseClient,
    policyKey: CompensationPolicyReadKey,
    institutionId: string
  ): Promise<CompensationPolicyResponse> {
    const { data, error } = await supabase
      .from('platform_policies')
      .select('policy_key, value, description, updated_at, updated_by')
      .eq('policy_key', policyKey)
      .eq('scope_type', 'institution')
      .eq('scope_id', institutionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { row: (data as CompensationPolicyRow | null) ?? null };
  },
};
