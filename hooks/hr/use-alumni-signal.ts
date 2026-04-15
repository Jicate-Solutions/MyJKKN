'use client';

/**
 * useAlumniSignal — R4.3
 *
 * React Query hook that fetches the "JKKN History" alumni signal
 * for a given recruitment candidate ID.
 *
 * Returns null when the candidate has no alumni match (quiet empty state).
 *
 * Usage:
 *   const { data: signal, isLoading } = useAlumniSignal(candidateId);
 *   if (!signal) return null; // no panel
 */

import { useQuery } from '@tanstack/react-query';
import type { AlumniSignalPayload } from '@/lib/services/hr/alumni-signal-service';

export function useAlumniSignal(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['hr-recruitment-alumni-signal', candidateId],
    queryFn: async (): Promise<AlumniSignalPayload | null> => {
      const res = await fetch(
        `/api/hr/recruitment/candidates/${candidateId}/alumni-signal`
      );
      if (!res.ok) throw new Error(`Alumni signal fetch failed: ${res.status}`);
      const json = await res.json();
      return (json.data as AlumniSignalPayload | null) ?? null;
    },
    enabled: !!candidateId,
    staleTime: 5 * 60 * 1000, // 5 min — alumni data rarely changes
  });
}
