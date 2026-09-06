// hooks/admission/use-referral-import.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ReferralImportService } from '@/lib/services/admission/referral-import-service';
import type { ParsedRow } from '@/types/referral-import';

export function useImportRows(batchId: string | null) {
  return useQuery({
    queryKey: ['referral-import-rows', batchId],
    queryFn: () => ReferralImportService.getRows(batchId as string),
    enabled: !!batchId,
  });
}

export function useImportBatch(batchId: string | null) {
  return useQuery({
    queryKey: ['referral-import-batch', batchId],
    queryFn: () => ReferralImportService.getBatch(batchId as string),
    enabled: !!batchId,
  });
}

export function useUploadReferralFile() {
  return useMutation({
    mutationFn: ({ filename, rows }: { filename: string; rows: ParsedRow[] }) =>
      ReferralImportService.upload(filename, rows),
    onError: (e: Error) => toast.error(e.message || 'Upload failed'),
  });
}

export function usePromoteImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => ReferralImportService.promote(batchId),
    onSuccess: (r, batchId) => {
      toast.success(
        `Saved: ${r.attributions_written} referral(s), ${r.paid_records} already-paid, ${r.conflicts_disputed} conflict(s) flagged`,
      );
      qc.invalidateQueries({ queryKey: ['referral-import-rows', batchId] });
      qc.invalidateQueries({ queryKey: ['referral-import-batch', batchId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the import'),
  });
}
