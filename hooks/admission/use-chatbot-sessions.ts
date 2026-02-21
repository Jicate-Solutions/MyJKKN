// hooks/admission/use-chatbot-sessions.ts
// Hooks for chatbot session management (admin view)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const chatbotSessionsKeys = {
  sessions: (institutionId: string, filters?: Record<string, string>) =>
    ['chatbot-sessions', institutionId, filters] as const,
  session: (id: string) => ['chatbot-session', id] as const,
};

interface SessionFilters {
  institution_id: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useChatbotSessions(filters: SessionFilters) {
  const query = useQuery({
    queryKey: chatbotSessionsKeys.sessions(filters.institution_id, filters as any),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', filters.institution_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const res = await fetch(`/api/admission/chatbot/sessions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
    enabled: !!filters.institution_id,
  });

  return {
    sessions: query.data?.sessions || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useChatbotSession(sessionId: string) {
  const query = useQuery({
    queryKey: chatbotSessionsKeys.session(sessionId),
    queryFn: async () => {
      const res = await fetch(`/api/admission/chatbot/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json();
    },
    enabled: !!sessionId,
  });

  return {
    session: query.data?.session || null,
    messages: query.data?.messages || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useChatbotSessionMutations() {
  const queryClient = useQueryClient();

  const handoffSession = useMutation({
    mutationFn: async ({
      sessionId,
      counselorId,
      reason,
    }: {
      sessionId: string;
      counselorId?: string;
      reason: string;
    }) => {
      const res = await fetch(`/api/admission/chatbot/sessions/${sessionId}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselor_id: counselorId, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to handoff session');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Session handed off to counselor');
      queryClient.invalidateQueries({ queryKey: ['chatbot-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chatbot-session'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to handoff session');
    },
  });

  return { handoffSession };
}
