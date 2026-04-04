'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { PageMetadataService } from '@/lib/services/navigation/page-metadata-service';
import { mergeCustomShortcuts } from '@/lib/navigation/keyboard-shortcuts';
import type { PageMetadata } from '@/lib/navigation/types';

const METADATA_KEY = 'page-metadata';

/**
 * Hook for managing page metadata (admin feature).
 * Also syncs dynamic keyboard shortcuts from page_metadata into the shortcuts registry.
 */
export function usePageMetadata() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: allMetadata = [],
    isLoading,
    error,
  } = useQuery<PageMetadata[]>({
    queryKey: [METADATA_KEY],
    queryFn: () => PageMetadataService.getAllMetadata(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Merge custom shortcuts whenever metadata loads/changes
  useEffect(() => {
    if (allMetadata.length > 0) {
      const dynamicShortcuts = allMetadata
        .filter((m) => m.shortcutKey)
        .map((m) => ({
          shortcutKey: m.shortcutKey!,
          path: m.pagePath,
          title: m.customTitle || m.pagePath.split('/').pop()?.replace(/-/g, ' ') || m.pagePath,
        }));
      mergeCustomShortcuts(dynamicShortcuts);
    }
  }, [allMetadata]);

  const upsertMetadata = useMutation({
    mutationFn: (metadata: {
      pagePath: string;
      customTitle?: string;
      description?: string;
      keywords: string[];
      category?: string;
      isSearchable: boolean;
      shortcutKey?: string | null;
    }) =>
      PageMetadataService.upsertMetadata(
        metadata,
        profile?.id || '',
        profile?.institution_id || undefined
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [METADATA_KEY] });
    },
  });

  const deleteMetadata = useMutation({
    mutationFn: (pagePath: string) => PageMetadataService.deleteMetadata(pagePath),
    onMutate: async (pagePath) => {
      await queryClient.cancelQueries({ queryKey: [METADATA_KEY] });
      const previous = queryClient.getQueryData<PageMetadata[]>([METADATA_KEY]);
      queryClient.setQueryData<PageMetadata[]>(
        [METADATA_KEY],
        (previous || []).filter((m) => m.pagePath !== pagePath)
      );
      return { previous };
    },
    onError: (_err, _path, context) => {
      if (context?.previous) {
        queryClient.setQueryData([METADATA_KEY], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [METADATA_KEY] });
    },
  });

  const getMetadataForPath = (path: string): PageMetadata | undefined =>
    allMetadata.find((m) => m.pagePath === path);

  return {
    allMetadata,
    isLoading,
    error,
    upsertMetadata,
    deleteMetadata,
    getMetadataForPath,
  };
}
