// hooks/admission/use-merit-lists.ts
// React Query hooks for merit lists

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MeritListService,
  type MeritListRow,
  type MeritListEntry,
  type CreateMeritListInput,
  type UpdateMeritListInput,
  type MeritListFilters,
} from '@/lib/services/admission/merit-list-service';

// Query keys
export const meritListKeys = {
  all: ['admission-merit-lists'] as const,
  lists: () => [...meritListKeys.all, 'list'] as const,
  list: (institutionId: string, filters?: MeritListFilters) =>
    [...meritListKeys.lists(), institutionId, filters] as const,
  detail: (listId: string) => [...meritListKeys.all, 'detail', listId] as const,
  stats: (institutionId: string, programId?: string) =>
    [...meritListKeys.all, 'stats', institutionId, programId] as const,
};

/**
 * Hook to fetch all merit lists for an institution
 */
export function useMeritLists(institutionId?: string, filters?: MeritListFilters) {
  const query = useQuery({
    queryKey: meritListKeys.list(institutionId || '', filters),
    queryFn: () => MeritListService.getMeritLists(institutionId!, filters),
    enabled: !!institutionId,
  });

  return {
    meritLists: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single merit list
 */
export function useMeritList(listId?: string) {
  const query = useQuery({
    queryKey: meritListKeys.detail(listId || ''),
    queryFn: () => MeritListService.getMeritList(listId!),
    enabled: !!listId,
  });

  return {
    meritList: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Hook to fetch merit list stats
 */
export function useMeritListStats(institutionId?: string, programId?: string) {
  const query = useQuery({
    queryKey: meritListKeys.stats(institutionId || '', programId),
    queryFn: () => MeritListService.getStats(institutionId!, programId),
    enabled: !!institutionId,
  });

  return {
    stats: query.data || {
      totalLists: 0,
      totalCandidates: 0,
      shortlisted: 0,
      waitlisted: 0,
      pending: 0,
      avgScore: 0,
      publishedCount: 0,
    },
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Hook to create a new merit list
 */
export function useCreateMeritList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeritListInput) => MeritListService.createMeritList(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meritListKeys.all });
      toast.success('Merit list created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create merit list: ${error.message}`);
    },
  });
}

/**
 * Hook to update a merit list
 */
export function useUpdateMeritList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, updates }: { listId: string; updates: UpdateMeritListInput }) =>
      MeritListService.updateMeritList(listId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meritListKeys.all });
      toast.success('Merit list updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update merit list: ${error.message}`);
    },
  });
}

/**
 * Hook to publish a merit list
 */
export function usePublishMeritList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => MeritListService.publishMeritList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meritListKeys.all });
      toast.success('Merit list published successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to publish merit list: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a merit list
 */
export function useDeleteMeritList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => MeritListService.deleteMeritList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meritListKeys.all });
      toast.success('Merit list deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete merit list: ${error.message}`);
    },
  });
}
