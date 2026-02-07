'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkflowConfigService } from '@/lib/services/admission/workflow-config-service';
import type { AdmissionWorkflowConfig } from '@/types/admission-workflow-config';

export const workflowConfigKeys = {
  all: ['admission-workflow-config'] as const,
  active: (institutionId: string, year?: string) =>
    [...workflowConfigKeys.all, 'active', institutionId, year || 'any'] as const,
  list: (institutionId: string) =>
    [...workflowConfigKeys.all, 'list', institutionId] as const,
};

export function useActiveWorkflowConfig(
  institutionId: string | undefined,
  academicYear?: string
) {
  return useQuery({
    queryKey: workflowConfigKeys.active(institutionId || '', academicYear),
    queryFn: () => WorkflowConfigService.getActiveConfig(institutionId!, academicYear),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkflowConfigList(institutionId: string | undefined) {
  return useQuery({
    queryKey: workflowConfigKeys.list(institutionId || ''),
    queryFn: () => WorkflowConfigService.listConfigs(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertWorkflowConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      config: Partial<AdmissionWorkflowConfig> & {
        institution_id: string;
        academic_year: string;
        config_name: string;
      }
    ) => WorkflowConfigService.upsertConfig(config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowConfigKeys.list(variables.institution_id),
      });
      queryClient.invalidateQueries({
        queryKey: workflowConfigKeys.active(variables.institution_id),
      });
    },
  });
}

export function useDeleteWorkflowConfig(institutionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configId: string) => WorkflowConfigService.deleteConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowConfigKeys.list(institutionId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowConfigKeys.active(institutionId),
      });
    },
  });
}
