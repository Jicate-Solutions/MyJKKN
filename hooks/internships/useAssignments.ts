'use client';
// hooks/internships/useAssignments.ts
// React Query hooks for internship_assignments.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listAssignments,
  listAssignmentsByLearner,
  listAssignmentsByCycle,
  listAssignmentsByHospital,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '@/lib/services/internships/assignments-service';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
  AssignmentFilters,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const assignmentsKeys = {
  all: ['internship-assignments'] as const,
  lists: () => [...assignmentsKeys.all, 'list'] as const,
  list: (filters?: AssignmentFilters) =>
    [...assignmentsKeys.lists(), JSON.stringify(filters ?? {})] as const,
  byCycle: (cycleId: string) => [...assignmentsKeys.all, 'by-cycle', cycleId] as const,
  byLearner: (learnerId: string) => [...assignmentsKeys.all, 'by-learner', learnerId] as const,
  byHospital: (siteId: string) => [...assignmentsKeys.all, 'by-hospital', siteId] as const,
  details: () => [...assignmentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...assignmentsKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useAssignments(filters?: AssignmentFilters) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: assignmentsKeys.list(filters),
    queryFn: async () => {
      const { data, error } = await listAssignments(supabase, filters);
      if (error) throw error;
      return data;
    },
  });
}

export function useAssignment(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: assignmentsKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getAssignmentById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useAssignmentsByCycle(cycleId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: assignmentsKeys.byCycle(cycleId ?? ''),
    queryFn: async () => {
      const { data, error } = await listAssignmentsByCycle(supabase, cycleId!);
      if (error) throw error;
      return data;
    },
    enabled: !!cycleId,
  });
}

export function useAssignmentsByLearner(learnerId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: assignmentsKeys.byLearner(learnerId ?? ''),
    queryFn: async () => {
      const { data, error } = await listAssignmentsByLearner(supabase, learnerId!);
      if (error) throw error;
      return data;
    },
    enabled: !!learnerId,
  });
}

export function useAssignmentsByHospital(siteId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: assignmentsKeys.byHospital(siteId ?? ''),
    queryFn: async () => {
      const { data, error } = await listAssignmentsByHospital(supabase, siteId!);
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateAssignment() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      createAssignment(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Assignment created');
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.byCycle(data.cycle_id) });
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.byLearner(data.learner_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create assignment');
    },
  });
}

export function useUpdateAssignment() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateAssignmentInput }) =>
      updateAssignment(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Assignment updated');
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.byCycle(data.cycle_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update assignment');
    },
  });
}

export function useDeleteAssignment() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAssignment(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: assignmentsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete assignment');
    },
  });
}
