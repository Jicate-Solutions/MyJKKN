import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RefundWorkflowService, RefundFlowActiveConflictError } from '@/lib/services/billing/refunds/refund-workflow-service';
import type { InitiateRefundInput, RefundAttachment, RefundFlowConfig, RefundRequestFilters } from '@/types/billing-refund-workflow';

export const refundWorkflowKeys = {
  requests: (f?: RefundRequestFilters) => ['refund-requests', f ?? {}] as const,
  request: (id: string) => ['refund-request', id] as const,
  configs: ['refund-flow-configs'] as const,
  capabilities: (inst: string) => ['refund-capabilities', inst] as const,
  eligibleBills: (sid: string) => ['refund-eligible-bills', sid] as const
};

export function useRefundFlowConfigs() {
  return useQuery({ queryKey: refundWorkflowKeys.configs, queryFn: () => RefundWorkflowService.getConfigs() });
}

export function useSaveRefundFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { cfg: Partial<RefundFlowConfig>; replaceActive?: boolean }) =>
      RefundWorkflowService.saveConfig(v.cfg, { replaceActive: v.replaceActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: refundWorkflowKeys.configs }); toast.success('Flow saved'); },
    // Conflict errors are handled by the caller (confirm-and-replace dialog), not toasted.
    onError: (e: Error) => { if (!(e instanceof RefundFlowActiveConflictError)) toast.error(e.message); }
  });
}

export function useDeleteRefundFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RefundWorkflowService.deleteConfig(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: refundWorkflowKeys.configs }); toast.success('Flow deleted'); },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useRefundCapabilities(institutionId?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.capabilities(institutionId ?? ''),
    queryFn: () => RefundWorkflowService.getMyCapabilities(institutionId!),
    enabled: !!institutionId
  });
}

export function useEligibleRefundBills(studentId?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.eligibleBills(studentId ?? ''),
    queryFn: () => RefundWorkflowService.getEligibleBills(studentId!),
    enabled: !!studentId
  });
}

export function useRefundRequest(id?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.request(id ?? ''),
    queryFn: () => RefundWorkflowService.getRequest(id!),
    enabled: !!id
  });
}

function invalidateRefundData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['refund-requests'] });
  qc.invalidateQueries({ queryKey: ['refund-request'] });
  qc.invalidateQueries({ queryKey: ['refund-eligible-bills'] });
  qc.invalidateQueries({ queryKey: ['student-bills'] });
}

export function useInitiateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitiateRefundInput) => RefundWorkflowService.initiate(input),
    onSuccess: () => { invalidateRefundData(qc); toast.success('Refund request initiated'); },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useActOnRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; action: 'approve' | 'decline'; notes?: string; attachments?: RefundAttachment[]; reason?: string }) =>
      RefundWorkflowService.act(v.requestId, v.action, v),
    onSuccess: (_d, v) => {
      invalidateRefundData(qc);
      toast.success(v.action === 'approve' ? 'Approved and forwarded' : 'Request declined');
    },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useDisburseRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; paymentMode: string; paymentDetails: Record<string, unknown>; notes: string; attachments?: RefundAttachment[] }) =>
      RefundWorkflowService.disburse(v.requestId, v),
    onSuccess: () => { invalidateRefundData(qc); toast.success('Refund disbursed'); },
    onError: (e: Error) => toast.error(e.message)
  });
}
