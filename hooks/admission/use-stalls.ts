// hooks/admission/use-stalls.ts
// BUG-003146: React Query hooks for Expo Event Stalls.
// Follows the pattern of hooks/admission/use-expos.ts.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { StallService } from '@/lib/services/admission/stall-service';
import { expoKeys } from '@/hooks/admission/use-expos';
import type { CreateExpoStallInput, UpdateExpoStallInput } from '@/types/admission';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const stallKeys = {
  all: ['expo-stalls'] as const,
  byEvent: (eventId: string) => ['expo-stalls', 'by-event', eventId] as const,
  detail: (id: string) => ['expo-stall', id] as const,
  leadCount: (stallId: string) => ['expo-stall-leads', stallId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch all stalls for a given expo event.
 */
export function useStallsByEvent(expoEventId: string | undefined) {
  const query = useQuery({
    queryKey: stallKeys.byEvent(expoEventId || ''),
    queryFn: () => StallService.listByEvent(expoEventId!),
    enabled: !!expoEventId,
  });

  return {
    stalls: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single stall by ID.
 */
export function useStall(id: string | undefined) {
  const query = useQuery({
    queryKey: stallKeys.detail(id || ''),
    queryFn: () => StallService.getById(id!),
    enabled: !!id,
  });

  return {
    stall: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch the count of leads attributed to a stall.
 */
export function useStallLeadCount(stallId: string | undefined) {
  const query = useQuery({
    queryKey: stallKeys.leadCount(stallId || ''),
    queryFn: () => StallService.getLeadCountByStall(stallId!),
    enabled: !!stallId,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new stall for an expo event.
 */
export function useCreateStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpoStallInput) => StallService.create(input),
    onSuccess: (data) => {
      toast.success('Stall created');
      queryClient.invalidateQueries({ queryKey: stallKeys.byEvent(data.expo_event_id) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(data.expo_event_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Update an existing stall.
 */
export function useUpdateStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExpoStallInput & { id: string }) =>
      StallService.update(id, input),
    onSuccess: (data) => {
      toast.success('Stall updated');
      queryClient.invalidateQueries({ queryKey: stallKeys.byEvent(data.expo_event_id) });
      queryClient.invalidateQueries({ queryKey: stallKeys.detail(data.id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Delete a stall. Requires the event ID for cache invalidation.
 */
export function useDeleteStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; eventId: string }) => StallService.delete(id),
    onSuccess: (_data, variables) => {
      toast.success('Stall deleted');
      queryClient.invalidateQueries({ queryKey: stallKeys.byEvent(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(variables.eventId) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
