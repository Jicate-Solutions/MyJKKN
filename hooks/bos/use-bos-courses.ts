// hooks/bos/use-bos-courses.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BosCourseListResponse,
  BosCourseMaster,
  BosBulkImportResponse,
} from '@/types/bos-courses';
import type { CourseFormInput } from '@/lib/services/bos/courses-schemas';
import type { AcademicModel } from '@/types/bos';
import { useAuth } from '@/hooks/use-auth';

export interface CourseFilters {
  institution_id?: string;  // omit to fetch all institutions (super-admin only)
  regulation_code?: string;
  program_code?: string;
  /**
   * When set, the server returns courses for THIS composition's board only,
   * authorised by institution scope (not the caller's own board memberships).
   * Used by the syllabus form so a user building a syllabus for a composition
   * sees that board's courses regardless of which boards they personally sit on.
   */
  composition_id?: string;
  /** Multi-board: scope to a specific board of the composition (defaults to primary). */
  board_id?: string;
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
  /** COE board UUID — the server verifies it against the caller's boardsOf. */
  board_id?: string;
  /** Human-readable board code — resolved client-side from the picked board_id
   *  so the server can persist both keys without a second lookup. */
  board_code?: string;
  /** Academic model resolved from the board (COP: B.Pharm vs Pharm.D). Drives
   *  the pharmacy/AHS payload branch in toCoeCreatePayload. */
  academic_model?: AcademicModel;
}

// User-scoped cache root — mirrors use-bos-board-scope / use-bos-compositions.
// Without partitioning by user.id, the singleton QueryClient
// (providers/query-client-provider.tsx) serves the previous session's data
// to the next caller until staleTime expires.
const baseKey = (userId: string | null | undefined) =>
  ['bos', 'courses', userId ?? 'anonymous'] as const;

export function useBosCourses(filters: CourseFilters | undefined) {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useQuery<BosCourseListResponse>({
    queryKey: [...baseKey(userId), 'list', filters] as const,
    enabled: !!userId && filters !== undefined,  // run even with no institution_id (all-institutions mode)
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
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useQuery<BosCourseMaster>({
    queryKey: [...baseKey(userId), 'one', id] as const,
    enabled: !!id && !!userId,
    queryFn: async () => {
      const r = await fetch(`/api/bos/courses-master/${id}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load course');
      }
      const json = await r.json();
      // COE single-record responses are wrapped in { data: {...} } — unwrap.
      return (json?.data ?? json) as BosCourseMaster;
    },
  });
}

export function useCreateBosCourse() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey(userId) }),
  });
}

export function useUpdateBosCourse() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: async (vars: { id: string; form: Partial<CourseFormInput>; board_code?: string }) => {
      const r = await fetch(`/api/bos/courses-master/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: vars.form, board_code: vars.board_code }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        // 423 = Locked; surface it cleanly to callers.
        const message = r.status === 423 ? (err.error || 'This course is locked.') : (err.error || 'Update failed');
        throw new Error(message);
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey(userId) }),
  });
}

export function useDeleteBosCourse() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/bos/courses-master/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const message = r.status === 423 ? (err.error || 'This course is locked.') : (err.error || 'Delete failed');
        throw new Error(message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey(userId) }),
  });
}

export function useImportBosCourses() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: baseKey(userId) }),
  });
}
