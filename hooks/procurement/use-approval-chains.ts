'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ProcurementApprovalChainService } from '@/lib/services/procurement/approval-chain-service';
import type { ApprovalStage, CategoryStep, SaveProcurementCategoryDto } from '@/types/procurement';

export function useProcurementCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['procurement-categories', includeInactive],
    queryFn: () => ProcurementApprovalChainService.getCategories(includeInactive),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveProcurementCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveProcurementCategoryDto) => ProcurementApprovalChainService.saveCategory(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['procurement-categories'] }),
  });
}

export function useSaveCategorySteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      steps,
      stage = 'request',
      institutionId = null,
    }: {
      categoryId: string;
      steps: CategoryStep[];
      stage?: ApprovalStage;
      /** null = the common approvers; set = that college's own (asked before the common ones). */
      institutionId?: string | null;
    }) => ProcurementApprovalChainService.saveSteps(categoryId, steps, stage, institutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-categories'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-chain-preview'] });
    },
  });
}

export function useChainPreview(categoryId: string | undefined, institutionId: string | undefined, departmentId: string | null) {
  return useQuery({
    queryKey: ['procurement-chain-preview', categoryId, institutionId, departmentId],
    queryFn: () => ProcurementApprovalChainService.previewChain(categoryId!, institutionId!, departmentId),
    enabled: !!categoryId && !!institutionId,
    staleTime: 60 * 1000,
  });
}

export function useRequestApprovals(requestId: string | undefined) {
  return useQuery({
    queryKey: ['procurement-request-approvals', requestId],
    queryFn: () => ProcurementApprovalChainService.getRequestApprovals(requestId!),
    enabled: !!requestId,
    staleTime: 30 * 1000,
  });
}

export function useApproverNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['procurement-approver-names', key],
    queryFn: () => ProcurementApprovalChainService.getNames(key),
    enabled: key.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function useMyApprovals() {
  return useQuery({
    queryKey: ['procurement-my-approvals'],
    queryFn: () => ProcurementApprovalChainService.getMyApprovals(),
    staleTime: 30 * 1000,
  });
}

export function useHasApprovalWork(enabled = true) {
  return useQuery({
    queryKey: ['procurement-has-approval-work'],
    queryFn: () => ProcurementApprovalChainService.hasApprovalWork(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** After a step decision the request, its steps, the lists and the tracker all move. */
function refreshAfterDecision(queryClient: QueryClient, requestId: string) {
  queryClient.invalidateQueries({ queryKey: ['procurement-request-approvals', requestId] });
  queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', requestId] });
  queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-my-approvals'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-overview-waiting'] });
  // Final approval: the comparison, the RFQ and its orders move too.
  queryClient.invalidateQueries({ queryKey: ['procurement-rfq'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-quotations'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
}

export function useApproveStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      remarks,
      itemChanges,
    }: {
      requestId: string;
      remarks?: string;
      itemChanges?: { item_id: string; quantity: number }[];
    }) => ProcurementApprovalChainService.approveStep(requestId, remarks, itemChanges),
    onSuccess: (_d, { requestId }) => refreshAfterDecision(queryClient, requestId),
  });
}

export function useDecideStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, decision, reason }: { requestId: string; decision: 'return' | 'reject'; reason: string }) =>
      ProcurementApprovalChainService.decideStep(requestId, decision, reason),
    onSuccess: (_d, { requestId }) => refreshAfterDecision(queryClient, requestId),
  });
}
