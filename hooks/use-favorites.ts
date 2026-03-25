import { useState, useEffect, useCallback, useMemo } from 'react';
import { FavoritesService } from '@/lib/services/favorites-service';
import type { FavoriteApp, UseFavoritesReturn } from '@/types/favorites';
import { toast } from 'react-hot-toast';

export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteApp[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load favorites on mount
  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [favoriteApps, favoriteIdsList] = await Promise.all([
        FavoritesService.getFavoriteApps(),
        FavoritesService.getFavoriteIds()
      ]);

      setFavorites(favoriteApps);
      setFavoriteIds(new Set(favoriteIdsList));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load favorites';
      setError(errorMessage);
      console.error('Error loading favorites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Add favorite
  const addFavorite = useCallback(async (applicationId: string) => {
    try {
      const favorite = await FavoritesService.addFavorite(applicationId);

      // Update local state optimistically
      setFavoriteIds(prev => new Set([...prev, applicationId]));

      // Refresh the full list to get app details
      await loadFavorites();

      toast.success('Added to favorites!');
      return favorite;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add favorite';
      toast.error(errorMessage);
      throw err;
    }
  }, [loadFavorites]);

  // Remove favorite
  const removeFavorite = useCallback(async (applicationId: string) => {
    try {
      await FavoritesService.removeFavorite(applicationId);

      // Update local state optimistically
      setFavoriteIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });

      setFavorites(prev => prev.filter(app => app.id !== applicationId));

      toast.success('Removed from favorites');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove favorite';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  // Check if app is favorite
  const isFavorite = useCallback((applicationId: string): boolean => {
    return favoriteIds.has(applicationId);
  }, [favoriteIds]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (applicationId: string): Promise<boolean> => {
    if (isFavorite(applicationId)) {
      await removeFavorite(applicationId);
      return false;
    } else {
      await addFavorite(applicationId);
      return true;
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  // Get favorites
  const getFavorites = useCallback(async (): Promise<FavoriteApp[]> => {
    return favorites;
  }, [favorites]);

  // Get favorite count
  const getFavoriteCount = useCallback((): number => {
    return favoriteIds.size;
  }, [favoriteIds]);

  // Refresh favorites
  const refreshFavorites = useCallback(async (): Promise<void> => {
    await loadFavorites();
  }, [loadFavorites]);

  return {
    // Data
    favorites,
    favoriteIds,

    // State
    loading,
    error,

    // Actions
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    getFavorites,
    getFavoriteCount,
    refreshFavorites
  };
}