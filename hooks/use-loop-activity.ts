// hooks/use-loop-activity.ts
// React Query hook for the SCF loop-activity panel (#4). Mirrors the hooks in
// hooks/use-session-feedback.ts (which is left untouched).

'use client';

import { useQuery } from '@tanstack/react-query';
import { ScfLoopService } from '@/lib/services/scf-loop-service';

export const loopActivityQueryKeys = {
  all: ['scf-loop-activity'] as const,
  window: (from: string, to: string) =>
    [...loopActivityQueryKeys.all, from, to] as const,
};

/** The loop's vital signs for a window (super-admin / institution leadership). */
export function useLoopActivity(from: string, to: string) {
  return useQuery({
    queryKey: loopActivityQueryKeys.window(from, to),
    queryFn: () => ScfLoopService.getLoopActivity(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}
