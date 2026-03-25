// hooks/admission/use-chat-mutations.ts
// Mutations for sending messages, assigning, resolving conversations

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { conversationKeys } from './use-conversations';
import { conversationDetailKeys } from './use-conversation';

// ---------------------------------------------------------------------------
// Send Message
// ---------------------------------------------------------------------------

interface SendMessageParams {
  conversationId: string;
  content: {
    text?: string;
    media_url?: string;
    media_type?: string;
    caption?: string;
    filename?: string;
  };
}

interface SendTemplateParams {
  conversationId: string;
  template_name: string;
  language_code?: string;
  template_components?: unknown[];
}

async function sendMessage(params: SendMessageParams) {
  const res = await fetch(
    `/api/admission/chat/conversations/${params.conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_type: 'text',
        content: params.content,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send message');
  }
  return res.json();
}

async function sendTemplateMsg(params: SendTemplateParams) {
  const res = await fetch(
    `/api/admission/chat/conversations/${params.conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_type: 'template',
        template_name: params.template_name,
        language_code: params.language_code || 'en',
        template_components: params.template_components,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send template');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

async function assignConversation(params: { conversationId: string; counselor_id: string }) {
  const res = await fetch(
    `/api/admission/chat/conversations/${params.conversationId}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counselor_id: params.counselor_id }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to assign conversation');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

async function resolveConversation(conversationId: string) {
  const res = await fetch(
    `/api/admission/chat/conversations/${conversationId}/resolve`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve conversation');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Reopen
// ---------------------------------------------------------------------------

async function reopenConversation(conversationId: string) {
  const res = await fetch(
    `/api/admission/chat/conversations/${conversationId}/reopen`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reopen conversation');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = (conversationId?: string) => {
    queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    if (conversationId) {
      queryClient.invalidateQueries({
        queryKey: conversationDetailKeys.detail(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationDetailKeys.messages(conversationId),
      });
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: (_data, variables) => {
      invalidateAll(variables.conversationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: sendTemplateMsg,
    onSuccess: (_data, variables) => {
      toast.success('Template sent');
      invalidateAll(variables.conversationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send template');
    },
  });

  const assignMutation = useMutation({
    mutationFn: assignConversation,
    onSuccess: (_data, variables) => {
      toast.success('Conversation assigned');
      invalidateAll(variables.conversationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveConversation,
    onSuccess: (_data, conversationId) => {
      toast.success('Conversation resolved');
      invalidateAll(conversationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenConversation,
    onSuccess: (_data, conversationId) => {
      toast.success('Conversation reopened');
      invalidateAll(conversationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reopen');
    },
  });

  return {
    sendMessage: sendMessageMutation,
    sendTemplate: sendTemplateMutation,
    assign: assignMutation,
    resolve: resolveMutation,
    reopen: reopenMutation,
    isSending: sendMessageMutation.isPending || sendTemplateMutation.isPending,
    isAssigning: assignMutation.isPending,
    isResolving: resolveMutation.isPending,
    isReopening: reopenMutation.isPending,
  };
}
