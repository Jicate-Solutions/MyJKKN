'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { HostelCategoryRoomSourceService } from '@/lib/services/campus-living/hostel-category-room-source-service';
import { getErrorMessage } from '@/lib/utils';

export const categoryRoomSourceKeys = {
  all: ['campus-living', 'category-room-sources'] as const,
  list: () => ['campus-living', 'category-room-sources', 'list'] as const,
  forCategory: (categoryId: string) =>
    ['campus-living', 'category-room-sources', 'category', categoryId] as const,
};

export function useCategoryRoomSources() {
  return useQuery({
    queryKey: categoryRoomSourceKeys.list(),
    queryFn: () => HostelCategoryRoomSourceService.listAll(),
  });
}

export function useCategoryRoomSourcesFor(categoryId?: string) {
  return useQuery({
    queryKey: categoryRoomSourceKeys.forCategory(categoryId ?? ''),
    queryFn: () => HostelCategoryRoomSourceService.listForCategory(categoryId as string),
    enabled: Boolean(categoryId),
  });
}

export function useSetCategoryRoomSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, sourceCategoryIds }: { categoryId: string; sourceCategoryIds: string[] }) =>
      HostelCategoryRoomSourceService.setSources(categoryId, sourceCategoryIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryRoomSourceKeys.all });
      // Every learner-facing room list resolves the pool from this mapping, so
      // the upgrade picker and the room-change picker are both stale now.
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrade'] });
      qc.invalidateQueries({ queryKey: ['campus-living', 'room-change'] });
    },
    onError: (error) => toast.error(`Could not save room sources: ${getErrorMessage(error)}`),
  });
}
