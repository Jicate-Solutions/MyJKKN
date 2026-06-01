'use client';
// hooks/hostel/use-curfew-policies.ts
//
// React Query hooks for the Hostel Curfew Policy admin module.
// Backed by lib/services/hostel/curfew-policy-service.ts.
//
// Spec lock: 2026-05-25 (chairperson + Director).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listCurfewPolicies,
  createCurfewPolicy,
  updateCurfewPolicy,
  setCurfewPolicyActive,
  resolveCurfew,
  type CurfewPolicyInput,
  type CurfewGender,
  type DayOfWeek,
} from '@/lib/services/hostel/curfew-policy-service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const curfewPolicyKeys = {
  all: ['hostel-curfew-policies'] as const,
  list: () => [...curfewPolicyKeys.all, 'list'] as const,
  resolve: (institutionId: string | null, gender: CurfewGender, dayOfWeek: DayOfWeek) =>
    [...curfewPolicyKeys.all, 'resolve', institutionId ?? 'global', gender, dayOfWeek] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCurfewPolicies() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: curfewPolicyKeys.list(),
    queryFn: async () => {
      const { data, error } = await listCurfewPolicies(supabase);
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Live resolution for a single (institution, gender, day) tuple.
 * Used by the admin "preview" panel to show what an actual resident would see.
 */
export function useResolvedCurfew(
  institutionId: string | null,
  gender: CurfewGender,
  dayOfWeek: DayOfWeek,
  enabled: boolean = true
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: curfewPolicyKeys.resolve(institutionId, gender, dayOfWeek),
    queryFn: async () => {
      const { data, error } = await resolveCurfew(supabase, {
        institutionId,
        gender,
        dayOfWeek,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCurfewPolicy() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CurfewPolicyInput) => {
      const { data, error } = await createCurfewPolicy(supabase, input);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Curfew rule created');
      qc.invalidateQueries({ queryKey: curfewPolicyKeys.all });
    },
    onError: (err: Error) => {
      toast.error(`Failed to create rule: ${err.message}`);
    },
  });
}

export function useUpdateCurfewPolicy() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CurfewPolicyInput> }) => {
      const { data, error } = await updateCurfewPolicy(supabase, id, patch);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Curfew rule updated');
      qc.invalidateQueries({ queryKey: curfewPolicyKeys.all });
    },
    onError: (err: Error) => {
      toast.error(`Failed to update rule: ${err.message}`);
    },
  });
}

export function useToggleCurfewPolicyActive() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await setCurfewPolicyActive(supabase, id, isActive);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.isActive ? 'Rule enabled' : 'Rule disabled');
      qc.invalidateQueries({ queryKey: curfewPolicyKeys.all });
    },
    onError: (err: Error) => {
      toast.error(`Failed to toggle rule: ${err.message}`);
    },
  });
}
