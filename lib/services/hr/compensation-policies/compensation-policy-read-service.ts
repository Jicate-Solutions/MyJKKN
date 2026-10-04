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
// COLLEGE SCOPING IS DECIDED IN THE DATABASE, NOT HERE. The read goes through
// hr_compensation_policies(p_key), which returns one row per college the CALLER
// can access (role_has_institution_access on auth.uid(); admins see every
// college) — the same pattern as PR #4103's hr_pay_band_policies(). The
// requested college id only PICKS one of those rows; it never widens them. A
// college that is not in the list is refused out loud, never shown as empty.
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

/** The database function the read goes through (migration 20270506090000). */
export const COMPENSATION_POLICY_RPC = 'hr_compensation_policies' as const;

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

/** One row of hr_compensation_policies(): a college the caller can access. */
export interface CompensationPolicyRpcRow {
  institution_id: string;
  has_row: boolean;
  policy_value: unknown;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Why a read was refused, so the route can answer 403 rather than 500. */
export class CompensationPolicyAccessError extends Error {}

/**
 * Pick the requested college out of the colleges the database says the caller
 * can see. Pure, so the "not your college" rule is testable without a database.
 */
export function pickCollegeRow(
  rows: readonly CompensationPolicyRpcRow[],
  policyKey: CompensationPolicyReadKey,
  institutionId: string
): CompensationPolicyResponse {
  const found = rows.find((r) => r.institution_id === institutionId);
  if (!found) {
    throw new CompensationPolicyAccessError(
      'You do not have access to this college’s compensation policies.'
    );
  }
  if (!found.has_row) return { row: null };
  return {
    row: {
      policy_key: policyKey,
      value: found.policy_value,
      description: found.description,
      updated_at: found.updated_at,
      updated_by: found.updated_by,
    },
  };
}

export const CompensationPolicyReadService = {
  /**
   * Read with the caller's own session client, so auth.uid() inside the
   * database function is the caller. The route has already checked
   * `hr.payroll.salary.view`; the function checks it again and scopes by college.
   */
  async load(
    supabase: SupabaseClient,
    policyKey: CompensationPolicyReadKey,
    institutionId: string
  ): Promise<CompensationPolicyResponse> {
    const { data, error } = await supabase.rpc(COMPENSATION_POLICY_RPC, { p_key: policyKey });
    if (error) {
      if (error.code === '42501') throw new CompensationPolicyAccessError(error.message);
      throw new Error(error.message);
    }
    return pickCollegeRow((data ?? []) as CompensationPolicyRpcRow[], policyKey, institutionId);
  },
};
