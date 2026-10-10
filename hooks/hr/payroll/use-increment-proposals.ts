'use client';

/**
 * React Query hook for the annual increment report.
 *
 * Goes through the route handler rather than the browser client, for the reason
 * the salary-register hooks give next door: the report reads four separately
 * gated tables plus a policy row, so the authoritative permission check belongs
 * in a reviewed route handler. RLS is a backstop for the tables, but not for
 * the policy row: any signed-in account can read `platform_policies`.
 *
 * There is no mutation hook here, and there is not meant to be one. The report
 * proposes; nothing applies.
 */

import { useQuery } from '@tanstack/react-query';
import type { IncrementReport } from '@/lib/services/hr/increments/increment-report-service';

export const INCREMENT_KEYS = {
  all: ['hr', 'increments'] as const,
  report: (asOf: string | undefined) => ['hr', 'increments', 'report', asOf ?? 'today'] as const,
};

/** `enabled` false = the role cannot see salaries, so the report is never even asked for (blind review, 1 Oct). */
export function useIncrementReport(asOf?: string, enabled = true) {
  return useQuery<IncrementReport>({
    queryKey: INCREMENT_KEYS.report(asOf),
    enabled,
    queryFn: async () => {
      const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
      const res = await fetch(`/api/hr/payroll/increments${qs}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      return body as IncrementReport;
    },
    staleTime: 60 * 1000,
  });
}
