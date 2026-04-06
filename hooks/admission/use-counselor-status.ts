// hooks/admission/use-counselor-status.ts
// React Query hook for counselor availability from Exotel CCM API
// Auto-refetches every 30 seconds for near-real-time status

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// TYPES (mirror API response)
// ============================================================================

export type CounselorStatus = 'online' | 'on_call' | 'offline';

export interface CounselorInfo {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: CounselorStatus;
  active_call_sid: string | null;
  active_call_start: string | null;
  last_login: string | null;
  has_active_device: boolean;
  device_types: string[];
}

export interface CounselorStatusSummary {
  total: number;
  online: number;
  on_call: number;
  offline: number;
}

export interface CounselorStatusResponse {
  counselors: CounselorInfo[];
  summary: CounselorStatusSummary;
  fetched_at: string;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const counselorStatusKeys = {
  all: ['counselor-status'] as const,
  status: () => [...counselorStatusKeys.all, 'live'] as const,
};

// ============================================================================
// HOOK
// ============================================================================

export function useCounselorStatus() {
  const query = useQuery<CounselorStatusResponse>({
    queryKey: counselorStatusKeys.status(),
    queryFn: async () => {
      const res = await fetch('/api/admission/counselors/status');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch counselor status' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return res.json();
    },
    // Refetch every 30 seconds for near-real-time updates
    refetchInterval: 30_000,
    // Keep showing stale data while refetching
    staleTime: 15_000,
    // Don't refetch on window focus more than once per 15s
    refetchOnWindowFocus: true,
  });

  return {
    counselors: query.data?.counselors || [],
    summary: query.data?.summary || { total: 0, online: 0, on_call: 0, offline: 0 },
    fetchedAt: query.data?.fetched_at || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
