// hooks/bos/use-course-types.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import type { CoeCourseInfo, CoeCourseInfoListResponse } from '@/types/bos-courses';

const queryKey = ['bos', 'course-info'] as const;

/**
 * Fetches the COE course_type master via /api/bos/course-info.
 *
 * Returns the full row set sorted by COE's sort_order. Callers that only need
 * a select-friendly list of active types should use `useCourseTypeOptions()`.
 */
export function useCourseTypes() {
  return useQuery<CoeCourseInfoListResponse, Error, CoeCourseInfo[]>({
    queryKey,
    queryFn: async () => {
      const r = await fetch('/api/bos/course-info');
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load course types');
      }
      return r.json();
    },
    // Reference data — refresh sparingly.
    staleTime: 60 * 60 * 1000,        // 1 hour
    gcTime:    24 * 60 * 60 * 1000,    // 24 hours
    select: (resp) =>
      [...(resp.data ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
  });
}

/** Convenience selector: only active types, returned as strings for <Select>. */
export function useCourseTypeOptions() {
  const q = useCourseTypes();
  const options = (q.data ?? [])
    .filter((row) => row.status)
    .map((row) => row.course_type);
  return { ...q, options };
}
