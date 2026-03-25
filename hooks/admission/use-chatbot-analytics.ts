// hooks/admission/use-chatbot-analytics.ts
// Hook for chatbot analytics data

import { useQuery } from '@tanstack/react-query';

export const chatbotAnalyticsKeys = {
  analytics: (chatbotId: string, from?: string, to?: string) =>
    ['chatbot-analytics', chatbotId, from, to] as const,
};

interface AnalyticsFilters {
  chatbot_id: string;
  from?: string;
  to?: string;
}

export function useChatbotAnalytics(filters: AnalyticsFilters) {
  const query = useQuery({
    queryKey: chatbotAnalyticsKeys.analytics(filters.chatbot_id, filters.from, filters.to),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('chatbot_id', filters.chatbot_id);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const res = await fetch(`/api/admission/chatbot/analytics?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data = await res.json();
      return data.analytics;
    },
    enabled: !!filters.chatbot_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    analytics: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
