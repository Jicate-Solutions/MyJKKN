'use client';

/**
 * A candidate's suggested starting salary, and the three details it needs.
 *
 * The figure is worked out on the SERVER
 * (GET /api/hr/recruitment/candidates/<id>/salary-suggestion, gated on
 * `hr.payroll.salary.view`). The band and the Director's amounts never come to
 * the browser; __tests__/hr/candidate-salary-suggestion-server-only-guard.test.ts
 * fails if this file starts importing the server service or reading the policy
 * table.
 *
 * The details (job title, department, years before JKKN) are read and saved
 * through GET/PATCH /api/hr/recruitment/candidates/<id>/salary-details. Saving
 * them changes no package: a figure reaches a package only through Propose.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateSalarySuggestion } from '@/lib/hr/candidate-salary-suggestion';

export const CANDIDATE_SALARY_KEYS = {
  suggestion: (candidateId: string) => ['hr', 'candidate-salary-suggestion', candidateId] as const,
  details: (candidateId: string) => ['hr', 'candidate-salary-details', candidateId] as const,
};

/** The suggestion route's response. Declared here so this file imports nothing server-side. */
export interface CandidateSalarySuggestionPayload {
  suggestion: CandidateSalarySuggestion;
  ruleUpdatedAt: string | null;
}

export interface CandidateSalaryDetailsValues {
  designation_id: string | null;
  department_id: string | null;
  prior_experience_years: number | null;
}

export interface CandidateSalaryDetailsPayload {
  details: CandidateSalaryDetailsValues;
  roleTitle: string | null;
  hasCollege: boolean;
  roleTitleMatchId: string | null;
  designations: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const base = (candidateId: string) => `/api/hr/recruitment/candidates/${encodeURIComponent(candidateId)}`;

/** `enabled` must be the caller's salary permission AND an open dialog. */
export function useCandidateSalarySuggestion(candidateId: string, options: { enabled: boolean }) {
  return useQuery<CandidateSalarySuggestionPayload>({
    queryKey: CANDIDATE_SALARY_KEYS.suggestion(candidateId),
    enabled: options.enabled && Boolean(candidateId),
    // The Director's amounts and the band are edited on other screens; every
    // opening of the dialog asks the server again.
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async () =>
      readJson<CandidateSalarySuggestionPayload>(await fetch(`${base(candidateId)}/salary-suggestion`)),
  });
}

export function useCandidateSalaryDetails(candidateId: string, options: { enabled: boolean }) {
  return useQuery<CandidateSalaryDetailsPayload>({
    queryKey: CANDIDATE_SALARY_KEYS.details(candidateId),
    enabled: options.enabled && Boolean(candidateId),
    queryFn: async () =>
      readJson<CandidateSalaryDetailsPayload>(await fetch(`${base(candidateId)}/salary-details`)),
  });
}

export function useSaveCandidateSalaryDetails(candidateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CandidateSalaryDetailsValues) =>
      readJson<{ details: CandidateSalaryDetailsValues }>(
        await fetch(`${base(candidateId)}/salary-details`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CANDIDATE_SALARY_KEYS.details(candidateId) });
      queryClient.invalidateQueries({ queryKey: CANDIDATE_SALARY_KEYS.suggestion(candidateId) });
    },
  });
}
