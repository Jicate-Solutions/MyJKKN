// hooks/bos/use-bos-course-scheme.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';

export interface SchemeFilters {
  institution_id: string;
  program_code: string;
  regulation_code: string;
  batch_code?: string;
}

const baseKey = ['bos', 'course-mapping'] as const;

export function useBosCourseScheme(filters: SchemeFilters | null) {
  return useQuery<{ data: BosCourseMappingDetailed[] }>({
    queryKey: [...baseKey, filters] as const,
    enabled:
      !!filters?.institution_id &&
      !!filters?.program_code &&
      !!filters?.regulation_code,
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters!).forEach(([k, v]) => {
        if (v) params.set(k, String(v));
      });
      params.set('details', 'true');
      const r = await fetch(`/api/bos/course-mapping?${params}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load scheme');
      }
      return r.json();
    },
  });
}

export function useAddMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mapping: Record<string, unknown>) => {
      const r = await fetch('/api/bos/course-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Add failed');
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useRemoveMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/bos/course-mapping/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const message =
          r.status === 423
            ? err.error || 'This mapping is locked.'
            : err.error || 'Remove failed';
        throw new Error(message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}
