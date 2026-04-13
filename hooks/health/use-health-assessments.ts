// hooks/health/use-health-assessments.ts
// React Query hooks for mental health assessments + counselor dashboard
// Created: 2026-04-12

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HealthAssessmentService } from '@/lib/services/health/health-assessment-service';
import type {
  AssessmentType,
  AssessmentResponse,
  HealthAssessment,
  HealthEscalation,
  EscalationStatus,
} from '@/types/health-mental';

const KEYS = {
  history: (learnerId: string) => ['health-assessment-history', learnerId] as const,
  latest: (learnerId: string, type: AssessmentType) => ['health-assessment-latest', learnerId, type] as const,
  escalations: (active: boolean) => ['health-escalations', active] as const,
  counselorStats: () => ['health-counselor-stats'] as const,
};

// ============================================================================
// Assessment Hooks
// ============================================================================

export function useAssessmentHistory(learnerId: string | undefined) {
  return useQuery<HealthAssessment[]>({
    queryKey: KEYS.history(learnerId || ''),
    queryFn: () => HealthAssessmentService.getAssessmentHistory(learnerId!),
    enabled: !!learnerId,
  });
}

export function useLatestAssessment(learnerId: string | undefined, type: AssessmentType) {
  return useQuery<HealthAssessment | null>({
    queryKey: KEYS.latest(learnerId || '', type),
    queryFn: () => HealthAssessmentService.getLatestAssessment(learnerId!, type),
    enabled: !!learnerId,
  });
}

export function useSubmitAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, type, responses }: {
      learnerId: string;
      type: AssessmentType;
      responses: AssessmentResponse[];
    }) => HealthAssessmentService.submitAssessment(learnerId, type, responses),
    onSuccess: (result, { learnerId, type }) => {
      qc.invalidateQueries({ queryKey: KEYS.history(learnerId) });
      qc.invalidateQueries({ queryKey: KEYS.latest(learnerId, type) });
      if (result.escalated) {
        qc.invalidateQueries({ queryKey: KEYS.escalations(true) });
      }
    },
    onError: () => toast.error('Failed to submit assessment'),
  });
}

export function useDeclineAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, type }: { learnerId: string; type: AssessmentType }) =>
      HealthAssessmentService.declineAssessment(learnerId, type),
    onSuccess: (_, { learnerId }) => {
      qc.invalidateQueries({ queryKey: KEYS.history(learnerId) });
      toast('Assessment declined. No data recorded.', { icon: 'ℹ️' });
    },
  });
}

// ============================================================================
// Counselor / Escalation Hooks
// ============================================================================

export function useActiveEscalations() {
  return useQuery<HealthEscalation[]>({
    queryKey: KEYS.escalations(true),
    queryFn: () => HealthAssessmentService.getActiveEscalations(),
    refetchInterval: 15_000, // Every 15s — counselor needs near-real-time alerts
  });
}

export function useAllEscalations(includeResolved: boolean = false) {
  return useQuery<HealthEscalation[]>({
    queryKey: KEYS.escalations(includeResolved),
    queryFn: () => HealthAssessmentService.getAllEscalations(includeResolved),
  });
}

export function useUpdateEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: EscalationStatus; notes?: string }) =>
      HealthAssessmentService.updateEscalationStatus(id, status, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.escalations(true) });
      qc.invalidateQueries({ queryKey: KEYS.escalations(false) });
      qc.invalidateQueries({ queryKey: KEYS.counselorStats() });
      toast.success('Escalation updated');
    },
    onError: () => toast.error('Failed to update escalation'),
  });
}

export function useCounselorStats() {
  return useQuery({
    queryKey: KEYS.counselorStats(),
    queryFn: () => HealthAssessmentService.getCounselorStats(),
    refetchInterval: 15_000,
  });
}
