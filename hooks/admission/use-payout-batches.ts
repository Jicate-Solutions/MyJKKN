// hooks/admission/use-payout-batches.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PayoutBatchService } from '@/lib/services/admission/payout-batch-service';
import type { PayoutBatchStatus } from '@/types/payout-batches';

export function usePayoutBatches() {
  return useQuery({ queryKey: ['payout-batches'], queryFn: () => PayoutBatchService.getBatches() });
}

export function usePayoutInstitutions() {
  return useQuery({ queryKey: ['payout-institutions'], queryFn: () => PayoutBatchService.getInstitutions() });
}

export function useReadyCount(institutionId: string | null) {
  return useQuery({
    queryKey: ['payout-ready', institutionId],
    queryFn: () => PayoutBatchService.getReadyCount(institutionId as string),
    enabled: !!institutionId,
  });
}

export function usePayoutMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payout-batches'] });
    qc.invalidateQueries({ queryKey: ['payout-ready'] });
    qc.invalidateQueries({ queryKey: ['commission-transactions'] });
  };

  const createBatch = useMutation({
    mutationFn: ({ institutionId, batchName, consultantIds }:
      { institutionId: string; batchName: string; consultantIds?: string[] }) =>
      PayoutBatchService.createBatch(institutionId, batchName, consultantIds),
    onSuccess: (r) => { toast.success(`Created batch ${r.batch_number} (${r.transactions} commission(s))`); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Could not create batch'),
  });

  const advance = useMutation({
    mutationFn: ({ batchId, toStatus, paymentMode, bankReference, reason }:
      { batchId: string; toStatus: Exclude<PayoutBatchStatus, 'prepared'>; paymentMode?: string; bankReference?: string; reason?: string }) =>
      PayoutBatchService.advance(batchId, toStatus, { paymentMode, bankReference, reason }),
    onSuccess: (_d, v) => {
      const verb = v.toStatus === 'processed' ? 'marked paid'
        : v.toStatus === 'cancelled' ? 'cancelled' : v.toStatus;
      toast.success(`Batch ${verb}`); invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update batch'),
  });

  return { createBatch, advance };
}
