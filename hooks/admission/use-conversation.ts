// hooks/admission/use-conversation.ts
// React Query hook for single conversation + messages

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Conversation,
  ChatMessage,
} from '@/lib/services/whatsapp/whatsapp-chat-service';

export const conversationDetailKeys = {
  all: ['wa-conversation'] as const,
  detail: (id: string) => [...conversationDetailKeys.all, id] as const,
  messages: (id: string) => [...conversationDetailKeys.all, id, 'messages'] as const,
};

async function fetchConversation(id: string): Promise<Conversation> {
  const res = await fetch(`/api/admission/chat/conversations/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch conversation');
  }
  const json = await res.json();
  return json.data;
}

async function fetchMessages(
  id: string,
  cursor?: string
): Promise<{ data: ChatMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '50');

  const res = await fetch(
    `/api/admission/chat/conversations/${id}/messages?${params}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch messages');
  }
  return res.json();
}

/**
 * Hook for a single conversation with details
 */
export function useConversation(conversationId: string | null) {
  const query = useQuery({
    queryKey: conversationDetailKeys.detail(conversationId || ''),
    queryFn: () => fetchConversation(conversationId!),
    enabled: !!conversationId,
    refetchInterval: 15000,
  });

  return {
    conversation: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for conversation messages with infinite scroll (cursor-based)
 */
export function useConversationMessages(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: conversationDetailKeys.messages(conversationId || ''),
    queryFn: ({ pageParam }) => fetchMessages(conversationId!, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!conversationId,
    refetchInterval: 5000, // Poll for new messages every 5s
    staleTime: 3000,
  });

  // Flatten all pages into a single messages array (chronological order)
  const messages = query.data?.pages.flatMap((page) => page.data) || [];

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInvalidateConversation() {
  const queryClient = useQueryClient();
  return (id: string) => {
    queryClient.invalidateQueries({ queryKey: conversationDetailKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: conversationDetailKeys.messages(id) });
  };
}
