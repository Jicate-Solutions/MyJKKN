'use client';

/**
 * React Query hook for single Instagram account detail view.
 *
 * Fetches account metadata + last 30 metric snapshots + recent posts
 * + last 20 audit log entries.
 *
 * Depends on /api/social/instagram/accounts/[id] (Agent γ).
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchIgAccountDetail,
  type IgAccountDetail,
} from '@/services/instagram-service';

export const IG_ACCOUNT_DETAIL_QUERY_KEY = 'ig-account-detail';

export function useInstagramAccountDetail(id: string | null) {
  return useQuery<IgAccountDetail, Error>({
    queryKey: [IG_ACCOUNT_DETAIL_QUERY_KEY, id],
    queryFn: () => {
      if (!id) throw new Error('Account ID required');
      return fetchIgAccountDetail(id);
    },
    enabled: !!id,
    staleTime: 60_000,
    retry: 1,
  });
}
