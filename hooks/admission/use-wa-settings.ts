// hooks/admission/use-wa-settings.ts
// React Query hooks for WhatsApp Settings (auto-assignment config)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { WhatsAppSettings } from '@/types/whatsapp';

export const waSettingsKeys = {
  all: ['wa-settings'] as const,
  detail: (institutionId: string) =>
    [...waSettingsKeys.all, institutionId] as const,
};

async function fetchSettings(institutionId: string): Promise<WhatsAppSettings> {
  const params = new URLSearchParams({ institution_id: institutionId });
  const res = await fetch(`/api/admission/settings/whatsapp?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch settings');
  }
  const json = await res.json();
  return json.data;
}

async function updateSettings(
  institutionId: string,
  updates: Partial<WhatsAppSettings>
): Promise<WhatsAppSettings> {
  const res = await fetch('/api/admission/settings/whatsapp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId, ...updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update settings');
  }
  const json = await res.json();
  return json.data;
}

export function useWASettings(institutionId: string | undefined) {
  const query = useQuery({
    queryKey: waSettingsKeys.detail(institutionId || ''),
    queryFn: () => fetchSettings(institutionId!),
    enabled: !!institutionId,
  });

  return {
    settings: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useUpdateWASettings(institutionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<WhatsAppSettings>) =>
      updateSettings(institutionId!, updates),
    onSuccess: (data) => {
      queryClient.setQueryData(
        waSettingsKeys.detail(institutionId || ''),
        data
      );
      toast.success('Settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
