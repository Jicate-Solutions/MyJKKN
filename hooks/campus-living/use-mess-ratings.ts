'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessRatingService } from '@/lib/services/campus-living/mess-rating-service';
import { canRate, type CanRateInput, type CanRateResult } from '@/lib/services/campus-living/mess-rating-gate';
import type { CreateMessMealRatingDTO } from '@/types/campus-living';

// Query key factory
export const messRatingKeys = {
  all: ['mess-ratings'] as const,
  myList: (profileId: string) => ['mess-ratings', 'mine', profileId] as const,
  myForMenu: (profileId: string, menuId: string) =>
    ['mess-ratings', 'mine-for-menu', profileId, menuId] as const,
  popular: (institutionId: string, daysBack: number) =>
    ['mess-ratings', 'popular', institutionId, daysBack] as const,
  activity: (institutionId: string, daysBack: number) =>
    ['mess-ratings', 'activity', institutionId, daysBack] as const,
  canRate: (profileId: string, menuId: string) =>
    ['mess-ratings', 'can-rate', profileId, menuId] as const,
};

// --- Query hooks ---

export function useMyRatings(profileId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: messRatingKeys.myList(profileId ?? ''),
    queryFn: () => MessRatingService.getMyRatings(profileId as string, limit),
    enabled: !!profileId,
  });
}

export function useMyRatingsForMenu(profileId: string | undefined, menuId: string | undefined) {
  return useQuery({
    queryKey: messRatingKeys.myForMenu(profileId ?? '', menuId ?? ''),
    queryFn: () =>
      MessRatingService.getMyRatingsForMenu(profileId as string, menuId as string),
    enabled: !!profileId && !!menuId,
  });
}

export function usePopularItems(institutionId: string | undefined, daysBack = 30) {
  return useQuery({
    queryKey: messRatingKeys.popular(institutionId ?? '', daysBack),
    queryFn: () => MessRatingService.getPopularItems(institutionId as string, daysBack),
    enabled: !!institutionId,
  });
}

export function useRatingActivity(institutionId: string | undefined, daysBack = 30) {
  return useQuery({
    queryKey: messRatingKeys.activity(institutionId ?? '', daysBack),
    queryFn: () => MessRatingService.getActivityByDay(institutionId as string, daysBack),
    enabled: !!institutionId,
  });
}

/**
 * Resolves whether the current profile may rate the given menu cell.
 * Backed by canRate() in the gate module. Returns the full CanRateResult so
 * UI can show the specific reason ("not Premium-Plus", "window closed", etc).
 */
export function useCanRate(input: CanRateInput | null) {
  return useQuery<CanRateResult>({
    queryKey: input
      ? messRatingKeys.canRate(input.profileId, input.menu.id)
      : ['mess-ratings', 'can-rate', 'noop'],
    queryFn: () => canRate(input as CanRateInput),
    enabled: !!input,
    staleTime: 60_000, // 1 min — tier + policies don't change often
  });
}

// --- Mutation hooks ---

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessMealRatingDTO) =>
      MessRatingService.submitRating(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messRatingKeys.all });
      queryClient.invalidateQueries({
        queryKey: messRatingKeys.myList(variables.profile_id),
      });
      queryClient.invalidateQueries({
        queryKey: messRatingKeys.myForMenu(variables.profile_id, variables.menu_id),
      });
      toast.success('Rating saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save rating: ${error.message}`);
    },
  });
}

export function useSubmitRatingsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payloads: CreateMessMealRatingDTO[]) =>
      MessRatingService.submitRatingsBulk(payloads),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messRatingKeys.all });
      if (variables[0]) {
        queryClient.invalidateQueries({
          queryKey: messRatingKeys.myList(variables[0].profile_id),
        });
        queryClient.invalidateQueries({
          queryKey: messRatingKeys.myForMenu(
            variables[0].profile_id,
            variables[0].menu_id,
          ),
        });
      }
      toast.success(`${variables.length} rating${variables.length === 1 ? '' : 's'} saved`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to save ratings: ${error.message}`);
    },
  });
}
