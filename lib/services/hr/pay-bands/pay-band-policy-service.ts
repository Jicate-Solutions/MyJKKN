// lib/services/hr/pay-bands/pay-band-policy-service.ts
// ============================================================================
// Every college's pay band, read on the SERVER for the Pay Band Check screen.
// ============================================================================
//
// SERVER ONLY, enforced twice: `import 'server-only'` makes a client bundle
// that reaches this file fail to build, and the guard test
// __tests__/hr/pay-band-server-only-guard.test.ts fails if a 'use client' file
// imports it, or if the screen's own files query the band themselves.
//
// WHY IT IS NOT A TABLE READ. The band lives in the institution-scoped
// `hr.pay_scales` rows of platform_policies. That table's only SELECT policy on
// main is `auth.uid() IS NOT NULL` (20260429000002_platform_policies_substrate
// .sql), so a plain SELECT returns every college's pay matrix to any signed-in
// account. The read therefore goes through hr_pay_band_policies()
// (20270416120000_hr_pay_band_policies_rpc.sql), which does in the database what
// hr_staff_salary_directory() does for the people on the same screen:
//   - RAISES insufficient_privilege without `hr.payroll.salary.view`;
//   - returns only the colleges role_has_institution_access() admits, judged on
//     the caller's own auth.uid(). An own-college role holding the key sees its
//     own college's band and nobody else's.
// The client passed in MUST be the caller's session client. No college id is
// taken from the request; the database decides which colleges come back.
// Tightening the table's own policy is a separate, live change and is not
// made here.
//
// A COLLEGE IS LISTED ONLY WHEN ITS BAND HAS AT LEAST ONE USABLE RUNG — the
// same test checkPayBand applies (usablePayBandRungs). A row whose matrix is
// empty or entirely unusable is "no band", so the By-college label and the
// per-person verdict can never disagree about it.
//
// READ ONLY. There is no writer here; the band is edited on its own screen.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  usablePayBandRungs,
  type PayBandPolicy,
  type PayBandRung,
} from '@/lib/hr/pay-band-check';

/**
 * The database function that returns the caller's bands. It reads the
 * institution-scoped `hr.pay_scales` rows the Pay Scales editor writes.
 */
export const PAY_BAND_RPC = 'hr_pay_band_policies' as const;

/** Postgres' insufficient_privilege, raised by the RPC when the key is missing. */
export const INSUFFICIENT_PRIVILEGE = '42501';

/** A refusal from the database, kept distinct so the route can answer 403, not 500. */
export class PayBandAccessError extends Error {}

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

/** One row of hr_pay_band_policies(). */
interface PayBandRpcRow {
  institution_id: string | null;
  band: unknown;
  band_updated_at: string | null;
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
   * The bands for the colleges the caller may see, read with the caller's own
   * session client so the database judges scope on their auth.uid(). Throws
   * PayBandAccessError when the database refuses the key.
   */
  async load(supabase: SupabaseClient): Promise<PayBandPoliciesResponse> {
    const { data, error } = await supabase.rpc(PAY_BAND_RPC);

    if (error) {
      if (error.code === INSUFFICIENT_PRIVILEGE) throw new PayBandAccessError(error.message);
      throw new Error(error.message);
    }

    const rows: PayBandPolicyRow[] = ((data ?? []) as PayBandRpcRow[]).map((r) => ({
      scope_id: r.institution_id,
      value: r.band,
      updated_at: r.band_updated_at,
    }));
    return { bands: collegePayBandsFromRows(rows) };
  },
};
