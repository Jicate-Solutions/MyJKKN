// hooks/admission/use-template-analytics.ts
// React Query hooks for per-template WhatsApp engagement analytics (Gap 7)

import { useQuery } from '@tanstack/react-query';
import type {
  TemplateAnalytics,
  DailyMetric,
} from '@/lib/services/whatsapp/whatsapp-template-analytics-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const templateAnalyticsKeys = {
  all: ['template-analytics'] as const,
  list: (institutionId: string, from?: string, to?: string) =>
    [...templateAnalyticsKeys.all, 'list', institutionId, from, to] as const,
  timeline: (templateId: string, from?: string, to?: string) =>
    [...templateAnalyticsKeys.all, 'timeline', templateId, from, to] as const,
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

interface AnalyticsResponse {
  analytics: TemplateAnalytics[];
  top_performing: TemplateAnalytics[];
  worst_performing: TemplateAnalytics[];
}

async function fetchTemplateAnalytics(
  institutionId: string,
  from?: string,
  to?: string
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ institution_id: institutionId });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const res = await fetch(`/api/admission/chat/templates/analytics?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch template analytics');
  }
  return res.json();
}

async function fetchTemplateTimeline(
  templateId: string,
  institutionId: string,
  from: string,
  to: string
): Promise<DailyMetric[]> {
  const params = new URLSearchParams({
    institution_id: institutionId,
    template_id: templateId,
    from,
    to,
  });

  const res = await fetch(`/api/admission/chat/templates/analytics?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch template timeline');
  }
  const data = await res.json();
  return data.timeline;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch all template analytics for an institution
 */
export function useTemplateAnalytics(
  institutionId?: string,
  dateRange?: { from?: string; to?: string }
) {
  const query = useQuery({
    queryKey: templateAnalyticsKeys.list(
      institutionId || '',
      dateRange?.from,
      dateRange?.to
    ),
    queryFn: () => fetchTemplateAnalytics(institutionId!, dateRange?.from, dateRange?.to),
    enabled: !!institutionId,
  });

  return {
    analytics: query.data?.analytics || [],
    topPerforming: query.data?.top_performing || [],
    worstPerforming: query.data?.worst_performing || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch daily timeline for a specific template
 */
export function useTemplateTimeline(
  templateId: string | null,
  institutionId?: string,
  dateRange?: { from: string; to: string }
) {
  const query = useQuery({
    queryKey: templateAnalyticsKeys.timeline(
      templateId || '',
      dateRange?.from,
      dateRange?.to
    ),
    queryFn: () =>
      fetchTemplateTimeline(
        templateId!,
        institutionId!,
        dateRange!.from,
        dateRange!.to
      ),
    enabled: !!templateId && !!institutionId && !!dateRange?.from && !!dateRange?.to,
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
