'use client';

/**
 * React Query hook for the Instagram account list view.
 *
 * Depends on /api/social/instagram/accounts (Agent γ).
 * Until that route merges, queries return error state — the UI renders the
 * empty/error CTA instead of crashing.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchIgAccounts,
  type IgAccountListFilters,
  type IgAccountListResponse,
} from '@/services/instagram-service';

export const IG_ACCOUNTS_QUERY_KEY = 'ig-accounts';

export function useInstagramAccounts(filters: IgAccountListFilters = {}) {
  return useQuery<IgAccountListResponse, Error>({
    queryKey: [IG_ACCOUNTS_QUERY_KEY, filters],
    queryFn: () => fetchIgAccounts(filters),
    staleTime: 60_000, // 1 min — poll data doesn't change every second
    retry: 1,
  });
}
