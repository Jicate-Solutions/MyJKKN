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

export interface BosSemester {
  id: string;
  semester_code: string;
  semester_name: string;
  semester_order: number;
}

export function useBosSemesters(
  filters: SchemeFilters | null,
  myjkknInstitutionIds?: string[],
) {
  const ids = myjkknInstitutionIds?.length
    ? myjkknInstitutionIds
    : filters?.institution_id
      ? [filters.institution_id]
      : [];

  return useQuery<{ data: BosSemester[] }>({
    queryKey: ['bos', 'semesters', ids, filters?.program_code],
    enabled: ids.length > 0 && !!filters?.program_code,
    queryFn: async () => {
      const params = new URLSearchParams({ program_code: filters!.program_code });
      if (ids.length === 1) {
        params.set('institution_id', ids[0]);
      } else {
        params.set('institution_ids', ids.join(','));
      }
      const r = await fetch(`/api/bos/semesters?${params}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load semesters');
      }
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

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
