'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { getPageRegistry } from '@/lib/navigation/page-registry';
import { searchPages, groupSearchResults } from '@/lib/navigation/search-engine';
import { filterByPermissions } from '@/lib/navigation/permission-filter';
import { getRecentPages, getFrequentPages } from '@/lib/navigation/recent-pages';
import type { PageEntry, SearchResult, RecentPage } from '@/lib/navigation/types';

interface UsePageSearchReturn {
  /** Perform a fuzzy search against the permission-filtered registry */
  search: (query: string) => { pages: SearchResult[]; actions: SearchResult[] };
  /** All pages the user has access to */
  searchablePages: PageEntry[];
  /** Most recently visited pages */
  recentPages: RecentPage[];
  /** Most frequently visited pages */
  frequentPages: RecentPage[];
  /** Whether permissions are still loading */
  isLoading: boolean;
}

/**
 * Hook that provides permission-aware page search with recent/frequent pages.
 *
 * Combines:
 * - Page Registry (all app pages with keywords)
 * - fuse.js fuzzy search
 * - Permission filtering via usePermissions()
 * - Recent/frequent pages from localStorage
 */
export function usePageSearch(): UsePageSearchReturn {
  const {
    permissions,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading,
  } = usePermissions();

  // Favorites feed the search-engine boost so starred pages climb the results.
  const { favorites } = usePageFavorites();
  const favoritePaths = useMemo(
    () => new Set(favorites.map((f) => f.path)),
    [favorites]
  );

  // Memoize the permission-filtered registry so fuse.js index isn't rebuilt on every render
  const searchablePages = useMemo(() => {
    const registry = getPageRegistry();
    return filterByPermissions(
      registry,
      permissions,
      isSuperAdmin,
      userProfile?.role || ''
    );
  }, [permissions, isSuperAdmin, userProfile?.role]);

  // Memoized search function
  const search = useCallback(
    (query: string) => {
      const results = searchPages(query, searchablePages, 15, favoritePaths);
      return groupSearchResults(results);
    },
    [searchablePages, favoritePaths]
  );

  // Recent and frequent pages — refresh on mount and route changes
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const [frequentPages, setFrequentPages] = useState<RecentPage[]>([]);

  useEffect(() => {
    setRecentPages(getRecentPages(8));
    setFrequentPages(getFrequentPages(5));
  }, []);

  /** Refresh recent pages (call after navigation) */
  const refreshRecents = useCallback(() => {
    setRecentPages(getRecentPages(8));
    setFrequentPages(getFrequentPages(5));
  }, []);

  return {
    search,
    searchablePages,
    recentPages,
    frequentPages,
    isLoading: permissionsLoading,
  };
}
