// hooks/events/marathon/use-ops-profile-map.ts
// Fetches the enriched profile map (institution, department, semester) for
// marathon ops pages via the server-side API route that uses service role.
// This ensures committee members of ANY role (including students) see all
// institutions, not just their own.

'use client';

import { useQuery } from '@tanstack/react-query';

export interface ProfileEnrichment {
  institution_id: string;
  institution_name: string;
  department_id: string | null;
  department_name: string | null;
  semester_id: string | null;
  semester_name: string | null;
}

export function useOpsProfileMap(eventId: string) {
  return useQuery({
    queryKey: ['marathon-ops-profile-map', eventId],
    queryFn: async (): Promise<Map<string, ProfileEnrichment>> => {
      const res = await fetch(`/api/events/marathon/${eventId}/ops/profile-map`);
      if (!res.ok) {
        return new Map();
      }
      const data: Record<string, ProfileEnrichment> = await res.json();
      return new Map(Object.entries(data));
    },
    enabled: !!eventId,
  });
}
