// hooks/admission/use-counselor-performance.ts
// React Query hooks for Counselor Performance Dashboard (Gap 10)

import { useQuery } from '@tanstack/react-query';

// =============================================================================
// Types (client-side mirror of service types)
// =============================================================================

export interface CounselorMetrics {
  counselor_id: string;
  counselor_name: string;
  avatar_url: string | null;
  total_conversations: number;
  resolved_conversations: number;
  open_conversations: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  messages_sent: number;
  messages_received: number;
  resolution_rate: number;
}

export interface ResponseTimeDistribution {
  bucket: string;
  count: number;
  percentage: number;
}

export interface CounselorTimelineEntry {
  date: string;
  conversations: number;
  messages: number;
  avg_response_min: number;
}

// =============================================================================
// Query Keys
// =============================================================================

export const counselorPerfKeys = {
  all: ['counselor-performance'] as const,
  list: (institutionId: string, from?: string, to?: string) =>
    [...counselorPerfKeys.all, 'list', institutionId, from, to] as const,
  timeline: (counselorId: string, institutionId?: string, from?: string, to?: string) =>
    [...counselorPerfKeys.all, 'timeline', counselorId, institutionId, from, to] as const,
};

// =============================================================================
// API Helpers
// =============================================================================

async function fetchCounselorPerformance(
  institutionId: string,
  from?: string,
  to?: string
): Promise<{ counselors: CounselorMetrics[]; distribution: ResponseTimeDistribution[] }> {
  const params = new URLSearchParams({ institution_id: institutionId });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const res = await fetch(`/api/admission/chat/counselor-performance?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch counselor performance');
  }
  return res.json();
}

async function fetchCounselorTimeline(
  counselorId: string,
  institutionId: string,
  from: string,
  to: string
): Promise<CounselorTimelineEntry[]> {
  const params = new URLSearchParams({
    institution_id: institutionId,
    counselor_id: counselorId,
    from,
    to,
  });

  const res = await fetch(`/api/admission/chat/counselor-performance?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch counselor timeline');
  }
  const json = await res.json();
  return json.timeline;
}

// =============================================================================
// Hooks
// =============================================================================

export function useCounselorPerformance(
  institutionId: string | undefined,
  dateRange?: { from?: string; to?: string }
) {
  const query = useQuery({
    queryKey: counselorPerfKeys.list(
      institutionId || '',
      dateRange?.from,
      dateRange?.to
    ),
    queryFn: () =>
      fetchCounselorPerformance(institutionId!, dateRange?.from, dateRange?.to),
    enabled: !!institutionId,
  });

  return {
    counselors: query.data?.counselors || [],
    distribution: query.data?.distribution || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCounselorTimeline(
  counselorId: string | undefined,
  institutionId: string | undefined,
  dateRange?: { from: string; to: string }
) {
  const query = useQuery({
    queryKey: counselorPerfKeys.timeline(counselorId || '', institutionId, dateRange?.from, dateRange?.to),
    queryFn: () =>
      fetchCounselorTimeline(
        counselorId!,
        institutionId!,
        dateRange?.from || new Date(Date.now() - 30 * 86400000).toISOString(),
        dateRange?.to || new Date().toISOString()
      ),
    enabled: !!counselorId && !!institutionId,
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
