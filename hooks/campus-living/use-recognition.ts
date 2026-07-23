'use client';

/**
 * Campus Living Recognition hooks (CARE keystone, 2026-06-12).
 *
 * Query keys live under ['campus-living', 'recognition', ...]. The my-meals
 * page consumes useMyRecognition(module: 'mess'); the /my-hostel overview
 * consumes usePublicWins() across all modules.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { RecognitionService } from '@/lib/services/campus-living/recognition-service';

export function useMyRecognition(
  learnerId: string | null,
  module?: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['campus-living', 'recognition', 'mine', learnerId, module ?? 'all'],
    queryFn: () => RecognitionService.getMyRecognition(learnerId!, module),
    enabled: enabled && !!learnerId,
  });
}

export function usePublicWins(module?: string, enabled = true) {
  return useQuery({
    queryKey: ['campus-living', 'recognition', 'wins', module ?? 'all'],
    queryFn: () => RecognitionService.getPublicWins(module),
    enabled,
    staleTime: 60_000,
  });
}

export function useRecognitionFeedEnabled() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['campus-living', 'recognition', 'feed-enabled'],
    queryFn: () => RecognitionService.getFeedEnabled(),
    enabled: !!profile?.id,
    staleTime: 5 * 60_000,
  });
}
