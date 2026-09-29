'use client';

/**
 * Every college's pay band, in one request.
 *
 * Substrate: the institution-scoped `hr.pay_scales` rows in platform_policies,
 * seeded by supabase/migrations/20260605_hr_compensation_seeds.sql and edited on
 * /hr/admin/policies/pay-scales.
 *
 * ONE QUERY FOR ALL COLLEGES, not one per college. The Pay Band Check screen
 * needs the band for every institution on the roster at once, and the existing
 * useCompensationPolicy() hook takes a single institutionId — nine of those
 * would be nine round trips to answer one question, and its
 * COMPENSATION_INSTITUTIONS constant hard-codes the two colleges that happen to
 * be seeded today, so a third would be invisible to it.
 *
 * A COLLEGE WITH NO ROW IS ABSENT FROM THE MAP, and that is the answer, not a
 * failure: 7 of 9 colleges have no pay band recorded. The caller must render
 * "cannot tell" for them rather than treating a missing band as an empty one.
 *
 * READ-ONLY. There is no mutation here — the band is edited on its own screen.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PayBandPolicy, PayBandRung } from '@/lib/hr/pay-band-check';

export const PAY_BAND_POLICY_KEYS = {
  all: ['hr', 'pay-band-policies'] as const,
};

/** The policy key and scope this reads. Same pair the Pay Scales editor writes. */
const POLICY_KEY = 'hr.pay_scales';
const SCOPE_TYPE = 'institution';

interface RawRow {
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

export interface PayBandPolicySet {
  /** Institution id → that college's band. A college with no row is absent. */
  byInstitution: Map<string, PayBandPolicy>;
  /** When each college's band was last edited, for showing how current it is. */
  updatedAt: Map<string, string | null>;
}

/**
 * Every recorded pay band, keyed by institution.
 *
 * `refetchOnMount: 'always'` for the reason TDS Bands gives: this screen's whole
 * content is salaries resolved against bands, the band is edited on a different
 * screen, and refetchOnWindowFocus is off app-wide — so the default would leave
 * a tab open on it disagreeing with the Pay Scales editor indefinitely.
 */
export function usePayBandPolicies() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<PayBandPolicySet>({
    queryKey: PAY_BAND_POLICY_KEYS.all,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_policies')
        .select('scope_id, value, updated_at')
        .eq('policy_key', POLICY_KEY)
        .eq('scope_type', SCOPE_TYPE);

      if (error) throw new Error(error.message);

      const byInstitution = new Map<string, PayBandPolicy>();
      const updatedAt = new Map<string, string | null>();

      for (const raw of (data ?? []) as RawRow[]) {
        if (!raw.scope_id) continue;
        const policy = parsePayBandPolicy(raw.value);
        if (!policy) continue;
        byInstitution.set(raw.scope_id, policy);
        updatedAt.set(raw.scope_id, raw.updated_at);
      }

      return { byInstitution, updatedAt };
    },
  });
}
