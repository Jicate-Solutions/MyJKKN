// hooks/bos/use-bos-courses.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BosCourseListResponse,
  BosCourseMaster,
  BosBulkImportResponse,
} from '@/types/bos-courses';
import type { CourseFormInput } from '@/lib/services/bos/courses-schemas';

export interface CourseFilters {
  institution_id: string;
  regulation_code?: string;
  program_code?: string;
  search?: string;
  is_active?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

interface MutateContext {
  institution_id: string;
  institution_code: string;
  regulation_code: string;
  regulation_id?: string;
}

const baseKey = ['bos', 'courses'] as const;

export function useBosCourses(filters: CourseFilters | undefined) {
  return useQuery<BosCourseListResponse>({
    queryKey: [...baseKey, 'list', filters] as const,
    enabled: !!filters?.institution_id,
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters!).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const r = await fetch(`/api/bos/courses-master?${params}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load courses');
      }
      return r.json();
    },
  });
}

export function useBosCourse(id: string | undefined) {
  return useQuery<BosCourseMaster>({
    queryKey: [...baseKey, 'one', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const r = await fetch(`/api/bos/courses-master/${id}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load course');
      }
      return r.json();
    },
  });
}

export function useCreateBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { form: CourseFormInput; context: MutateContext }) => {
      const r = await fetch('/api/bos/courses-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Create failed');
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useUpdateBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; form: Partial<CourseFormInput> }) => {
      const r = await fetch(`/api/bos/courses-master/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: vars.form }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        // 423 = Locked; surface it cleanly to callers.
        const message = r.status === 423 ? (err.error || 'This course is locked.') : (err.error || 'Update failed');
        throw new Error(message);
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useDeleteBosCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/bos/courses-master/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const message = r.status === 423 ? (err.error || 'This course is locked.') : (err.error || 'Delete failed');
        throw new Error(message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}

export function useImportBosCourses() {
  const qc = useQueryClient();
  return useMutation<BosBulkImportResponse, Error, { rows: unknown[]; context: MutateContext }>({
    mutationFn: async (vars) => {
      const r = await fetch('/api/bos/courses-master/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Import failed');
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey }),
  });
}
