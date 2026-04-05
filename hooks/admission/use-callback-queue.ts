import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CallbackEntry {
  id: string;
  institution_id: string;
  call_log_id: string;
  lead_id: string | null;
  assigned_counselor_id: string | null;
  caller_number: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'expired' | 'cancelled';
  missed_count_7d: number;
  ever_connected: boolean;
  escalated: boolean;
  created_at: string;
}

export const callbackQueueKeys = {
  all: ['callback-queue'] as const,
  list: (institutionId?: string) => ['callback-queue', 'list', institutionId] as const,
  forCall: (callLogId: string) => ['callback-queue', 'call', callLogId] as const,
};

export function useCallbackQueue(institutionId?: string) {
  return useQuery({
    queryKey: callbackQueueKeys.list(institutionId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      params.set('status', 'pending');
      const res = await fetch(`/api/admission/calls/bulk-callback?${params}`);
      if (!res.ok) return [];
      return (await res.json()) as CallbackEntry[];
    },
    refetchInterval: 30000, // 30s
  });
}

export function useBulkCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callbackIds: string[]) => {
      const res = await fetch('/api/admission/calls/bulk-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackIds }),
      });
      if (!res.ok) throw new Error('Bulk callback failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callbackQueueKeys.all });
    },
  });
}
