'use client';

/**
 * The Director's salary suggestion rule, for its editor — read and saved
 * through /api/hr/payroll/salary-suggestion-rule, never from the browser.
 * The route admits super admins only.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const SALARY_SUGGESTION_RULE_KEYS = {
  all: ['hr', 'salary-suggestion-rule'] as const,
};

export interface RuleInstitution {
  id: string;
  name: string;
}

export interface RuleRow {
  id: string;
  scopeType: 'global' | 'institution';
  scopeId: string | null;
  value: unknown;
  draftValue: unknown;
  publicationState: string;
  updatedAt: string | null;
}

export interface RuleListPayload {
  institutions: RuleInstitution[];
  rows: RuleRow[];
}

export interface SaveRulePayload {
  /** 'group' or a college id. */
  scope: string;
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
