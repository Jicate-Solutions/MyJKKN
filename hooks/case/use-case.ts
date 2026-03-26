// hooks/case/use-case.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaseService } from '@/lib/services/case-service';

const CASE_KEYS = {
  tracks: ['case', 'tracks'] as const,
  learnerDashboard: (userId: string) => ['case', 'dashboard', userId] as const,
  enrollments: (userId: string) => ['case', 'enrollments', userId] as const,
  batches: (filters?: Record<string, string>) => ['case', 'batches', filters] as const,
  atRisk: (institutionId?: string) => ['case', 'at-risk', institutionId] as const,
  graduationReadiness: ['case', 'graduation-readiness'] as const,
};

export function useCaseTracks() {
  return useQuery({
    queryKey: CASE_KEYS.tracks,
    queryFn: () => CaseService.getTracks(),
    staleTime: 1000 * 60 * 60, // tracks rarely change
  });
}

export function useCaseLearnerDashboard(userId: string) {
  return useQuery({
    queryKey: CASE_KEYS.learnerDashboard(userId),
    queryFn: () => CaseService.getLearnerDashboard(userId),
    enabled: !!userId,
  });
}

export function useCaseEnrollments(userId: string) {
  return useQuery({
    queryKey: CASE_KEYS.enrollments(userId),
    queryFn: () => CaseService.getLearnerEnrollments(userId),
    enabled: !!userId,
  });
}

export function useCaseBatches(filters?: { trackId?: string; institutionId?: string; status?: string }) {
  return useQuery({
    queryKey: CASE_KEYS.batches(filters as Record<string, string>),
    queryFn: () => CaseService.getBatches(filters),
  });
}

export function useCaseAtRisk(institutionId?: string) {
  return useQuery({
    queryKey: CASE_KEYS.atRisk(institutionId),
    queryFn: () => CaseService.getAtRiskLearners(institutionId),
  });
}

export function useCaseGraduationReadiness() {
  return useQuery({
    queryKey: CASE_KEYS.graduationReadiness,
    queryFn: () => CaseService.getGraduationReadiness(),
  });
}

export function useEnrollInTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, trackId, courseId, batchId }: {
      userId: string; trackId: string; courseId?: string; batchId?: string;
    }) => CaseService.enrollInTrack(userId, trackId, courseId, batchId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CASE_KEYS.learnerDashboard(variables.userId) });
      queryClient.invalidateQueries({ queryKey: CASE_KEYS.enrollments(variables.userId) });
    },
  });
}
