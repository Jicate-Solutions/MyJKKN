'use client';
// hooks/internships/useEvaluations.ts
// React Query hooks for internship_evaluations (preceptor + faculty).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listEvaluations,
  listEvaluationsByAssignment,
  listPreceptorEvaluations,
  listFacultyEvaluations,
  getEvaluationById,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  submitEvaluation,
} from '@/lib/services/internships/evaluations-service';
import type {
  CreateEvaluationInput,
  UpdateEvaluationInput,
  EvaluatorRole,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const evaluationsKeys = {
  all: ['internship-evaluations'] as const,
  lists: () => [...evaluationsKeys.all, 'list'] as const,
  list: (assignmentId?: string, role?: EvaluatorRole) =>
    [...evaluationsKeys.lists(), assignmentId ?? 'all', role ?? 'all'] as const,
  details: () => [...evaluationsKeys.all, 'detail'] as const,
  detail: (id: string) => [...evaluationsKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useEvaluations(assignmentId?: string, evaluatorRole?: EvaluatorRole) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: evaluationsKeys.list(assignmentId, evaluatorRole),
    queryFn: async () => {
      const { data, error } = await listEvaluations(supabase, assignmentId, evaluatorRole);
      if (error) throw error;
      return data;
    },
  });
}

export function useEvaluation(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: evaluationsKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getEvaluationById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function usePreceptorEvaluations(assignmentId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: evaluationsKeys.list(assignmentId, 'preceptor'),
    queryFn: async () => {
      const { data, error } = await listPreceptorEvaluations(supabase, assignmentId!);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });
}

export function useFacultyEvaluations(assignmentId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: evaluationsKeys.list(assignmentId, 'faculty'),
    queryFn: async () => {
      const { data, error } = await listFacultyEvaluations(supabase, assignmentId!);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateEvaluation() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEvaluationInput) =>
      createEvaluation(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Evaluation created');
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create evaluation');
    },
  });
}

export function useUpdateEvaluation() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateEvaluationInput }) =>
      updateEvaluation(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Evaluation updated');
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update evaluation');
    },
  });
}

export function useDeleteEvaluation() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteEvaluation(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Evaluation deleted');
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete evaluation');
    },
  });
}

export function useSubmitEvaluation() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      submitEvaluation(supabase, id).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Evaluation submitted');
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: evaluationsKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit evaluation');
    },
  });
}
