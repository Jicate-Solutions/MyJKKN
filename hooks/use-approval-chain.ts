'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApprovalChainService } from '@/lib/services/approval-chain-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  ApprovalChainWorkflowType,
  UpdateApprovalChainRuleDTO,
} from '@/types/approval-chain';

export const approvalChainKeys = {
  all: ['approval-chain'] as const,
  rules: (institutionId: string, workflowType?: ApprovalChainWorkflowType) =>
    ['approval-chain', 'rules', institutionId, workflowType ?? 'all'] as const,
  rule: (id: string) => ['approval-chain', 'rule', id] as const,
  runBySubject: (subjectType: string, subjectId: string) =>
    ['approval-chain', 'run', subjectType, subjectId] as const,
};

// --- Query hooks ---

export function useApprovalChainRules(
  institutionId: string,
  workflowType?: ApprovalChainWorkflowType
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: approvalChainKeys.rules(institutionId, workflowType),
    queryFn: () => ApprovalChainService.getRules(institutionId, workflowType),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useApprovalChainRule(id: string) {
  return useQuery({
    queryKey: approvalChainKeys.rule(id),
    queryFn: () => ApprovalChainService.getRule(id),
    enabled: !!id,
  });
}

export function useApprovalChainRunBySubject(
  subjectType: ApprovalChainWorkflowType | undefined,
  subjectId: string | undefined
) {
  return useQuery({
    queryKey: approvalChainKeys.runBySubject(subjectType ?? '', subjectId ?? ''),
    queryFn: () => ApprovalChainService.getRunBySubject(subjectType!, subjectId!),
    enabled: !!subjectType && !!subjectId,
  });
}

// --- Mutation hooks ---

export function useUpdateApprovalChainRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateApprovalChainRuleDTO }) =>
      ApprovalChainService.updateRule(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalChainKeys.all });
      queryClient.invalidateQueries({ queryKey: approvalChainKeys.rule(variables.id) });
      toast.success('Approval rule updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update rule: ${error.message}`);
    },
  });
}

export function useDeleteApprovalChainRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ApprovalChainService.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalChainKeys.all });
      toast.success('Approval rule deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete rule: ${error.message}`);
    },
  });
}
