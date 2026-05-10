'use client';

/**
 * useAlumniSignalBulk — T8.5
 *
 * Fetches alumni signals for many candidates at once.
 * Used by the approvals queue + candidates list to render an inline
 * "JKKN alumni" line on each row without N+1 detail fetches.
 *
 * Returns { [email: string]: AlumniSignalPayload | null } — emails
 * with no JKKN history map to null. Caller should treat null as
 * "no badge".
 */

import { useQuery } from '@tanstack/react-query';
import type { AlumniSignalPayload } from '@/lib/services/hr/alumni-signal-service';

export function useAlumniSignalBulk(emails: string[] | undefined) {
  const normalized = (emails ?? [])
    .map((e) => (typeof e === 'string' ? e.toLowerCase().trim() : ''))
    .filter(Boolean)
    .sort();
  const dedup = Array.from(new Set(normalized));
  const cacheKey = dedup.join(',');

  return useQuery({
    queryKey: ['hr-recruitment-alumni-signal-bulk', cacheKey],
    queryFn: async (): Promise<Record<string, AlumniSignalPayload | null>> => {
      if (dedup.length === 0) return {};

      const res = await fetch(
        '/api/hr/recruitment/candidates/alumni-signal-bulk',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: dedup }),
        }
      );
      if (!res.ok) throw new Error(`Alumni bulk fetch failed: ${res.status}`);
      const json = await res.json();
      return (json.data as Record<string, AlumniSignalPayload | null>) ?? {};
    },
    enabled: dedup.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
