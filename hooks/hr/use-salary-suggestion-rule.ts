'use client';

/**
 * The Director's salary suggestion rule, for its editor — read and saved
 * through /api/hr/payroll/salary-suggestion-rule, never from the browser.
 * The route lets super admins look and only the Director list change it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const SALARY_SUGGESTION_RULE_KEYS = {
  all: ['hr', 'salary-suggestion-rule'] as const,
};

export interface RuleDepartment {
  id: string;
  name: string;
  institutionId: string;
  institutionName: string;
}

export interface RuleRow {
  id: string;
  value: unknown;
  draftValue: unknown;
  publicationState: string;
  updatedAt: string | null;
}

export interface RuleListPayload {
  departments: RuleDepartment[];
  /** The one group-wide row, or null before the first save. */
  row: RuleRow | null;
  /** True only for someone on the Director list. Everybody else looks only. */
  canEdit: boolean;
}

export interface SaveRulePayload {
  action: 'save_draft' | 'publish';
  rule: unknown;
  reason: string;
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

export function useSalarySuggestionRule(options: { enabled: boolean }) {
  return useQuery<RuleListPayload>({
    queryKey: SALARY_SUGGESTION_RULE_KEYS.all,
    enabled: options.enabled,
    refetchOnMount: 'always',
    queryFn: async () => readJson(await fetch('/api/hr/payroll/salary-suggestion-rule')),
  });
}

export function useSaveSalarySuggestionRule() {
  const queryClient = useQueryClient();
  return useMutation<{ row: RuleRow; auditError: string | null }, Error, SaveRulePayload>({
    mutationFn: async (payload) =>
      readJson(
        await fetch('/api/hr/payroll/salary-suggestion-rule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALARY_SUGGESTION_RULE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['hr', 'salary-suggestion'] });
    },
  });
}
