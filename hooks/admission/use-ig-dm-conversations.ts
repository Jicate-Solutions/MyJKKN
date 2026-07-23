// hooks/admission/use-ig-dm-conversations.ts
//
// React-Query hooks for the /admission/inbox/instagram page. Mirrors the
// pattern Messenger uses inline in app/(routes)/admission/inbox/messenger/
// page.tsx — extracted here because IG DMs require institution_id query
// scoping which the page would otherwise repeat across three useQuery
// blocks.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  fetchIgDmConversations,
  fetchIgDmMessages,
  sendIgDmReply,
  type IgDmConversationsResponse,
  type IgDmMessagesResponse,
  type IgDmReplyOk,
  type IgDmReplyWindowError,
} from '@/lib/services/admission/ig-dm-service';

const POLL_CONVERSATIONS_MS = 30_000;
const POLL_MESSAGES_MS = 15_000;

export const igDmQueryKeys = {
  all: ['ig-dm'] as const,
  conversations: (institutionId: string, hasLead?: 'true' | 'false') =>
    [...igDmQueryKeys.all, 'conversations', institutionId, hasLead ?? 'all'] as const,
  messages: (conversationId: string | null) =>
    [...igDmQueryKeys.all, 'messages', conversationId ?? ''] as const,
};

/**
 * Fetches the IG DM conversation list for an institution. Polls every 30s
 * so newly-arrived DMs surface without a manual refresh.
 *
 * Returns idle (data === undefined, no error) until `institutionId` is
 * known — callers should render their own picker / loading state.
 */
export function useIgDmConversations(params: {
  institutionId: string | null;
  hasLead?: 'true' | 'false';
}): UseQueryResult<IgDmConversationsResponse, Error> {
  const institutionId = params.institutionId;
  return useQuery<IgDmConversationsResponse, Error>({
    queryKey: institutionId
      ? igDmQueryKeys.conversations(institutionId, params.hasLead)
      : [...igDmQueryKeys.all, 'conversations', 'idle'],
    queryFn: () =>
      fetchIgDmConversations({
        institutionId: institutionId as string,
        hasLead: params.hasLead,
      }),
    enabled: !!institutionId,
    refetchInterval: POLL_CONVERSATIONS_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * Fetches messages for a single DM thread. Polls every 15s.
 */
export function useIgDmMessages(
  conversationId: string | null
): UseQueryResult<IgDmMessagesResponse, Error> {
  return useQuery<IgDmMessagesResponse, Error>({
    queryKey: igDmQueryKeys.messages(conversationId),
    queryFn: () =>
      fetchIgDmMessages({
        conversationId: conversationId as string,
      }),
    enabled: !!conversationId,
    refetchInterval: POLL_MESSAGES_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * Sends an outbound reply and refreshes both the messages list and the
 * conversations list (so `last_outbound_at`/ordering update). The mutation
 * resolves with either an `IgDmReplyOk` (success) or an `IgDmReplyWindowError`
 * (24h window expired) — callers branch on `.kind === 'outside_window'`
 * to render the "wait for the user to reply" notice.
 */
export function useSendIgDmReply(params: {
  institutionId: string | null;
  conversationId: string | null;
}): UseMutationResult<IgDmReplyOk | IgDmReplyWindowError, Error, string> {
  const queryClient = useQueryClient();
  return useMutation<IgDmReplyOk | IgDmReplyWindowError, Error, string>({
    mutationFn: async (text: string) => {
      if (!params.conversationId) {
        throw new Error('No conversation selected');
      }
      return sendIgDmReply({
        conversationId: params.conversationId,
        text,
      });
    },
    onSuccess: (result) => {
      if ('kind' in result) {
        // Window-expired result — no need to refresh, nothing changed
        // server-side.
        return;
      }
      if (params.conversationId) {
        queryClient.invalidateQueries({
          queryKey: igDmQueryKeys.messages(params.conversationId),
        });
      }
      if (params.institutionId) {
        queryClient.invalidateQueries({
          queryKey: [...igDmQueryKeys.all, 'conversations'],
        });
      }
    },
  });
}
