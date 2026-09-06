// hooks/pde/use-faculty-cases.ts
// Faculty-side React Query hooks for clinical_case CRUD + analytics.
// Talks to /api/pde/cases/* endpoints (see app/api/pde/cases/).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ClinicalCase,
  ClinicalCaseWithQuestions,
  ClinicalCaseListFilters,
  CreateClinicalCaseInput,
  UpdateClinicalCaseInput,
  ClinicalCaseCohortStats,
  ClinicalCaseSubmissionTranscript,
  GrantAttemptsInput,
  ClinicalCaseStatus,
} from '@/types/pde';

// ──────────────────────────────────────────────────────────────────────────────
// Query Keys
// ──────────────────────────────────────────────────────────────────────────────

export const facultyCaseKeys = {
  all: ['pde', 'cases', 'faculty'] as const,
  list: (filters?: ClinicalCaseListFilters) =>
    [...facultyCaseKeys.all, 'list', filters] as const,
  detail: (id: string) => [...facultyCaseKeys.all, 'detail', id] as const,
  cohort: (slug: string) => [...facultyCaseKeys.all, 'cohort', slug] as const,
  transcript: (slug: string, studentId: string) =>
    [...facultyCaseKeys.all, 'transcript', slug, studentId] as const,
};

// ──────────────────────────────────────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.error || msg;
    } catch {
      /* leave text as-is */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function buildQuery(filters?: ClinicalCaseListFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.course_id) params.set('courseId', filters.course_id);
  if (filters.institution_id) params.set('institutionId', filters.institution_id);
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

export function useFacultyCases(filters?: ClinicalCaseListFilters) {
  return useQuery({
    queryKey: facultyCaseKeys.list(filters),
    queryFn: () =>
      fetchJson<{ data: ClinicalCase[] }>(`/api/pde/cases${buildQuery(filters)}`),
    staleTime: 30_000,
  });
}

export function useFacultyCaseDetail(id: string | undefined) {
  return useQuery({
    queryKey: facultyCaseKeys.detail(id || ''),
    queryFn: () => fetchJson<{ data: ClinicalCaseWithQuestions }>(`/api/pde/cases/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useFacultyCaseCohort(slug: string | undefined) {
  return useQuery({
    queryKey: facultyCaseKeys.cohort(slug || ''),
    queryFn: () =>
      fetchJson<{ data: ClinicalCaseCohortStats }>(
        `/api/pde/cases/${slug}/cohort`
      ),
    enabled: !!slug,
    staleTime: 15_000,
  });
}

export function useFacultyCaseTranscript(
  slug: string | undefined,
  studentId: string | undefined
) {
  return useQuery({
    queryKey: facultyCaseKeys.transcript(slug || '', studentId || ''),
    queryFn: () =>
      fetchJson<{ data: ClinicalCaseSubmissionTranscript[] }>(
        `/api/pde/cases/${slug}/transcripts/${studentId}`
      ),
    enabled: !!slug && !!studentId,
    staleTime: 15_000,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────────

export function useCreateFacultyCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClinicalCaseInput) =>
      fetchJson<{ data: ClinicalCase }>(`/api/pde/cases`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: facultyCaseKeys.all });
    },
  });
}

export function useUpdateFacultyCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClinicalCaseInput }) =>
      fetchJson<{ data: ClinicalCase }>(`/api/pde/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: facultyCaseKeys.detail(data.data.id) });
      qc.invalidateQueries({ queryKey: facultyCaseKeys.all });
    },
  });
}

export function useTransitionFacultyCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ClinicalCaseStatus }) =>
      fetchJson<{ data: ClinicalCase }>(`/api/pde/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: facultyCaseKeys.detail(data.data.id) });
      qc.invalidateQueries({ queryKey: facultyCaseKeys.all });
    },
  });
}

export function useGrantAttempts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GrantAttemptsInput) =>
      fetchJson<{ data: { id: string; attempts_granted: number } }>(
        `/api/pde/cases/${input.case_id}/grant-attempts`,
        {
          method: 'POST',
          body: JSON.stringify({
            learner_id: input.learner_id,
            attempts_granted: input.attempts_granted,
            reason: input.reason,
          }),
        }
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: facultyCaseKeys.all });
      qc.invalidateQueries({
        queryKey: facultyCaseKeys.cohort(variables.case_id),
      });
    },
  });
}
