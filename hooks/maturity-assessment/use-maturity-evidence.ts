'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type { MaturityEvidence, CreateMaturityEvidenceDto } from '@/types/maturity-assessment';
import { maturityAssessmentKeys } from './use-maturity-assessments';

// Query keys
export const maturityEvidenceKeys = {
  all: ['maturity-evidence'] as const,
  byAssessment: (assessmentId: string) =>
    [...maturityEvidenceKeys.all, 'assessment', assessmentId] as const
};

/**
 * Hook for fetching evidence for an assessment
 */
export function useMaturityEvidence(assessmentId: string | undefined) {
  return useQuery({
    queryKey: maturityEvidenceKeys.byAssessment(assessmentId || ''),
    queryFn: () => MaturityAssessmentService.getEvidence(assessmentId!),
    enabled: !!assessmentId,
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

/**
 * Hook for creating evidence
 */
export function useCreateMaturityEvidence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMaturityEvidenceDto) =>
      MaturityAssessmentService.createEvidence(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityEvidenceKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({
        queryKey: maturityAssessmentKeys.detail(data.assessment_id)
      });
      toast.success('Evidence added');
    },
    onError: (error: Error) => {
      console.error('[useCreateMaturityEvidence] Error:', error);
      toast.error(error.message || 'Failed to add evidence');
    }
  });
}

/**
 * Hook for deleting evidence
 */
export function useDeleteMaturityEvidence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, assessmentId }: { id: string; assessmentId: string }) =>
      MaturityAssessmentService.deleteEvidence(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: maturityEvidenceKeys.byAssessment(variables.assessmentId)
      });
      toast.success('Evidence deleted');
    },
    onError: (error: Error) => {
      console.error('[useDeleteMaturityEvidence] Error:', error);
      toast.error(error.message || 'Failed to delete evidence');
    }
  });
}
