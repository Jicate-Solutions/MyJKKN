'use client';

/**
 * HR Faculty Workload — React Query Hooks
 *
 * Wraps /api/hr/workload routes with React Query caching.
 * Pattern: hooks/hr/recruitment-need/use-recruitment-signal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HRFacultyWorkload } from '@/types/hr-recruitment-need';
import type { WorkloadFilters, WorkloadInsert, WorkloadUpdate } from '@/lib/services/hr/recruitment-need/workload-service';

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const workloadKeys = {
  all: ['hr-faculty-workload'] as const,
  list: (filters: WorkloadFilters) => [...workloadKeys.all, 'list', filters] as const,
  detail: (id: string) => [...workloadKeys.all, 'detail', id] as const,
};

// ─── Fetchers (call API routes) ─────────────────────────────────────────────────

async function fetchWorkloads(filters: WorkloadFilters): Promise<HRFacultyWorkload[]> {
  const params = new URLSearchParams();
  if (filters.institution_id) params.set('institution_id', filters.institution_id);
  if (filters.academic_year) params.set('academic_year', filters.academic_year);
  if (filters.semester !== undefined) params.set('semester', String(filters.semester));
  if (filters.verified !== undefined) params.set('verified', String(filters.verified));
  if (filters.staff_id) params.set('staff_id', filters.staff_id);

  const res = await fetch(`/api/hr/workload?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to fetch workloads');
  }
  return res.json();
}

async function createWorkload(insert: WorkloadInsert): Promise<HRFacultyWorkload> {
  const res = await fetch('/api/hr/workload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(insert),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to create workload');
  }
  return res.json();
}

async function updateWorkload(id: string, update: WorkloadUpdate): Promise<HRFacultyWorkload> {
  const res = await fetch(`/api/hr/workload/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to update workload');
  }
  return res.json();
}

async function deleteWorkload(id: string): Promise<void> {
  const res = await fetch(`/api/hr/workload/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to delete workload');
  }
}

async function verifyWorkload(id: string): Promise<HRFacultyWorkload> {
  const res = await fetch(`/api/hr/workload/${id}/verify`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to verify workload');
  }
  return res.json();
}

// ─── Query Hooks ────────────────────────────────────────────────────────────────

export function useWorkloads(filters: WorkloadFilters = {}) {
  return useQuery({
    queryKey: workloadKeys.list(filters),
    queryFn: () => fetchWorkloads(filters),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────────

export function useCreateWorkload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (insert: WorkloadInsert) => createWorkload(insert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workloadKeys.all });
    },
  });
}

export function useUpdateWorkload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: WorkloadUpdate }) =>
      updateWorkload(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workloadKeys.all });
    },
  });
}

export function useDeleteWorkload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workloadKeys.all });
    },
  });
}

export function useVerifyWorkload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => verifyWorkload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workloadKeys.all });
    },
  });
}
