'use client';

/**
 * One person's suggested revised salary — worked out on the SERVER.
 *
 * GET /api/hr/payroll/salary-suggestions checks `hr.payroll.salary.view` and
 * reads through hr_salary_suggestion_inputs(), scoped to the caller's colleges.
 * The rule itself never comes to the browser; only the worked-out lines for a
 * person the caller already sees on Employee Salaries. __tests__/hr/
 * salary-suggestion-server-only-guard.test.ts fails if this file starts reading
 * the policy table instead.
 *
 * `enabled` must be the caller's permission AND an open panel: nothing is
 * fetched until someone clicks Suggest.
 *
 * READ ONLY. There is no mutation here — a figure is saved only through the
 * Edit Salary dialog.
 */

import { useQuery } from '@tanstack/react-query';
import type { SalarySuggestion } from '@/lib/hr/salary-suggestion';

export const SALARY_SUGGESTION_KEYS = {
  person: (staffId: string) => ['hr', 'salary-suggestion', staffId] as const,
};

/** The route's response. Declared here so this file imports nothing server-side. */
export interface SalarySuggestionPayload {
  suggestion: SalarySuggestion;
  ruleSource: 'college' | 'group' | null;
  ruleUpdatedAt: string | null;
}

export function useSalarySuggestion(staffId: string | null, options: { enabled: boolean }) {
  return useQuery<SalarySuggestionPayload>({
    queryKey: SALARY_SUGGESTION_KEYS.person(staffId ?? 'none'),
    enabled: options.enabled && Boolean(staffId),
    // The rule is edited on another screen; a panel reopened later must not
    // show the figure from before the rule changed. The panel stays mounted
    // between openings (only `enabled` flips), so refetchOnMount alone is not
    // enough: staleTime 0 makes every re-opening ask the server again.
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(
        `/api/hr/payroll/salary-suggestions?staffId=${encodeURIComponent(staffId as string)}`
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      return body as SalarySuggestionPayload;
    },
  });
}
