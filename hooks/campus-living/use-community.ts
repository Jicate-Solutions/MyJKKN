'use client';

/**
 * React Query wrappers for the hostel community noticeboard.
 *
 * Pairs with lib/services/campus-living/community-service.ts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { CommunityService } from '@/lib/services/campus-living/community-service';
import type {
  CreateHostelCommunityPostDTO,
  HostelCommunityConfigUpsert,
  HostelCommunityPostType,
} from '@/types/campus-living/community';

export const communityKeys = {
  all: ['campus-living', 'community'] as const,
  posts: (filters: Record<string, unknown>) =>
    ['campus-living', 'community', 'posts', filters] as const,
  config: (institutionId: string | undefined) =>
    ['campus-living', 'community', 'config', institutionId] as const,
  categories: ['campus-living', 'community', 'categories'] as const,
};

// ── Posts ─────────────────────────────────────────────────────────────────

export function useCommunityPosts(
  institutionId: string | undefined,
  filters?: {
    post_type?: HostelCommunityPostType;
    block_id?: string | null;
    search?: string;
    include_unpublished?: boolean;
  },
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: communityKeys.posts({ institutionId, ...filters }),
    queryFn: () =>
      CommunityService.getPosts(
        isSuperAdmin ? institutionId : institutionId,
        filters,
      ),
    enabled: !!institutionId,
  });
}

export function useCreateCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelCommunityPostDTO) =>
      CommunityService.createPost(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      toast.success('Post created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create post: ${error.message}`);
    },
  });
}

export function useDeleteCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CommunityService.deletePost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      toast.success('Post deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete post: ${error.message}`);
    },
  });
}

export function useToggleCommunityPostPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_pinned }: { id: string; is_pinned: boolean }) =>
      CommunityService.togglePin(id, is_pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle pin: ${error.message}`);
    },
  });
}

// ── Config ────────────────────────────────────────────────────────────────

export function useCommunityConfig(institutionId: string | undefined) {
  return useQuery({
    queryKey: communityKeys.config(institutionId),
    queryFn: () => CommunityService.getConfig(institutionId),
    enabled: !!institutionId,
  });
}

export function useUpsertCommunityConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      payload,
    }: {
      institutionId: string;
      payload: HostelCommunityConfigUpsert;
    }) => CommunityService.upsertConfig(institutionId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: communityKeys.config(variables.institutionId),
      });
      toast.success('Community settings saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save settings: ${error.message}`);
    },
  });
}

// ── Categories ────────────────────────────────────────────────────────────

export function useCommunityCategories() {
  return useQuery({
    queryKey: communityKeys.categories,
    queryFn: () => CommunityService.getCategories(),
  });
}
