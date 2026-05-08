'use client';
// hooks/internships/useIncidents.ts
// React Query hooks for internship_incidents.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
  resolveIncident,
} from '@/lib/services/internships/incidents-service';
import type {
  CreateIncidentInput,
  UpdateIncidentInput,
} from '@/lib/services/internships/types';
import type { IncidentFilters } from '@/lib/services/internships/incidents-service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const incidentsKeys = {
  all: ['internship-incidents'] as const,
  lists: () => [...incidentsKeys.all, 'list'] as const,
  list: (filters?: IncidentFilters) =>
    [...incidentsKeys.lists(), JSON.stringify(filters ?? {})] as const,
  details: () => [...incidentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...incidentsKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useIncidents(filters?: IncidentFilters) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: incidentsKeys.list(filters),
    queryFn: async () => {
      const { data, error } = await listIncidents(supabase, filters);
      if (error) throw error;
      return data;
    },
  });
}

export function useIncident(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: incidentsKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getIncidentById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateIncident() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateIncidentInput) =>
      createIncident(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: () => {
      toast.success('Incident reported');
      queryClient.invalidateQueries({ queryKey: incidentsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to report incident');
    },
  });
}

export function useUpdateIncident() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateIncidentInput }) =>
      updateIncident(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Incident updated');
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: incidentsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update incident');
    },
  });
}

export function useDeleteIncident() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteIncident(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Incident deleted');
      queryClient.invalidateQueries({ queryKey: incidentsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete incident');
    },
  });
}

export function useResolveIncident() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      resolvedBy,
      resolutionNotes,
    }: {
      id: string;
      resolvedBy: string;
      resolutionNotes: string;
    }) =>
      resolveIncident(supabase, id, resolvedBy, resolutionNotes).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Incident resolved');
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: incidentsKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to resolve incident');
    },
  });
}
