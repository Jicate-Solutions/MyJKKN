import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  BillingApportionmentService,
  type ApportionmentRule,
  type SplitMethod,
} from '@/lib/services/billing/apportionment/apportionment-service';

const KEYS = {
  heads: ['apportionment-heads'] as const,
  rules: (inst?: string) => ['apportionment-rules', inst ?? 'all'] as const,
  billAppns: (billId: string) => ['apportionment-bill', billId] as const,
};

/** Revenue heads = existing billing_categories rows (Hostel/Transport/Mess Fee). */
export function useRevenueHeads() {
  return useQuery({
    queryKey: KEYS.heads,
    queryFn: () => BillingApportionmentService.listRevenueHeads(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useApportionmentRules(institutionId?: string) {
  return useQuery({
    queryKey: KEYS.rules(institutionId),
    queryFn: () => BillingApportionmentService.listRules(institutionId),
  });
}

export function useApportionmentWorkqueue(status?: 'draft' | 'pending_approval' | 'approved' | 'rejected') {
  return useQuery({
    queryKey: ['apportionment-workqueue', status ?? 'all'],
    queryFn: () => BillingApportionmentService.listApportionments(status),
  });
}

export function useBillApportionments(billId: string) {
  return useQuery({
    queryKey: KEYS.billAppns(billId),
    queryFn: () => BillingApportionmentService.getApportionmentsForBill(billId),
    enabled: !!billId,
  });
}

export function useApportionmentMutations(billId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    if (billId) qc.invalidateQueries({ queryKey: KEYS.billAppns(billId) });
    qc.invalidateQueries({ queryKey: ['apportionment-rules'] });
    qc.invalidateQueries({ queryKey: ['apportionment-workqueue'] });
  };

  const createRule = useMutation({
    mutationFn: (
      rule: Pick<
        ApportionmentRule,
        'institution_id' | 'fee_structure_id' | 'accommodation_type_id' | 'billing_category_id' | 'split_method' | 'split_value'
      > & { change_reason?: string }
    ) => BillingApportionmentService.createRule(rule),
    onSuccess: () => {
      toast.success('Rule created (draft)');
      qc.invalidateQueries({ queryKey: ['apportionment-rules'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to create rule'),
  });

  const approveRule = useMutation({
    mutationFn: ({ ruleId, reason }: { ruleId: string; reason?: string }) =>
      BillingApportionmentService.approveRule(ruleId, reason),
    onSuccess: () => {
      toast.success('Rule approved');
      qc.invalidateQueries({ queryKey: ['apportionment-rules'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to approve rule'),
  });

  const applyRule = useMutation({
    mutationFn: ({ ruleId, billIds, source }: { ruleId: string; billIds: string[]; source?: 'rule' | 'backfill' }) =>
      BillingApportionmentService.applyRule(ruleId, billIds, source ?? 'rule'),
    onSuccess: (n) => {
      toast.success(`Drafted ${n} apportionment${n === 1 ? '' : 's'}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to apply rule'),
  });

  const createManual = useMutation({
    mutationFn: ({ bId, categoryId, amount, reason }: { bId: string; categoryId: string; amount: number; reason?: string }) =>
      BillingApportionmentService.createManual(bId, categoryId, amount, reason),
    onSuccess: () => {
      toast.success('Apportionment added (draft)');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to add apportionment'),
  });

  const submit = useMutation({
    mutationFn: (ids: string[]) => BillingApportionmentService.submit(ids),
    onSuccess: (n) => {
      toast.success(`Submitted ${n} for approval`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to submit'),
  });

  const approve = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      BillingApportionmentService.approve(ids, reason),
    onSuccess: (n) => {
      toast.success(`Approved ${n}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Not permitted / failed to approve'),
  });

  const reject = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      BillingApportionmentService.reject(ids, reason),
    onSuccess: (n) => {
      toast.success(`Rejected ${n}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Not permitted / failed to reject'),
  });

  return { createRule, approveRule, applyRule, createManual, submit, approve, reject };
}

export type { SplitMethod };
