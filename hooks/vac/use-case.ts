// hooks/vac/use-case.ts
// React Query hooks for CASE (Graduation Tracker) module

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CASEService } from '@/lib/services/vac/case-service';
import type {
  CASEBatchFilters,
  CASEAlertFilters,
  CreateCASEBatchInput,
  UpdateCASEBatchInput,
  UpdateCASETrackInput,
} from '@/types/case';

// ── Query Keys ──────────────────────────────────────────────────────────────

export const caseKeys = {
  all: ['case'] as const,
  tracks: () => [...caseKeys.all, 'tracks'] as const,
  track: (id: string) => [...caseKeys.all, 'track', id] as const,
  myTrackEnrollments: (userId: string) => [...caseKeys.all, 'my-track-enrollments', userId] as const,
  prerequisite: (userId: string, trackId: string) => [...caseKeys.all, 'prerequisite', userId, trackId] as const,
  placementQuestions: (trackCode: string) => [...caseKeys.all, 'placement', trackCode] as const,
  learnerProgress: (userId: string) => [...caseKeys.all, 'learner-progress', userId] as const,
  graduationReadiness: (institutionId: string) => [...caseKeys.all, 'graduation-readiness', institutionId] as const,
  atRiskLearners: (institutionId: string) => [...caseKeys.all, 'at-risk', institutionId] as const,
  graduationReqs: (programmeId: string, institutionId: string) => [...caseKeys.all, 'grad-reqs', programmeId, institutionId] as const,
  batches: (filters?: CASEBatchFilters) => [...caseKeys.all, 'batches', filters] as const,
  batch: (id: string) => [...caseKeys.all, 'batch', id] as const,
  alerts: (userId: string, filters?: CASEAlertFilters) => [...caseKeys.all, 'alerts', userId, filters] as const,
  unreadCount: (userId: string) => [...caseKeys.all, 'unread-count', userId] as const,
  trackStats: (institutionId: string) => [...caseKeys.all, 'track-stats', institutionId] as const,
  riskDistribution: (institutionId: string) => [...caseKeys.all, 'risk-dist', institutionId] as const,
  dashboardStats: (institutionId: string) => [...caseKeys.all, 'dashboard-stats', institutionId] as const,
};

// ── TRACKS ──────────────────────────────────────────────────────────────────

export function useCASETracks() {
  return useQuery({
    queryKey: caseKeys.tracks(),
    queryFn: () => CASEService.getTracks(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useCASETrack(id: string) {
  return useQuery({
    queryKey: caseKeys.track(id),
    queryFn: () => CASEService.getTrackById(id),
    enabled: !!id,
  });
}

export function useUpdateCASETrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCASETrackInput }) =>
      CASEService.updateTrack(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.tracks() });
      queryClient.invalidateQueries({ queryKey: caseKeys.track(variables.id) });
      toast.success('Track updated successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── ENROLLMENTS ─────────────────────────────────────────────────────────────

export function useEnrollInTrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      trackId,
      courseId,
      batchId,
    }: {
      userId: string;
      trackId: string;
      courseId?: string;
      batchId?: string;
    }) => CASEService.enrollInTrack(userId, trackId, courseId, batchId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.myTrackEnrollments(variables.userId) });
      queryClient.invalidateQueries({ queryKey: caseKeys.learnerProgress(variables.userId) });
      toast.success('Successfully enrolled in track');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMyTrackEnrollments(userId: string) {
  return useQuery({
    queryKey: caseKeys.myTrackEnrollments(userId),
    queryFn: () => CASEService.getMyTrackEnrollments(userId),
    enabled: !!userId,
  });
}

export function useUpdateTrackEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      userId,
      updates,
    }: {
      id: string;
      userId: string;
      updates: Parameters<typeof CASEService.updateTrackEnrollment>[1];
    }) => CASEService.updateTrackEnrollment(id, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.myTrackEnrollments(variables.userId) });
      toast.success('Enrollment updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCheckPrerequisite(userId: string, trackId: string) {
  return useQuery({
    queryKey: caseKeys.prerequisite(userId, trackId),
    queryFn: () => CASEService.checkPrerequisite(userId, trackId),
    enabled: !!userId && !!trackId,
  });
}

// ── PLACEMENT ───────────────────────────────────────────────────────────────

