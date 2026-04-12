/**
 * React Query hooks for Portfolio Intelligence Dashboard
 */

import { useQuery } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

/**
 * Fetch portfolio dashboard data (KPIs, TRL distribution, risk heatmap, attention list)
 */
export function usePortfolioDashboard() {
  return useQuery({
    queryKey: startupStudioKeys.portfolio.dashboard(),
    queryFn: () => apiClient.get('/api/startup-studio/portfolio/dashboard'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}
