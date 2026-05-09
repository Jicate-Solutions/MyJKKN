'use client';
// hooks/internships/usePreceptors.ts
// React Query hooks for internship_preceptors.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listPreceptors,
  getPreceptorById,
  createPreceptor,
  updatePreceptor,
  deletePreceptor,
} from '@/lib/services/internships/preceptors-service';
import type {
  CreatePreceptorInput,
  UpdatePreceptorInput,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const preceptorsKeys = {
  all: ['internship-preceptors'] as const,
  lists: () => [...preceptorsKeys.all, 'list'] as const,
  list: (siteId?: string, activeOnly?: boolean) =>
    [...preceptorsKeys.lists(), siteId ?? 'all', activeOnly ? 'active' : 'all'] as const,
  details: () => [...preceptorsKeys.all, 'detail'] as const,
  detail: (id: string) => [...preceptorsKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePreceptors(siteId?: string, activeOnly = false) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: preceptorsKeys.list(siteId, activeOnly),
    queryFn: async () => {
      const { data, error } = await listPreceptors(supabase, siteId, activeOnly);
      if (error) throw error;
      return data;
    },
  });
}

export function usePreceptor(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: preceptorsKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getPreceptorById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreatePreceptor() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePreceptorInput) =>
      createPreceptor(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Preceptor added');
      queryClient.invalidateQueries({ queryKey: preceptorsKeys.list(data.site_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add preceptor');
    },
  });
}

export function useUpdatePreceptor() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdatePreceptorInput }) =>
      updatePreceptor(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Preceptor updated');
      queryClient.invalidateQueries({ queryKey: preceptorsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: preceptorsKeys.list(data.site_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update preceptor');
    },
  });
}

export function useDeletePreceptor() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePreceptor(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Preceptor removed');
      queryClient.invalidateQueries({ queryKey: preceptorsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove preceptor');
    },
  });
}
