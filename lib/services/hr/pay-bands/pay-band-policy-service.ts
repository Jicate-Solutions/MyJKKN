// lib/services/hr/pay-bands/pay-band-policy-service.ts
// ============================================================================
// Every college's pay band, read on the SERVER for the Pay Band Check screen.
// ============================================================================
//
// SERVER ONLY. This file is imported by app/api/hr/payroll/pay-bands/route.ts
// and by nothing that runs in the browser. The guard test
// __tests__/hr/pay-band-server-only-guard.test.ts fails if a 'use client' file
// imports it, or if the screen's own files query the band themselves.
//
// WHY IT IS NOT READ IN THE BROWSER. The band lives in the institution-scoped
// `hr.pay_scales` rows of platform_policies. That table's only SELECT policy on
// main is `auth.uid() IS NOT NULL` (20260429000002_platform_policies_substrate
// .sql), so Postgres does NOT restrict who can read a pay matrix: any signed-in
// account, a learner included, gets every college's row. The only thing that
// limits this read is the route's check of `hr.payroll.salary.view`, which is
// why the read has to sit behind that route and nowhere else. Tightening the
// table's policy is a separate, live change and is not made here.
//
// A COLLEGE IS LISTED ONLY WHEN ITS BAND HAS AT LEAST ONE USABLE RUNG — the
// same test checkPayBand applies (usablePayBandRungs). A row whose matrix is
// empty or entirely unusable is "no band", so the By-college label and the
// per-person verdict can never disagree about it.
//
// READ ONLY. There is no writer here; the band is edited on its own screen.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  usablePayBandRungs,
  type PayBandPolicy,
  type PayBandRung,
} from '@/lib/hr/pay-band-check';

/** The policy key and scope read here. Same pair the Pay Scales editor writes. */
export const PAY_BAND_POLICY_KEY = 'hr.pay_scales' as const;
const SCOPE_TYPE = 'institution';

/** One college's band as sent to the screen. */
export interface CollegePayBand {
  institutionId: string;
  policy: PayBandPolicy;
  /** When the band was last edited, for showing how current it is. */
  updatedAt: string | null;
}

/** The route's response body. An array because a Map does not survive JSON. */
export interface PayBandPoliciesResponse {
  bands: CollegePayBand[];
}

export interface PayBandPolicyRow {
  scope_id: string | null;
  value: unknown;
  updated_at: string | null;
}

/**
 * Some seeded policy shapes wrap the payload as `{ value: {...} }`. Unwrapped
 * once, exactly as useCompensationPolicy does — a second place that reads these
 * rows must not disagree with the first about what a row looks like.
 */
function unwrap(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  const outer = value as Record<string, unknown>;
  const inner = outer.value;
  if (typeof inner === 'object' && inner !== null) return inner as Record<string, unknown>;
  return outer;
}

/** A figure from hand-edited JSON. Anything unusable becomes null, never NaN. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Turn one policy row into a band.
 *
 * `pay_matrix` is trusted to be an array of objects and nothing more: every
 * field is re-read defensively because this JSON is hand-edited through a UI
 * that does not validate types, and a bad rung must drop out rather than make
 * the whole college unreadable.
 */
export function parsePayBandPolicy(value: unknown): PayBandPolicy | null {
  const body = unwrap(value);
  if (!body) return null;

  const matrix = Array.isArray(body.pay_matrix) ? body.pay_matrix : [];
  const rungs: PayBandRung[] = [];

  for (const entry of matrix) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const designation = typeof row.designation === 'string' ? row.designation : '';
    const basicPay = toNumber(row.basic_pay);
    if (designation.trim() === '' || basicPay === null) continue;
    rungs.push({
      designation,
      qualification: typeof row.qualification === 'string' ? row.qualification : null,
      basicPay,
    });
  }

  const overrides =
    typeof body.overrides === 'object' && body.overrides !== null
      ? (body.overrides as Record<string, unknown>)
      : {};

  return { rungs, guaranteedMinimum: toNumber(overrides.net_set_basic) };
}

/**
 * Turn the raw rows into the list the screen receives. Pure, so the
 * "an empty matrix means no band" rule is testable without a database.
 */
export function collegePayBandsFromRows(rows: readonly PayBandPolicyRow[]): CollegePayBand[] {
  const bands: CollegePayBand[] = [];
  for (const raw of rows) {
    if (!raw.scope_id) continue;
    const policy = parsePayBandPolicy(raw.value);
    if (!policy) continue;
    if (usablePayBandRungs(policy).length === 0) continue;
    bands.push({ institutionId: raw.scope_id, policy, updatedAt: raw.updated_at });
  }
  return bands;
}

export const PayBandPolicyService = {
  /**
   * Read every recorded band with the caller's own session client. The caller
   * must already have checked `hr.payroll.salary.view`: RLS on
   * platform_policies adds nothing here (see the header).
   */
  async load(supabase: SupabaseClient): Promise<PayBandPoliciesResponse> {
    const { data, error } = await supabase
      .from('platform_policies')
      .select('scope_id, value, updated_at')
      .eq('policy_key', PAY_BAND_POLICY_KEY)
      .eq('scope_type', SCOPE_TYPE);

    if (error) throw new Error(error.message);

    return { bands: collegePayBandsFromRows((data ?? []) as PayBandPolicyRow[]) };
  },
};
