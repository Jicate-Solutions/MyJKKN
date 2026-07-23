'use client';

// hooks/use-pulse-lock.ts
// Hook that checks for pending mandatory pulses on mount and window focus.
// Returns { hasPending, pulse, isLoading } for the root layout to decide
// whether to render the PulseLockModal.

import { useQuery } from '@tanstack/react-query';
import type { PendingPulse } from '@/services/learner-pulse-service';

interface PendingPulseResponse {
  hasPending: boolean;
  pulse?: PendingPulse;
}

async function fetchPendingPulse(): Promise<PendingPulseResponse> {
  const response = await fetch('/api/learners/pulse/pending');
  if (!response.ok) {
    // Non-learner users will get 401/403 — treat as no pending pulse
    if (response.status === 401 || response.status === 403) {
      return { hasPending: false };
    }
    throw new Error('Failed to check pending pulse');
  }
  return response.json();
}

export function usePulseLock() {
  const { data, isLoading, refetch } = useQuery<PendingPulseResponse>({
    queryKey: ['learner-pulse', 'pending'],
    queryFn: fetchPendingPulse,
    staleTime: 30 * 1000, // 30 seconds — check frequently but not every render
    refetchOnWindowFocus: true, // Re-check when student returns to tab
    retry: false, // Don't retry on auth failures
    refetchOnMount: true,
  });

  return {
    hasPending: data?.hasPending ?? false,
    pulse: data?.pulse ?? null,
    isLoading,
    refetch,
  };
}
