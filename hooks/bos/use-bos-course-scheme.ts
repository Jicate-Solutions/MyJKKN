// hooks/bos/use-bos-course-scheme.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';
import { useAuth } from '@/hooks/use-auth';

export interface SchemeFilters {
  institution_id: string;
  program_code: string;
  regulation_code: string;
  batch_code?: string;
}

// Query-key root namespaced per authenticated user. Without the user id slot,
// React Query (singleton QueryClient in providers/query-client-provider.tsx)
// served a previous session's data to the next caller until staleTime expired.
// Pattern mirrors use-bos-board-scope.ts / use-bos-compositions.ts.
export const bosCourseSchemeKey = (userId: string | null | undefined) =>
  ['bos', 'course-mapping', userId ?? 'anonymous'] as const;

const baseKey = bosCourseSchemeKey;

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
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  const ids = myjkknInstitutionIds?.length
    ? myjkknInstitutionIds
    : filters?.institution_id
      ? [filters.institution_id]
      : [];

  return useQuery<{ data: BosSemester[] }>({
    queryKey: ['bos', 'semesters', userId ?? 'anonymous', ids, filters?.program_code],
    enabled: !!userId && ids.length > 0 && !!filters?.program_code,
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
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useQuery<{ data: BosCourseMappingDetailed[] }>({
    queryKey: [...baseKey(userId), filters] as const,
    enabled:
      !!userId &&
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

export type AddMappingInput = Record<string, unknown> & {
  /** Exact scheme filters currently on screen — required for instant cache write. */
  _filters: SchemeFilters;
  /** Pre-built row so the table paints before the background refetch finishes. */
  _optimistic: BosCourseMappingDetailed;
};

export function useAddMapping() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: async (input: AddMappingInput) => {
      const { _filters, _optimistic, ...mapping } = input;
      const r = await fetch('/api/bos/course-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Add failed');
      }
      const result = await r.json();
      return { result, filters: _filters, optimistic: _optimistic };
    },
    onSuccess: ({ result, filters, optimistic }) => {
      // Prefer the server id when COE returns one so the later refetch can
      // dedupe cleanly; fall back to the client optimistic row otherwise.
      const created = (result?.data ?? result) as Partial<BosCourseMappingDetailed> | undefined;
      const row: BosCourseMappingDetailed = {
        ...optimistic,
        ...(created && typeof created === 'object' && !Array.isArray(created)
          ? {
              id: typeof created.id === 'string' ? created.id : optimistic.id,
              mapping_status: created.mapping_status ?? optimistic.mapping_status,
              group_order: created.group_order ?? optimistic.group_order,
              course_order: created.course_order ?? optimistic.course_order,
            }
          : null),
      };

      qc.setQueryData<{ data: BosCourseMappingDetailed[] }>(
        [...baseKey(userId), filters],
        (old) => {
          if (!old?.data) return { data: [row] };
          const withoutDup = old.data.filter(
            (m) =>
              m.id !== row.id &&
              !(
                m.id.startsWith('__opt_') &&
                m.course_code === row.course_code &&
                m.semester_code === row.semester_code
              ),
          );
          return { ...old, data: [...withoutDup, row] };
        },
      );

      // Background refresh for full COE join fields — cache already has the row.
      void qc.invalidateQueries({ queryKey: baseKey(userId) });
    },
  });
}

export function useRemoveMapping() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey(userId) }),
  });
}
