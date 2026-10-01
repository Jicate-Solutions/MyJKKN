'use client';

/**
 * Every college's pay band, in one request — fetched from the SERVER.
 *
 * The bands are the institution-scoped `hr.pay_scales` rows in
 * platform_policies, edited on /hr/admin/policies/pay-scales. This hook does
 * NOT read that table. Its SELECT policy is `auth.uid() IS NOT NULL`, so a
 * browser query would hand every college's pay matrix to any signed-in account;
 * the read lives behind GET /api/hr/payroll/pay-bands, which checks
 * `hr.payroll.salary.view` and returns only the colleges the caller can access. __tests__/hr/pay-band-server-only-guard.test.ts
 * fails if this file (or any client file) goes back to reading it directly.
 *
 * `enabled` must be the caller's permission: a person without the key is shown
 * "access denied" and no request is made at all.
 *
 * A COLLEGE WITH NO USABLE BAND IS ABSENT FROM THE MAP, and that is the answer,
 * not a failure: 7 of 9 colleges have no pay band recorded. The caller must
 * render "cannot tell" for them rather than treating a missing band as an empty
 * one.
 *
 * READ-ONLY. There is no mutation here — the band is edited on its own screen.
 */

import { useQuery } from '@tanstack/react-query';
import type { PayBandPolicy } from '@/lib/hr/pay-band-check';

export const PAY_BAND_POLICY_KEYS = {
  all: ['hr', 'pay-band-policies'] as const,
};

/** The route's response. Declared here so this file imports nothing server-side. */
interface PayBandPoliciesResponse {
  bands: Array<{ institutionId: string; policy: PayBandPolicy; updatedAt: string | null }>;
}

export interface PayBandPolicySet {
  /** Institution id → that college's band. A college with no usable band is absent. */
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
export function usePayBandPolicies(options: { enabled: boolean }) {
  return useQuery<PayBandPolicySet>({
    queryKey: PAY_BAND_POLICY_KEYS.all,
    enabled: options.enabled,
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await fetch('/api/hr/payroll/pay-bands');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const byInstitution = new Map<string, PayBandPolicy>();
      const updatedAt = new Map<string, string | null>();
      for (const band of (body as PayBandPoliciesResponse).bands ?? []) {
        byInstitution.set(band.institutionId, band.policy);
        updatedAt.set(band.institutionId, band.updatedAt);
      }
      return { byInstitution, updatedAt };
    },
  });
}
