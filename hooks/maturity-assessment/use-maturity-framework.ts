'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type {
  MaturityFramework,
  CreateMaturityFrameworkDto,
  UpdateMaturityFrameworkDto
} from '@/types/maturity-assessment';

// Query keys
export const maturityFrameworkKeys = {
  all: ['maturity-frameworks'] as const,
  byInstitution: (institutionId: string) =>
    [...maturityFrameworkKeys.all, 'institution', institutionId] as const,
  byId: (id: string) => [...maturityFrameworkKeys.all, 'detail', id] as const
};

/**
 * Hook to get the active framework for an institution
 */
export function useMaturityFramework(institutionId: string | undefined) {
  return useQuery({
    queryKey: maturityFrameworkKeys.byInstitution(institutionId || ''),
    queryFn: () => MaturityAssessmentService.getFramework(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Hook to get a framework by ID
 */
export function useMaturityFrameworkById(id: string | undefined) {
  return useQuery({
    queryKey: maturityFrameworkKeys.byId(id || ''),
    queryFn: () => MaturityAssessmentService.getFrameworkById(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook to get or create a framework (ensures one exists)
 */
export function useGetOrCreateFramework(institutionId: string | undefined) {
  return useQuery({
    queryKey: [...maturityFrameworkKeys.byInstitution(institutionId || ''), 'ensure'],
    queryFn: () => MaturityAssessmentService.getOrCreateFramework(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook to create a framework
 */
export function useCreateMaturityFramework() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMaturityFrameworkDto) =>
      MaturityAssessmentService.createFramework(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityFrameworkKeys.byInstitution(data.institution_id)
      });
      toast.success('Framework created successfully');
    },
    onError: (error: Error) => {
      console.error('[useCreateMaturityFramework] Error:', error);
      toast.error(error.message || 'Failed to create framework');
    }
  });
}

/**
 * Hook to update a framework
 */
export function useUpdateMaturityFramework() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMaturityFrameworkDto }) =>
      MaturityAssessmentService.updateFramework(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityFrameworkKeys.byId(data.id)
      });
      queryClient.invalidateQueries({
        queryKey: maturityFrameworkKeys.byInstitution(data.institution_id)
      });
      toast.success('Framework updated successfully');
    },
    onError: (error: Error) => {
      console.error('[useUpdateMaturityFramework] Error:', error);
      toast.error(error.message || 'Failed to update framework');
    }
  });
}

/**
 * Hook to get default dimensions
 */
export function useDefaultDimensions() {
  return MaturityAssessmentService.getDefaultDimensions();
}
