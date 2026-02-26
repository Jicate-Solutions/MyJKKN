// hooks/admission/use-conversations.ts
// React Query hook for WhatsApp conversation list with filters

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Conversation,
  ConversationFilters,
  PaginatedResult,
} from '@/lib/services/whatsapp/whatsapp-chat-service';

export const conversationKeys = {
  all: ['wa-conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (filters: Partial<ConversationFilters>) =>
    [...conversationKeys.lists(), filters] as const,
};

async function fetchConversations(
  filters: Partial<ConversationFilters>
): Promise<PaginatedResult<Conversation>> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
  if (filters.search) params.set('search', filters.search);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.funnel_stage) params.set('funnel_stage', filters.funnel_stage);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`/api/admission/chat/conversations?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch conversations');
  }
  return res.json();
}

export function useConversations(filters: Partial<ConversationFilters> = {}) {
  const query = useQuery({
    queryKey: conversationKeys.list(filters),
    queryFn: () => fetchConversations(filters),
    refetchInterval: 10000, // Poll every 10s for new conversations
    staleTime: 5000,
  });

  return {
    conversations: query.data?.data || [],
    pagination: query.data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInvalidateConversations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: conversationKeys.all });
}
