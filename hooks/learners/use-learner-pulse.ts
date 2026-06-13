'use client';

// hooks/learners/use-learner-pulse.ts
// React Query hooks for pulse response submission and history retrieval.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { PulseResponse } from '@/services/learner-pulse-service';

// ============================================
// MUTATION: Respond to a pulse
// ============================================

interface RespondToPulseParams {
  notification_id: string;
  response_value: string;
}

async function submitPulseResponse(
  params: RespondToPulseParams
): Promise<{ success: boolean }> {
  const response = await fetch('/api/learners/pulse/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to submit pulse response');
  }

  return response.json();
}

export function useRespondToPulse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: submitPulseResponse,
    onSuccess: () => {
      // Invalidate pending pulse check so the lock modal disappears
      queryClient.invalidateQueries({ queryKey: ['learner-pulse', 'pending'] });
      // Also invalidate any pulse history queries
      queryClient.invalidateQueries({ queryKey: ['learner-pulse', 'history'] });
      toast({
        title: 'Thank you!',
        description: 'Your response has been recorded.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit response. Please try again.',
        variant: 'destructive',
      });
    },
  });
}

// ============================================
// QUERY: Pulse history for a learner
// ============================================

async function fetchPulseHistory(learnerId: string): Promise<PulseResponse[]> {
  const response = await fetch(
    `/api/learners/pulse?learner_id=${encodeURIComponent(learnerId)}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch pulse history');
  }

  const result = await response.json();
  return result.data || [];
}

export function usePulseHistory(learnerId: string) {
  return useQuery<PulseResponse[]>({
    queryKey: ['learner-pulse', 'history', learnerId],
    queryFn: () => fetchPulseHistory(learnerId),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
