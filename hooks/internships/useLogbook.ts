'use client';
// hooks/internships/useLogbook.ts
// React Query hooks for internship_logbook_entries.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listLogbookEntries,
  getLogbookEntryById,
  createLogbookEntry,
  updateLogbookEntry,
  deleteLogbookEntry,
  submitLogbookEntry,
  approveLogbookEntry,
} from '@/lib/services/internships/logbook-service';
import type {
  CreateLogbookEntryInput,
  UpdateLogbookEntryInput,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const logbookKeys = {
  all: ['internship-logbook'] as const,
  lists: () => [...logbookKeys.all, 'list'] as const,
  list: (assignmentId?: string, learnerId?: string) =>
    [...logbookKeys.lists(), assignmentId ?? 'all', learnerId ?? 'all'] as const,
  details: () => [...logbookKeys.all, 'detail'] as const,
  detail: (id: string) => [...logbookKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useLogbookEntries(assignmentId?: string, learnerId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: logbookKeys.list(assignmentId, learnerId),
    queryFn: async () => {
      const { data, error } = await listLogbookEntries(supabase, assignmentId, learnerId);
      if (error) throw error;
      return data;
    },
  });
}

export function useLogbookEntry(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: logbookKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getLogbookEntryById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateLogbookEntry() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLogbookEntryInput) =>
      createLogbookEntry(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Logbook entry created');
      queryClient.invalidateQueries({ queryKey: logbookKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create logbook entry');
    },
  });
}

export function useUpdateLogbookEntry() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateLogbookEntryInput }) =>
      updateLogbookEntry(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Logbook entry updated');
      queryClient.invalidateQueries({ queryKey: logbookKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: logbookKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update logbook entry');
    },
  });
}

export function useDeleteLogbookEntry() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteLogbookEntry(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Logbook entry deleted');
      queryClient.invalidateQueries({ queryKey: logbookKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete logbook entry');
    },
  });
}

export function useSubmitLogbookEntry() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      submitLogbookEntry(supabase, id).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Logbook entry submitted for review');
      queryClient.invalidateQueries({ queryKey: logbookKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: logbookKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit logbook entry');
    },
  });
}

export function useApproveLogbookEntry() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
      approveLogbookEntry(supabase, id, approvedBy).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Logbook entry approved');
      queryClient.invalidateQueries({ queryKey: logbookKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: logbookKeys.list(data.assignment_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to approve logbook entry');
    },
  });
}
