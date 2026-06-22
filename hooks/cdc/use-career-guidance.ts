// hooks/cdc/use-career-guidance.ts
// AI Career Guidance (BUG-004057) — POST a learnerId, get structured guidance.

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CareerGuidanceResult } from '@/types/cdc/career-guidance';

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
