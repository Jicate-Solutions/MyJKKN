// hooks/admission/use-quick-replies.ts
// React Query hooks for quick reply CRUD

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface QuickReply {
  id: string;
  institution_id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const quickReplyKeys = {
  all: ['wa-quick-replies'] as const,
};

async function fetchQuickReplies(): Promise<QuickReply[]> {
  const res = await fetch('/api/admission/chat/quick-replies');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch quick replies');
  }
  const json = await res.json();
  return json.data;
}

export function useQuickReplies() {
  const query = useQuery({
    queryKey: quickReplyKeys.all,
    queryFn: fetchQuickReplies,
  });

  return {
    quickReplies: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useQuickReplyMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: quickReplyKeys.all });
  };

  const createMutation = useMutation({
    mutationFn: async (params: {
      title: string;
      content: string;
      shortcut?: string;
      category?: string;
    }) => {
      const res = await fetch('/api/admission/chat/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create quick reply');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Quick reply created');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      title?: string;
      content?: string;
      shortcut?: string;
      category?: string;
    }) => {
      const res = await fetch('/api/admission/chat/quick-replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update quick reply');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Quick reply updated');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admission/chat/quick-replies?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete quick reply');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Quick reply deleted');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    create: createMutation,
    update: updateMutation,
    remove: deleteMutation,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
