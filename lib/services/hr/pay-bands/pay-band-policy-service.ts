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
 * The rungs a college's year ladders imply, used ONLY when the college has no
 * pay matrix at all (no `pay_matrix` entries).
 *
 * The Pay Scales screen stores the reference year ladders additively as
 * `ladders` in the same `hr.pay_scales` row (types/hr-pay-ladders.ts): one
 * ladder per job title + qualification, each a list of `{label, basic_pay}`
 * steps. Every step becomes one rung, so the band for a title spans its first
 * year to its last. Arts & Science is the case this exists for: its row starts
 * with an empty `pay_matrix`, and without this the ladders loaded there would
 * leave it with "no band" for the check and the salary suggestion.
 *
 * REFERENCE ONLY (Director ruling 18 Sep 2026). The band read from ladders is
 * advisory: the Pay Band Check verdict, the salary suggestion and the raise
 * warning are the only readers, each says the band came from the reference
 * ladders, and none of them writes a salary. Payroll never reads `ladders`.
 *
 * Fallback, never a union: a college with ANY pay-matrix entry (Engineering,
 * Dental) keeps exactly the band its matrix gives, usable or not, so loading
 * ladders there changes no verdict, and zeroing a matrix entry does not switch
 * the college over to the ladders.
 *
 * RIVAL VERSIONS ARE LEFT OUT. Two ladders for the same job title and
 * qualification are rival versions of one scale (the workbook's 13,000 and
 * 15,000 Science & Humanities scales; neither is marked current). Neither
 * feeds the band, so two disagreeing figures are never merged into one span.
 * Re-read as defensively as the matrix.
 */
function ladderKey(designation: string, qualification: string | null): string {
  return `${designation.trim().toLowerCase()}|${(qualification ?? '').trim().toLowerCase()}`;
}

function rungsFromLadders(ladders: unknown): PayBandRung[] {
  if (!Array.isArray(ladders)) return [];
  const usable: { designation: string; qualification: string | null; steps: unknown[] }[] = [];
  const seen = new Map<string, number>();
  for (const entry of ladders) {
    if (typeof entry !== 'object' || entry === null) continue;
    const ladder = entry as Record<string, unknown>;
    const designation = typeof ladder.designation === 'string' ? ladder.designation : '';
    if (designation.trim() === '' || !Array.isArray(ladder.steps)) continue;
    const qualification = typeof ladder.qualification === 'string' ? ladder.qualification : null;
    const key = ladderKey(designation, qualification);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    usable.push({ designation, qualification, steps: ladder.steps });
  }
  const rungs: PayBandRung[] = [];
  for (const { designation, qualification, steps } of usable) {
    if ((seen.get(ladderKey(designation, qualification)) ?? 0) > 1) continue;
    for (const step of steps) {
      if (typeof step !== 'object' || step === null) continue;
      const basicPay = toNumber((step as Record<string, unknown>).basic_pay);
      if (basicPay === null) continue;
      rungs.push({ designation, qualification, basicPay });
    }
  }
  return rungs;
}

/**
 * Turn one policy row into a band.
 *
 * `pay_matrix` is trusted to be an array of objects and nothing more: every
 * field is re-read defensively because this JSON is hand-edited through a UI
 * that does not validate types, and a bad rung must drop out rather than make
 * the whole college unreadable. When the college has no matrix entry at all,
 * its reference year ladders are read instead (rungsFromLadders), and the
 * policy is marked `fromReferenceLadders`.
 */
export function parsePayBandPolicy(value: unknown): PayBandPolicy | null {
  const body = unwrap(value);
  if (!body) return null;

  const matrix = Array.isArray(body.pay_matrix) ? body.pay_matrix : [];
  let rungs: PayBandRung[] = [];

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

  // No pay matrix at all: read the reference ladders instead, and say so.
  let fromReferenceLadders = false;
  if (matrix.length === 0) {
    rungs = rungsFromLadders(body.ladders);
    fromReferenceLadders = rungs.length > 0;
  }

  const overrides =
    typeof body.overrides === 'object' && body.overrides !== null
      ? (body.overrides as Record<string, unknown>)
      : {};

  return {
    rungs,
    guaranteedMinimum: toNumber(overrides.net_set_basic),
    ...(fromReferenceLadders ? { fromReferenceLadders: true } : {}),
  };
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
