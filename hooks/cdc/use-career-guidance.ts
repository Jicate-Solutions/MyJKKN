// hooks/cdc/use-career-guidance.ts
// AI Career Guidance (BUG-004057) — POST a learnerId, get structured guidance.

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CareerGuidanceResult } from '@/types/cdc/career-guidance';

// Load the latest SAVED report for a learner (BUG-004057 follow-up #1552). Used
// to show the last report immediately on learner-select instead of regenerating.
// Returns null when no report has been saved yet for that learner.
export function useSavedCareerGuidance(learnerId: string | undefined) {
  return useQuery({
    queryKey: ['cdc-career-guidance-saved', learnerId],
    enabled: !!learnerId,
    staleTime: 0,
    queryFn: async (): Promise<CareerGuidanceResult | null> => {
      const res = await fetch(`/api/cdc/career-guidance?learnerId=${encodeURIComponent(learnerId!)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const body = await res.json().catch(() => ({ saved: null }));
      return (body.saved as CareerGuidanceResult | null) ?? null;
    },
  });
}

export function useGenerateCareerGuidance() {
  return useMutation({
    mutationFn: async (learnerId: string): Promise<CareerGuidanceResult> => {
      const res = await fetch('/api/cdc/career-guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return res.json() as Promise<CareerGuidanceResult>;
    },
    onError: (err: Error) => {
      console.error('[cdc/career-guidance] generate error:', err);
      toast.error(err.message || 'Failed to generate guidance');
    },
  });
}
