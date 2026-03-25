// hooks/admission/use-chatbot-knowledge.ts
// Hook for chatbot knowledge base document management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const chatbotKnowledgeKeys = {
  documents: (chatbotId: string, status?: string) =>
    ['chatbot-knowledge', chatbotId, status] as const,
};

export function useChatbotKnowledge(chatbotId?: string, status?: string) {
  const query = useQuery({
    queryKey: chatbotKnowledgeKeys.documents(chatbotId || '', status),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('chatbot_id', chatbotId!);
      if (status) params.set('status', status);

      const res = await fetch(`/api/admission/chatbot/knowledge?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch knowledge base');
      return res.json();
    },
    enabled: !!chatbotId,
  });

  return {
    documents: query.data?.documents || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useChatbotKnowledgeMutations() {
  const queryClient = useQueryClient();

  const addDocument = useMutation({
    mutationFn: async (docData: {
      chatbot_id: string;
      title: string;
      source_type: 'url' | 'document' | 'manual';
      source_url?: string;
      content: string;
    }) => {
      const res = await fetch('/api/admission/chatbot/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add document');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Document added to knowledge base');
      queryClient.invalidateQueries({ queryKey: ['chatbot-knowledge'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add document');
    },
  });

  const updateDocument = useMutation({
    mutationFn: async (data: { id: string; [key: string]: unknown }) => {
      const res = await fetch('/api/admission/chatbot/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update document');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Document updated');
      queryClient.invalidateQueries({ queryKey: ['chatbot-knowledge'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update document');
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admission/chatbot/knowledge?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete document');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['chatbot-knowledge'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete document');
    },
  });

  return { addDocument, updateDocument, deleteDocument };
}
