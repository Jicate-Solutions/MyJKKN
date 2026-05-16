'use client';
// hooks/admin/use-hr-approvals-scope-policy.ts
//
// React Query wrapper for the two platform_policies rows that drive
// HR recruitment-approvals scope policy:
//
//   1. hr.recruitment.approvals.enforce_scoping  (boolean)
//   2. hr.recruitment.approvals.scope_rules      (JSONB — per-role scope map)
//
// Director's framing: every policy decision = config-table row + super-admin UI
// to write + reader fn (memory: feedback_policy_decisions_must_be_config_rows.md).
//
// Agent A (in parallel) is seeding the rows and extending
// `lib/services/hr/policy-service.ts` with `getPolicy()` / `setPolicy()` helpers.
// To avoid a hard import dependency on a not-yet-merged branch, this hook talks
// to `platform_policies` directly via the same shape used by
// `internship-policy-service.ts` (scope_type='global', JSONB value column).
//
// When Agent A's PR merges, a small follow-up can swap these to
// `getPolicy()`/`setPolicy()` without touching the page.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Local types — mirror Agent A's `ScopeRules` shape. Reconcile on follow-up.
// ---------------------------------------------------------------------------

export type ScopeOption =
  | 'all'
  | 'institution'
  | 'department'
  | 'hr_organization'
  | 'self';

export type ScopeRules = Record<string, { scope: ScopeOption }> & {
  _default?: { scope: ScopeOption };
};

// ---------------------------------------------------------------------------
// Policy keys
// ---------------------------------------------------------------------------

export const HR_APPROVALS_SCOPE_KEYS = {
  ENFORCE_SCOPING: 'hr.recruitment.approvals.enforce_scoping',
  SCOPE_RULES: 'hr.recruitment.approvals.scope_rules',
} as const;

const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const hrApprovalsScopePolicyKeys = {
  all: ['admin-hr-approvals-scope-policy'] as const,
  enforce: () => [...hrApprovalsScopePolicyKeys.all, 'enforce'] as const,
  rules: () => [...hrApprovalsScopePolicyKeys.all, 'rules'] as const,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawPolicyRow {
  policy_key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

function unwrapBoolean(v: unknown): boolean {
  // JSONB might come back as raw boolean, "true"/"false" string, or {value: ...}
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  if (v && typeof v === 'object' && 'value' in v) {
    return unwrapBoolean((v as { value: unknown }).value);
  }
  return false;
}

function unwrapScopeRules(v: unknown): ScopeRules {
  if (!v || typeof v !== 'object') return {};
  // Some seed shapes wrap as {value: {...}}; unwrap once if so.
  if ('value' in v && (v as { value?: unknown }).value && typeof (v as { value: unknown }).value === 'object') {
    return (v as { value: ScopeRules }).value ?? {};
  }
  return v as ScopeRules;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useEnforceScopingPolicy() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.enforce(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .select('policy_key, value, description, updated_at, updated_by')
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.ENFORCE_SCOPING)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as RawPolicyRow | null;
      return {
        exists: !!row,
        enabled: unwrapBoolean(row?.value),
        description: row?.description ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}

export function useScopeRulesPolicy() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.rules(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .select('policy_key, value, description, updated_at, updated_by')
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.SCOPE_RULES)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as RawPolicyRow | null;
      return {
        exists: !!row,
        rules: unwrapScopeRules(row?.value),
        description: row?.description ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpdateEnforceScoping() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      // Match update by policy_key + scope_type='global'. Row is seeded by Agent A.
      const { error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .update({
          value: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.ENFORCE_SCOPING)
        .eq('scope_type', 'global');
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(
        enabled
          ? 'Scoping enabled — approvers will only see candidates in their scope'
          : 'Scoping disabled — every approver sees the full queue'
      );
      queryClient.invalidateQueries({ queryKey: hrApprovalsScopePolicyKeys.enforce() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update enforce_scoping policy');
    },
  });
}

export function useUpdateScopeRules() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: ScopeRules) => {
      const { error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .update({
          value: rules,
          updated_at: new Date().toISOString(),
        })
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.SCOPE_RULES)
        .eq('scope_type', 'global');
      if (error) throw new Error(error.message);
      return rules;
    },
    onSuccess: () => {
      toast.success('Scope rules updated');
      queryClient.invalidateQueries({ queryKey: hrApprovalsScopePolicyKeys.rules() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update scope rules');
    },
  });
}
