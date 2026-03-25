// hooks/admission/use-chat-realtime.ts
// Supabase Realtime subscriptions for live chat updates

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { conversationKeys } from './use-conversations';
import { conversationDetailKeys } from './use-conversation';

/**
 * Subscribe to real-time updates for conversations list
 * Invalidates query cache when wa_conversations table changes
 */
export function useChatRealtimeConversations(institutionId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!institutionId) return;

    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel(`wa_conversations:${institutionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wa_conversations',
          filter: `institution_id=eq.${institutionId}`,
        },
        () => {
          // Invalidate conversation list when any conversation changes
          queryClient.invalidateQueries({ queryKey: conversationKeys.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [institutionId, queryClient]);
}

/**
 * Subscribe to real-time updates for a specific conversation's messages
 * Invalidates messages query when new messages arrive
 */
export function useChatRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel(`wa_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wa_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Invalidate messages for this conversation
          queryClient.invalidateQueries({
            queryKey: conversationDetailKeys.messages(conversationId),
          });
          // Also refresh conversation details (unread count, last message)
          queryClient.invalidateQueries({
            queryKey: conversationDetailKeys.detail(conversationId),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wa_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Status updates (sent → delivered → read)
          queryClient.invalidateQueries({
            queryKey: conversationDetailKeys.messages(conversationId),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
}

/**
 * Combined hook for full realtime chat experience
 */
export function useChatRealtime(
  institutionId: string | null,
  activeConversationId: string | null
) {
  useChatRealtimeConversations(institutionId);
  useChatRealtimeMessages(activeConversationId);

  const queryClient = useQueryClient();

  const forceRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    if (activeConversationId) {
      queryClient.invalidateQueries({
        queryKey: conversationDetailKeys.messages(activeConversationId),
      });
    }
  }, [queryClient, activeConversationId]);

  return { forceRefresh };
}