export function usePlacementQuestions(trackCode: string) {
  return useQuery({
    queryKey: caseKeys.placementQuestions(trackCode),
    queryFn: () => CASEService.getPlacementQuestions(trackCode),
    enabled: !!trackCode,
    staleTime: Infinity, // static data
  });
}

export function useSubmitPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      trackId,
      answers,
    }: {
      userId: string;
      trackId: string;
      answers: { question_id: string; selected_answer: string }[];
    }) => CASEService.submitPlacement(userId, trackId, answers),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.myTrackEnrollments(variables.userId) });
      toast.success(
        `Placement complete! Score: ${result.placement.score}% — Starting at week ${result.placement.start_week}`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── GRADUATION & PROGRESS ───────────────────────────────────────────────────

export function useCASELearnerProgress(userId: string) {
  return useQuery({
    queryKey: caseKeys.learnerProgress(userId),
    queryFn: () => CASEService.getLearnerProgress(userId),
    enabled: !!userId,
    staleTime: 60 * 1000, // 60 seconds
  });
}

export function useGraduationReadiness(institutionId: string) {
  return useQuery({
    queryKey: caseKeys.graduationReadiness(institutionId),
    queryFn: () => CASEService.getGraduationReadiness(institutionId),
    enabled: !!institutionId,
  });
}

export function useAtRiskLearners(institutionId: string) {
  return useQuery({
    queryKey: caseKeys.atRiskLearners(institutionId),
    queryFn: () => CASEService.getAtRiskLearners(institutionId),
    enabled: !!institutionId,
  });
}

export function useGraduationRequirements(programmeId: string, institutionId: string) {
  return useQuery({
    queryKey: caseKeys.graduationReqs(programmeId, institutionId),
    queryFn: () => CASEService.getGraduationRequirements(programmeId, institutionId),
    enabled: !!programmeId && !!institutionId,
  });
}

// ── BATCHES ─────────────────────────────────────────────────────────────────

export function useCASEBatches(filters?: CASEBatchFilters) {
  return useQuery({
    queryKey: caseKeys.batches(filters),
    queryFn: () => CASEService.getBatches(filters),
    enabled: !!filters?.institution_id,
  });
}

export function useCASEBatch(id: string) {
  return useQuery({
    queryKey: caseKeys.batch(id),
    queryFn: () => CASEService.getBatchById(id),
    enabled: !!id,
  });
}

export function useCreateCASEBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCASEBatchInput) => CASEService.createBatch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...caseKeys.all, 'batches'] });
      toast.success('Batch created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCASEBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCASEBatchInput }) =>
      CASEService.updateBatch(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...caseKeys.all, 'batches'] });
      queryClient.invalidateQueries({ queryKey: caseKeys.batch(variables.id) });
      toast.success('Batch updated successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── ALERTS ──────────────────────────────────────────────────────────────────

export function useCASEAlerts(userId: string, filters?: CASEAlertFilters) {
  return useQuery({
    queryKey: caseKeys.alerts(userId, filters),
    queryFn: () => CASEService.getAlerts(userId, filters),
    enabled: !!userId,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId }: { alertId: string; userId: string }) =>
      CASEService.markAlertRead(alertId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...caseKeys.all, 'alerts', variables.userId] });
      queryClient.invalidateQueries({ queryKey: caseKeys.unreadCount(variables.userId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUnreadAlertCount(userId: string) {
  return useQuery({
    queryKey: caseKeys.unreadCount(userId),
    queryFn: () => CASEService.getUnreadAlertCount(userId),
    enabled: !!userId,
    refetchInterval: 60_000, // poll every minute
  });
}

// ── ANALYTICS ───────────────────────────────────────────────────────────────

export function useTrackCompletionStats(institutionId: string) {
  return useQuery({
    queryKey: caseKeys.trackStats(institutionId),
    queryFn: () => CASEService.getTrackCompletionStats(institutionId),
    enabled: !!institutionId,
  });
}

export function useRiskDistribution(institutionId: string) {
  return useQuery({
    queryKey: caseKeys.riskDistribution(institutionId),
    queryFn: () => CASEService.getRiskDistribution(institutionId),
    enabled: !!institutionId,
  });
}

export function useCASEDashboardStats(institutionId: string) {
  return useQuery({
    queryKey: caseKeys.dashboardStats(institutionId),
    queryFn: () => CASEService.getDashboardStats(institutionId),
    enabled: !!institutionId,
  });
}
