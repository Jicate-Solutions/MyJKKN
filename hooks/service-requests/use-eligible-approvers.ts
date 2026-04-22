'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Profile row that could approve a given step for a given request.
 * The service-request approval model stores `approver_role` (a role key
 * like 'hod' or 'principal') on each approval step template, not a
 * specific approver. This hook resolves those role keys to the real
 * users in the request's institution who could act on each step, so the
 * detail view can show "Awaiting approval by <Name>" instead of just
 * the role label.
 */
export interface EligibleApprover {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

/**
 * Given a list of approver_role keys (from the approval step template)
 * and the request's institution_id, returns a map of
 * role_key -> list of active profiles in that institution who carry
 * that role. Empty list means "no user is currently configured to
 * approve this step" (which the UI should surface as a warning).
 *
 * Dedupes the role keys internally so N steps sharing a role only
 * trigger one SQL-level `.in()` clause.
 *
 * Returns an empty map until both institutionId and at least one role
 * are known, so the caller can safely destructure the result.
 */
export function useEligibleApprovers(
  approverRoles: (string | null | undefined)[],
  institutionId: string | null | undefined
) {
  const uniqueRoles = useMemo(
    () => Array.from(new Set(approverRoles.filter((r): r is string => !!r))),
    [approverRoles]
  );

  return useQuery<Map<string, EligibleApprover[]>>({
    queryKey: [
      'eligible-approvers',
      institutionId ?? null,
      uniqueRoles.slice().sort().join(','),
    ],
    queryFn: async () => {
      const result = new Map<string, EligibleApprover[]>();
      if (!institutionId || uniqueRoles.length === 0) return result;

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, institution_id')
        .in('role', uniqueRoles)
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) {
        console.error('[eligible-approvers] fetch failed', error);
        return result;
      }

      for (const row of (data || []) as any[]) {
        const list = result.get(row.role) || [];
        list.push({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          role: row.role,
        });
        result.set(row.role, list);
      }
      return result;
    },
    enabled: !!institutionId && uniqueRoles.length > 0,
    staleTime: 60_000, // staff rosters don't churn during a single approval session
  });
}

/**
 * Resolve a flat list of profile IDs (from `approval_step.approver_user_ids`)
 * to the full profile objects, regardless of institution or role. Used when a
 * step has explicit named approvers — those users should display even if
 * they're outside the request's current institution scope (which is a valid
 * case for cross-institution types).
 *
 * Returns a stable id -> profile map; empty until there's at least one ID
 * to look up.
 */
export function useApproversByIds(userIds: (string | null | undefined)[]) {
  const uniqueIds = useMemo(
    () => Array.from(new Set(userIds.filter((id): id is string => !!id))),
    [userIds]
  );

  return useQuery<Map<string, EligibleApprover>>({
    queryKey: ['eligible-approvers-by-id', uniqueIds.slice().sort().join(',')],
    queryFn: async () => {
      const result = new Map<string, EligibleApprover>();
      if (uniqueIds.length === 0) return result;

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active')
        .in('id', uniqueIds);

      if (error) {
        console.error('[eligible-approvers-by-id] fetch failed', error);
        return result;
      }

      for (const row of (data || []) as any[]) {
        result.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          role: row.role,
        });
      }
      return result;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 60_000,
  });
}

/** Title-case a role_key for display when no custom_roles mapping is loaded. */
export function roleKeyToLabel(roleKey: string | null | undefined): string {
  if (!roleKey) return 'Unknown';
  return roleKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
