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
  // Role-match enforcement on Approve (2026-05-16, seeded by
  // 20260516120000_seed_recruitment_role_enforcement_policies.sql).
  ENFORCE_ROLE_MATCH: 'hr.recruitment.approvals.enforce_role_match',
  OVERRIDE_ROLES: 'hr.recruitment.approvals.override_roles',
} as const;

const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const hrApprovalsScopePolicyKeys = {
  all: ['admin-hr-approvals-scope-policy'] as const,
  enforce: () => [...hrApprovalsScopePolicyKeys.all, 'enforce'] as const,
  rules: () => [...hrApprovalsScopePolicyKeys.all, 'rules'] as const,
  enforceRoleMatch: () =>
    [...hrApprovalsScopePolicyKeys.all, 'enforce-role-match'] as const,
  overrideRoles: () =>
    [...hrApprovalsScopePolicyKeys.all, 'override-roles'] as const,
  rolesCatalog: () => [...hrApprovalsScopePolicyKeys.all, 'roles-catalog'] as const,
  flowStaffing: () => [...hrApprovalsScopePolicyKeys.all, 'flow-staffing'] as const,
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

// ===========================================================================
// Role-match enforcement on Approve (2026-05-16)
// ===========================================================================

function unwrapStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object' && 'value' in v) {
    return unwrapStringArray((v as { value: unknown }).value);
  }
  return [];
}

export function useEnforceRoleMatchPolicy() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.enforceRoleMatch(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .select('policy_key, value, description, updated_at, updated_by')
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.ENFORCE_ROLE_MATCH)
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

export function useOverrideRolesPolicy() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.overrideRoles(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .select('policy_key, value, description, updated_at, updated_by')
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.OVERRIDE_ROLES)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as RawPolicyRow | null;
      return {
        exists: !!row,
        roles: unwrapStringArray(row?.value),
        description: row?.description ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateEnforceRoleMatch() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .update({ value: enabled, updated_at: new Date().toISOString() })
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.ENFORCE_ROLE_MATCH)
        .eq('scope_type', 'global');
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(
        enabled
          ? 'Role match ON — only the named approver role for the current step can approve'
          : 'Role match OFF — anyone with the approve permission can approve any step'
      );
      queryClient.invalidateQueries({
        queryKey: hrApprovalsScopePolicyKeys.enforceRoleMatch(),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update enforce_role_match policy');
    },
  });
}

export function useUpdateOverrideRoles() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roles: string[]) => {
      const { error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .update({ value: roles, updated_at: new Date().toISOString() })
        .eq('policy_key', HR_APPROVALS_SCOPE_KEYS.OVERRIDE_ROLES)
        .eq('scope_type', 'global');
      if (error) throw new Error(error.message);
      return roles;
    },
    onSuccess: () => {
      toast.success('Override roles updated');
      queryClient.invalidateQueries({
        queryKey: hrApprovalsScopePolicyKeys.overrideRoles(),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update override_roles policy');
    },
  });
}

// ---------------------------------------------------------------------------
// Catalogs for the role-enforcement UI
// ---------------------------------------------------------------------------

export interface RoleCatalogRow {
  role_key: string;
  role_name: string | null;
}

export function useRolesCatalog() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.rolesCatalog(),
    queryFn: async (): Promise<RoleCatalogRow[]> => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('role_key, role_name')
        .order('role_key');
      if (error) throw new Error(error.message);
      return (data ?? []) as RoleCatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * For the "consequence preview" table: every distinct approver_role appearing
 * in active recruitment flows + a count of users currently assigned to that role.
 * Director sees at a glance which approver roles have ZERO staff — those rows
 * will silently fail the approve action when enforce_role_match=true.
 */
export interface FlowStaffingRow {
  approver_role: string;
  flow_count: number;
  user_count: number;
}

export function useFlowStaffing() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrApprovalsScopePolicyKeys.flowStaffing(),
    queryFn: async (): Promise<FlowStaffingRow[]> => {
      // 1. All approver_role keys from active flows.
      const { data: flowRows, error: flowErr } = await supabase
        .from('hr_approval_flows')
        .select('steps');
      if (flowErr) throw new Error(flowErr.message);
      const counts = new Map<string, number>();
      for (const row of (flowRows ?? []) as Array<{ steps?: unknown }>) {
        const steps = Array.isArray(row.steps) ? row.steps : [];
        for (const s of steps as Array<{ approver_role?: string }>) {
          const k = (s?.approver_role ?? '').toLowerCase().trim();
          if (!k) continue;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      if (counts.size === 0) return [];

      // 2. For each role_key, count users staffed.
      const roleKeys = Array.from(counts.keys());
      const { data: userRoles, error: urErr } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .in('custom_roles.role_key', roleKeys);
      if (urErr) throw new Error(urErr.message);
      const userCount = new Map<string, number>();
      for (const r of (userRoles ?? []) as Array<{
        custom_roles?: { role_key?: string };
      }>) {
        const k = r.custom_roles?.role_key?.toLowerCase().trim();
        if (!k) continue;
        userCount.set(k, (userCount.get(k) ?? 0) + 1);
      }
      return roleKeys
        .map((role_key) => ({
          approver_role: role_key,
          flow_count: counts.get(role_key) ?? 0,
          user_count: userCount.get(role_key) ?? 0,
        }))
        .sort((a, b) => a.user_count - b.user_count || a.approver_role.localeCompare(b.approver_role));
    },
    staleTime: 60 * 1000,
  });
}
