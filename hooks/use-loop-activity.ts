// hooks/use-loop-activity.ts
// React Query hook for the SCF loop-activity panel (#4). Mirrors the hooks in
// hooks/use-session-feedback.ts (which is left untouched).

'use client';

import { useQuery } from '@tanstack/react-query';
import { ScfLoopService } from '@/lib/services/scf-loop-service';

export const loopActivityQueryKeys = {
  all: ['scf-loop-activity'] as const,
  // institutionId is part of the key: without it, picking a college would show
  // the previously cached all-colleges figures.
  window: (from: string, to: string, institutionId?: string | null) =>
    [...loopActivityQueryKeys.all, from, to, institutionId ?? 'all'] as const,
};

/** The loop's vital signs for a window (super-admin / institution leadership).
 *  `institutionId` narrows to one college; omit for every college in scope. */
export function useLoopActivity(
  from: string,
  to: string,
  institutionId?: string | null,
) {
  return useQuery({
    queryKey: loopActivityQueryKeys.window(from, to, institutionId),
    queryFn: () => ScfLoopService.getLoopActivity(from, to, institutionId),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}
