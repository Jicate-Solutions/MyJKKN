'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CommunityService } from '@/lib/services/campus-living/community-service'
import type { UpdateCommunityConfigDTO } from '@/types/campus-living'
import { toast } from 'sonner'

// Query key factory
export const communityKeys = {
  all: ['campus-living-community'] as const,
  config: (institutionId?: string) =>
    [...communityKeys.all, 'config', institutionId] as const,
  feed: (institutionId?: string) =>
    [...communityKeys.all, 'feed', institutionId] as const,
}

export function useCommunityConfig(institutionId?: string) {
  return useQuery({
    queryKey: communityKeys.config(institutionId),
    queryFn: () => CommunityService.getCommunityConfig(institutionId!),
    enabled: !!institutionId,
  })
}

export function useCommunityFeed(institutionId?: string) {
  return useQuery({
    queryKey: communityKeys.feed(institutionId),
    queryFn: () => CommunityService.getCommunityFeed(institutionId!),
    enabled: !!institutionId,
  })
}

export function useUpdateCommunityConfig(institutionId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateCommunityConfigDTO) =>
      CommunityService.updateCommunityConfig(institutionId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.config(institutionId) })
      queryClient.invalidateQueries({ queryKey: communityKeys.feed(institutionId) })
      toast.success('Community settings updated')
    },
    onError: () => {
      toast.error('Failed to update community settings')
    },
  })
}
