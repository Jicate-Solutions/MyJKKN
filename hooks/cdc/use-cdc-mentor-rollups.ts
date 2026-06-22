'use client';

import { useQuery } from '@tanstack/react-query';
import type { MentorRollupsResponse } from '@/types/cdc/mentor-rollups';

async function fetchRollups(): Promise<MentorRollupsResponse> {
  const res = await fetch('/api/cdc/mentors/rollups', { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = `Failed to load rollups (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return res.json();
}

export function useMentorRollups() {
  return useQuery({
    queryKey: ['cdc-mentor-rollups'],
    queryFn: fetchRollups,
    staleTime: 2 * 60 * 1000,
  });
}
