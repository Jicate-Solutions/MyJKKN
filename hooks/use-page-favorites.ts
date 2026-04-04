'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { FavoritesService } from '@/lib/services/navigation/favorites-service';
import type { FavoritePage } from '@/lib/navigation/types';

const FAVORITES_KEY = 'page-favorites';

/**
 * Hook for managing user page favorites.
 * Uses React Query for caching and optimistic updates.
 */
export function usePageFavorites() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = profile?.id;

  // ── Query: fetch all favorites ──────────────────────────────────────────
  const {
    data: favorites = [],
    isLoading,
    error,
  } = useQuery<FavoritePage[]>({
    queryKey: [FAVORITES_KEY, userId],
    queryFn: () => FavoritesService.getUserFavorites(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ── Mutation: add favorite ──────────────────────────────────────────────
  const addFavorite = useMutation({
    mutationFn: (page: { path: string; title: string; module: string; iconName: string }) =>
      FavoritesService.addFavorite(userId!, page),
    onMutate: async (page) => {
      await queryClient.cancelQueries({ queryKey: [FAVORITES_KEY, userId] });
      const previous = queryClient.getQueryData<FavoritePage[]>([FAVORITES_KEY, userId]);

      // Optimistic update
      const optimistic: FavoritePage = {
        path: page.path,
        title: page.title,
        module: page.module,
        iconName: page.iconName,
        sortOrder: (previous?.length || 0),
        isPinned: false,
      };
      queryClient.setQueryData<FavoritePage[]>(
        [FAVORITES_KEY, userId],
        [...(previous || []), optimistic]
      );

      return { previous };
    },
    onError: (_err, _page, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FAVORITES_KEY, userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, userId] });
    },
  });

  // ── Mutation: remove favorite ───────────────────────────────────────────
  const removeFavorite = useMutation({
    mutationFn: (pagePath: string) =>
      FavoritesService.removeFavorite(userId!, pagePath),
    onMutate: async (pagePath) => {
      await queryClient.cancelQueries({ queryKey: [FAVORITES_KEY, userId] });
      const previous = queryClient.getQueryData<FavoritePage[]>([FAVORITES_KEY, userId]);

      queryClient.setQueryData<FavoritePage[]>(
        [FAVORITES_KEY, userId],
        (previous || []).filter(f => f.path !== pagePath)
      );

      return { previous };
    },
    onError: (_err, _path, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FAVORITES_KEY, userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, userId] });
    },
  });

  // ── Mutation: toggle pin ────────────────────────────────────────────────
  const togglePin = useMutation({
    mutationFn: ({ pagePath, isPinned }: { pagePath: string; isPinned: boolean }) =>
      FavoritesService.togglePin(userId!, pagePath, isPinned),
    onMutate: async ({ pagePath, isPinned }) => {
      await queryClient.cancelQueries({ queryKey: [FAVORITES_KEY, userId] });
      const previous = queryClient.getQueryData<FavoritePage[]>([FAVORITES_KEY, userId]);

      queryClient.setQueryData<FavoritePage[]>(
        [FAVORITES_KEY, userId],
        (previous || []).map(f =>
          f.path === pagePath ? { ...f, isPinned } : f
        )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FAVORITES_KEY, userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, userId] });
    },
  });

  // ── Mutation: reorder favorites ─────────────────────────────────────────
  const reorderFavorites = useMutation({
    mutationFn: (orderedPaths: string[]) =>
      FavoritesService.updateFavoriteOrder(userId!, orderedPaths),
    onMutate: async (orderedPaths) => {
      await queryClient.cancelQueries({ queryKey: [FAVORITES_KEY, userId] });
      const previous = queryClient.getQueryData<FavoritePage[]>([FAVORITES_KEY, userId]);

      // Reorder optimistically
      const reordered = orderedPaths
        .map((path, index) => {
          const fav = (previous || []).find(f => f.path === path);
          return fav ? { ...fav, sortOrder: index } : null;
        })
        .filter(Boolean) as FavoritePage[];

      queryClient.setQueryData<FavoritePage[]>([FAVORITES_KEY, userId], reordered);
      return { previous };
    },
    onError: (_err, _paths, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FAVORITES_KEY, userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, userId] });
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const isFavorite = (path: string): boolean =>
    favorites.some(f => f.path === path);

  const pinnedFavorites = favorites.filter(f => f.isPinned);
  const unpinnedFavorites = favorites.filter(f => !f.isPinned);

  return {
    favorites,
    pinnedFavorites,
    unpinnedFavorites,
    isLoading,
    error,
    addFavorite,
    removeFavorite,
    togglePin,
    reorderFavorites,
    isFavorite,
  };
}
