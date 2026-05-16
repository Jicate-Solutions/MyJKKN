'use client';
// hooks/admin/useInternshipPolicy.ts
// React Query hooks for admin internship policy management.
// Mirrors the pattern of counselor-routing admin hooks (Spec #537).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listPolicyKeys,
  updatePolicyValue,
  listConfigTables,
  listCollegeOverrides,
  upsertCollegeOverride,
  deleteCollegeOverride,
} from '@/lib/services/admin/internship-policy-service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const internshipPolicyAdminKeys = {
  all: ['admin-internship-policy'] as const,
  policyKeys: () => [...internshipPolicyAdminKeys.all, 'keys'] as const,
  configTables: () => [...internshipPolicyAdminKeys.all, 'config-tables'] as const,
  overrides: (collegeId?: string) =>
    [...internshipPolicyAdminKeys.all, 'overrides', collegeId ?? 'all'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Lists all platform_policies rows with key prefix "internship.policy.*".
 */
export function useInternshipPolicyKeys() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: internshipPolicyAdminKeys.policyKeys(),
    queryFn: async () => {
      const { data, error } = await listPolicyKeys(supabase);
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Returns row counts for all 8 internship config tables.
 * Used by the admin overview panel.
 */
export function useInternshipConfigTables() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: internshipPolicyAdminKeys.configTables(),
    queryFn: async () => {
      const { data, error } = await listConfigTables(supabase);
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Lists college-level notification overrides, optionally filtered to one college.
 */
export function useInternshipCollegeOverrides(collegeId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: internshipPolicyAdminKeys.overrides(collegeId),
    queryFn: async () => {
      const { data, error } = await listCollegeOverrides(supabase, collegeId);
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Update a single internship policy value with audit reason.
 * Key prefix "internship.policy." is enforced in the service.
 */
export function useUpdateInternshipPolicy() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      key,
      value,
      changeReason,
      updatedBy,
    }: {
      key: string;
      value: string;
      changeReason: string;
      updatedBy: string;
    }) =>
      updatePolicyValue(supabase, key, value, changeReason, updatedBy).then(
        ({ data, error }) => {
          if (error) throw error;
          return data!;
        }
      ),
    onSuccess: () => {
      toast.success('Policy updated');
      queryClient.invalidateQueries({ queryKey: internshipPolicyAdminKeys.policyKeys() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update policy');
    },
  });
}

/**
 * Upsert a college-level notification override.
 */
export function useUpsertCollegeOverride() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      collegeId,
      key,
      value,
      updatedBy,
    }: {
      collegeId: string;
      key: string;
      value: string;
      updatedBy: string;
    }) =>
      upsertCollegeOverride(supabase, collegeId, key, value, updatedBy).then(
        ({ data, error }) => {
          if (error) throw error;
          return data!;
        }
      ),
    onSuccess: (data) => {
      toast.success('College override saved');
      queryClient.invalidateQueries({
        queryKey: internshipPolicyAdminKeys.overrides(data.college_id),
      });
      queryClient.invalidateQueries({
        queryKey: internshipPolicyAdminKeys.overrides(),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save college override');
    },
  });
}

/**
 * Delete a college-level notification override (reverts to global policy).
 */
export function useDeleteCollegeOverride() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      deleteCollegeOverride(supabase, id).then(({ error }) => {
        if (error) throw error;
      }),
    onSuccess: () => {
      toast.success('Override removed — reverted to global policy');
      queryClient.invalidateQueries({
        queryKey: internshipPolicyAdminKeys.overrides(),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove college override');
    },
  });
}
