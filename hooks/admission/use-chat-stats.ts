// hooks/admission/use-chat-stats.ts
// React Query hook for chat performance metrics

import { useQuery } from '@tanstack/react-query';
import type { ChatStats } from '@/lib/services/whatsapp/whatsapp-chat-service';

export const chatStatsKeys = {
  all: ['wa-chat-stats'] as const,
};

async function fetchChatStats(): Promise<ChatStats> {
  const res = await fetch('/api/admission/chat/stats');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch chat stats');
  }
  const json = await res.json();
  return json.data;
}

export function useChatStats() {
  const query = useQuery({
    queryKey: chatStatsKeys.all,
    queryFn: fetchChatStats,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000,
  });

  return {
    stats: query.data || {
      total_open: 0,
      total_waiting: 0,
      total_resolved: 0,
      total_unread: 0,
      avg_response_time_minutes: null,
      conversations_today: 0,
      messages_today: 0,
    },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
