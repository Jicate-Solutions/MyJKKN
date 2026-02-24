'use client';

/**
 * Solutions Hub - Overdue Prospects Hook
 * Purpose: Fetches prospects with overdue follow-up dates (next_action_date < today).
 */

import { useQuery } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

export function useOverdueProspects() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.overdue(),
    queryFn: () => apiClient.get('/api/solutions/prospects', { params: { overdue_only: true, limit: 50 } }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
