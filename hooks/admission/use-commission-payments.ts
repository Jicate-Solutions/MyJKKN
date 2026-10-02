import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CommissionPaymentFlowActiveConflictError,
  CommissionPaymentService,
} from '@/lib/services/admission/commission-payment-service';
import type {
  CommissionPaymentAttachment,
  CommissionPaymentFlowConfig,
  CommissionPaymentMode,
  CommissionPaymentRequestFilters,
  InitiateCommissionPaymentInput,
} from '@/types/consultant-commission-payment';

export const commissionPaymentKeys = {
  requests: (f?: CommissionPaymentRequestFilters) => ['commission-payment-requests', f ?? {}] as const,
  request: (id: string) => ['commission-payment-request', id] as const,
  configs: ['commission-payment-flow-configs'] as const,
  roleMembers: ['commission-payment-role-members'] as const,
  capabilities: ['commission-payment-capabilities'] as const,
  payable: (consultantId: string, year: number | null) => ['commission-payment-payable', consultantId, year] as const,
};

export function useCommissionPaymentFlowConfigs() {
  return useQuery({ queryKey: commissionPaymentKeys.configs, queryFn: () => CommissionPaymentService.getConfigs() });
}

export function useCommissionPaymentRoleMembers() {
  return useQuery({ queryKey: commissionPaymentKeys.roleMembers, queryFn: () => CommissionPaymentService.getRoleMembers() });
}

export function useSaveCommissionPaymentFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { cfg: Partial<CommissionPaymentFlowConfig>; replaceActive?: boolean }) =>
      CommissionPaymentService.saveConfig(v.cfg, { replaceActive: v.replaceActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionPaymentKeys.configs });
      qc.invalidateQueries({ queryKey: commissionPaymentKeys.capabilities });
      toast.success('Flow saved');
    },
    // Conflicts are handled by the caller's confirm-and-replace dialog.
    onError: (e: Error) => {
      if (!(e instanceof CommissionPaymentFlowActiveConflictError)) toast.error(e.message);
    },
  });
}

export function useDeleteCommissionPaymentFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CommissionPaymentService.deleteConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionPaymentKeys.configs });
      qc.invalidateQueries({ queryKey: commissionPaymentKeys.capabilities });
      toast.success('Flow deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCommissionPaymentCapabilities() {
  return useQuery({
    queryKey: commissionPaymentKeys.capabilities,
    queryFn: () => CommissionPaymentService.getMyCapabilities(),
  });
}

export function usePayableCommissionLines(consultantId: string, year: number | null, enabled = true) {
  return useQuery({
    queryKey: commissionPaymentKeys.payable(consultantId, year),
    queryFn: () => CommissionPaymentService.getPayableLines(consultantId, year!),
    enabled: enabled && !!consultantId && year != null,
  });
}

export function useCommissionPaymentRequests(filters: CommissionPaymentRequestFilters, enabled = true) {
  return useQuery({
    queryKey: commissionPaymentKeys.requests(filters),
    queryFn: () => CommissionPaymentService.getRequests(filters),
    enabled,
  });
}

export function useCommissionPaymentRequest(id?: string) {
  return useQuery({
    queryKey: commissionPaymentKeys.request(id ?? ''),
    queryFn: () => CommissionPaymentService.getRequest(id!),
    enabled: !!id,
  });
}

function invalidateCommissionPaymentData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['commission-payment-requests'] });
  qc.invalidateQueries({ queryKey: ['commission-payment-request'] });
  qc.invalidateQueries({ queryKey: ['commission-payment-payable'] });
  // Disbursement writes the rate-card ledger, so Paid / Balance move too.
  qc.invalidateQueries({ queryKey: ['commission-rate-card-earnings'] });
  qc.invalidateQueries({ queryKey: ['commission-rate-card-payments'] });
}

export function useInitiateCommissionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitiateCommissionPaymentInput) => CommissionPaymentService.initiate(input),
    onSuccess: () => {
      invalidateCommissionPaymentData(qc);
      toast.success('Commission payment request initiated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useActOnCommissionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      requestId: string;
      action: 'approve' | 'decline';
      notes?: string;
      attachments?: CommissionPaymentAttachment[];
      reason?: string;
    }) => CommissionPaymentService.act(v.requestId, v.action, v),
    onSuccess: (_d, v) => {
      invalidateCommissionPaymentData(qc);
      toast.success(v.action === 'approve' ? 'Approved and forwarded' : 'Request declined');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDisburseCommissionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      requestId: string;
      paymentMode: CommissionPaymentMode;
      paymentDetails: Record<string, unknown>;
      notes: string;
      attachments?: CommissionPaymentAttachment[];
    }) => CommissionPaymentService.disburse(v.requestId, v),
    onSuccess: () => {
      invalidateCommissionPaymentData(qc);
      toast.success('Commission paid');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
