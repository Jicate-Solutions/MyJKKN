'use client';
// hooks/internships/useCycles.ts
// React Query hooks for internship_posting_cycles.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listCycles,
  getCycleById,
  createCycle,
  updateCycle,
  deleteCycle,
} from '@/lib/services/internships/cycles-service';
import type { CreateCycleInput, UpdateCycleInput } from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const cyclesKeys = {
  all: ['internship-cycles'] as const,
  lists: () => [...cyclesKeys.all, 'list'] as const,
  list: (institutionId?: string) => [...cyclesKeys.lists(), institutionId ?? 'all'] as const,
  details: () => [...cyclesKeys.all, 'detail'] as const,
  detail: (id: string) => [...cyclesKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCycles(institutionId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: cyclesKeys.list(institutionId),
    queryFn: async () => {
      const { data, error } = await listCycles(supabase, institutionId);
      if (error) throw error;
      return data;
    },
  });
}

export function useCycle(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: cyclesKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getCycleById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCycle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCycleInput) => createCycle(supabase, input).then(({ data, error }) => {
      if (error) throw error;
      return data!;
    }),
    onSuccess: () => {
      toast.success('Internship cycle created');
      queryClient.invalidateQueries({ queryKey: cyclesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create cycle');
    },
  });
}

export function useUpdateCycle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateCycleInput }) =>
      updateCycle(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Cycle updated');
      queryClient.invalidateQueries({ queryKey: cyclesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: cyclesKeys.detail(data.id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update cycle');
    },
  });
}

export function useDeleteCycle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCycle(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Cycle deleted');
      queryClient.invalidateQueries({ queryKey: cyclesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete cycle');
    },
  });
}
