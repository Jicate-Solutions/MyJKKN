'use client';

/**
 * Startup Studio — Foundations (Level 0) hooks.
 * React Query hooks over /api/startup-studio/foundations: cohorts, enrolments,
 * worksheets, the per-student journey, responses, progress, and the review queue.
 * Mirrors the use-sf100.ts pattern (apiClient + startupStudioKeys + QUERY_CONFIG).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

const BASE = '/api/startup-studio/foundations';

// ============================================
// QUERY HOOKS
// ============================================

/** List Foundations cohorts (facilitator / admin view). */
export function useFoundationsCohorts(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.cohorts.list(filters),
    queryFn: () => apiClient.get(`${BASE}/cohorts`, { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** A single cohort. */
export function useFoundationsCohort(cohortId: string) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.cohorts.detail(cohortId),
    queryFn: () => apiClient.get(`${BASE}/cohorts/${cohortId}`),
    enabled: !!cohortId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/** The roster (enrolled students) for a cohort. */
export function useFoundationsRoster(cohortId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.cohorts.roster(cohortId, filters),
    queryFn: () =>
      apiClient.get(`${BASE}/cohorts/${cohortId}/enrollments`, { params: filters }),
    enabled: !!cohortId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** The worksheet catalog (canon + optional cohort overrides). */
export function useFoundationsWorksheets(cohortId?: string | null) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.worksheets.list(cohortId ?? null),
    queryFn: () =>
      apiClient.get(`${BASE}/worksheets`, {
        params: cohortId ? { cohort_id: cohortId } : undefined,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/** A single worksheet. */
export function useFoundationsWorksheet(worksheetId: string) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.worksheets.detail(worksheetId),
    queryFn: () => apiClient.get(`${BASE}/worksheets/${worksheetId}`),
    enabled: !!worksheetId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/** The current user's journey: worksheets joined with their responses. */
export function useFoundationsJourney(cohortId?: string | null) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.journey(cohortId ?? null),
    queryFn: () =>
      apiClient.get(`${BASE}/journey`, {
        params: cohortId ? { cohort_id: cohortId } : undefined,
      }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** The current user's response for one worksheet (null if not started). */
export function useMyFoundationsResponse(worksheetId: string) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.myResponse(worksheetId),
    queryFn: () => apiClient.get(`${BASE}/worksheets/${worksheetId}/responses`),
    enabled: !!worksheetId,
    retry: false,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** The cohorts the current user is enrolled in. */
export function useMyFoundationsEnrollments() {
  return useQuery({
    queryKey: startupStudioKeys.foundations.myEnrollments(),
    queryFn: () => apiClient.get(`${BASE}/enrollments/my`),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** The current user's Level-0 completion + graduation flag. */
export function useFoundationsProgress() {
  return useQuery({
    queryKey: startupStudioKeys.foundations.progress(),
    queryFn: () => apiClient.get(`${BASE}/progress`),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/** Submissions awaiting (or having received) review — scoped by RLS to the reviewer. */
export function useFoundationsReviewQueue(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.foundations.reviewQueue(filters),
    queryFn: () => apiClient.get(`${BASE}/review-queue`, { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCreateFoundationsCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => apiClient.post(`${BASE}/cohorts`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.cohorts.all });
    },
  });
}

export function useUpdateFoundationsCohort(cohortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.patch(`${BASE}/cohorts/${cohortId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.cohorts.all });
      qc.invalidateQueries({
        queryKey: startupStudioKeys.foundations.cohorts.detail(cohortId),
      });
    },
  });
}

/** Facilitator enrols a student into a cohort. */
export function useEnrollFoundationsStudent(cohortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { student_id: string }) =>
      apiClient.post(`${BASE}/cohorts/${cohortId}/enrollments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.cohorts.all });
    },
  });
}

/** The current user self-enrols into a cohort. */
export function useSelfEnrollFoundations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { cohort_id: string }) =>
      apiClient.post(`${BASE}/enrollments/my`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.myEnrollments() });
    },
  });
}

/** Save a draft or submit a worksheet response. */
export function useSubmitFoundationsResponse(worksheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`${BASE}/worksheets/${worksheetId}/responses`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.myResponse(worksheetId) });
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.journey() });
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.progress() });
    },
  });
}

/** Mentor reviews a submitted response. */
export function useReviewFoundationsResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ responseId, ...data }: { responseId: string } & Record<string, any>) =>
      apiClient.post(`${BASE}/responses/${responseId}/review`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: startupStudioKeys.foundations.all });
    },
  });
}
