'use client';

/**
 * React Query hook for the Faculty Active-Use Ratio KPI.
 *
 * Calls GET /api/hr/faculty-activity and returns the ratio payload.
 * Stale time: 5 minutes (this is a reporting metric, not real-time).
 */

import { useQuery } from '@tanstack/react-query';
import type { FacultyActivityResult } from '@/lib/services/hr/faculty-activity-service';

const ENDPOINT = '/api/hr/faculty-activity';

export function useFacultyActivity(
  opts?: { institution_id?: string },
  enabled = true
) {
  return useQuery({
    queryKey: ['hr-faculty-activity', opts?.institution_id ?? 'all'],
    queryFn: async (): Promise<FacultyActivityResult> => {
      const params = new URLSearchParams();
      if (opts?.institution_id) {
        params.set('institution_id', opts.institution_id);
      }
      const qs = params.toString();
      const res = await fetch(`${ENDPOINT}${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        throw new Error(`Faculty activity fetch failed: ${res.status}`);
      }
      const json = await res.json();
      return json.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
