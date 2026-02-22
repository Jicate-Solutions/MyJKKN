'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RoommateMatchingService } from '@/lib/services/campus-living/roommate-matching-service';
import type {
  HostelRoommatePreference,
  CreateHostelRoommatePreferenceDTO,
} from '@/types/campus-living';

// Query key factory
export const roommateMatchingKeys = {
  all: ['roommate-matching'] as const,
  list: (filters: Record<string, unknown>) => ['roommate-matching', 'list', filters] as const,
  detail: (id: string) => ['roommate-matching', 'detail', id] as const,
};

// --- Query hooks ---

export function useRoommatePreferences(institutionId: string, academicYearId?: string) {
  return useQuery({
    queryKey: roommateMatchingKeys.list({ institutionId, academicYearId }),
    queryFn: () => RoommateMatchingService.getPreferences(institutionId, academicYearId),
    enabled: !!institutionId,
  });
}

export function useRoommatePreference(learnerId: string, academicYearId: string) {
  return useQuery({
    queryKey: roommateMatchingKeys.detail(learnerId),
    queryFn: () => RoommateMatchingService.getPreference(learnerId, academicYearId),
    enabled: !!learnerId && !!academicYearId,
  });
}

// --- Mutation hooks ---

export function useCreateRoommatePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelRoommatePreferenceDTO) =>
      RoommateMatchingService.savePreference(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roommateMatchingKeys.all });
      toast.success('Roommate preferences saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save preferences: ${error.message}`);
    },
  });
}

export function useUpdateRoommatePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelRoommatePreferenceDTO> }) =>
      RoommateMatchingService.updatePreference(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roommateMatchingKeys.all });
      queryClient.invalidateQueries({ queryKey: roommateMatchingKeys.detail(variables.id) });
      toast.success('Preferences updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update preferences: ${error.message}`);
    },
  });
}

export function useDeleteRoommatePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RoommateMatchingService.deletePreference(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roommateMatchingKeys.all });
      toast.success('Preferences deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete preferences: ${error.message}`);
    },
  });
}
