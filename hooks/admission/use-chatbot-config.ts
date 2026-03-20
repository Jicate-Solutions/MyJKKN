// hooks/admission/use-chatbot-config.ts
// Hook for chatbot configuration management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const chatbotConfigKeys = {
  config: (institutionId: string) => ['chatbot-config', institutionId] as const,
};

export function useChatbotConfig(institutionId?: string) {
  const query = useQuery({
    queryKey: chatbotConfigKeys.config(institutionId || ''),
    queryFn: async () => {
      const res = await fetch(`/api/admission/chatbot/config?institution_id=${institutionId}`);
      if (!res.ok) throw new Error('Failed to fetch chatbot config');
      const data = await res.json();
      return data.config;
    },
    enabled: !!institutionId,
  });

  return {
    config: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useChatbotConfigMutations() {
  const queryClient = useQueryClient();

  const saveConfig = useMutation({
    mutationFn: async (configData: Record<string, unknown>) => {
      const res = await fetch('/api/admission/chatbot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save config');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Config saved');
      queryClient.invalidateQueries({ queryKey: ['chatbot-config'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save config');
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (configData: Record<string, unknown>) => {
      const res = await fetch('/api/admission/chatbot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update config');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Config updated');
      queryClient.invalidateQueries({ queryKey: ['chatbot-config'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update config');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch('/api/admission/chatbot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle chatbot');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast.success(variables.is_active ? 'Chatbot enabled' : 'Chatbot disabled');
      queryClient.invalidateQueries({ queryKey: ['chatbot-config'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle chatbot');
    },
  });

  return { saveConfig, updateConfig, toggleActive };
}
