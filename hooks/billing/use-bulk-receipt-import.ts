import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkReceiptImportResult
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

export interface BulkReceiptImportPayload {
  file: File;
  payment_mode: 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
  payment_paid_date: string; // ISO yyyy-mm-dd
  payer_mode: 'student' | 'fixed';
  payer_name_fixed?: string;
  payer_contact?: string;
  payment_reference_number?: string;
  payment_remarks?: string;
  accountant_id?: string;
}

/**
 * Mutation hook for the super-admin bulk receipt import. Posts a multipart
 * form to /api/billing/receipts/bulk-import. On success it invalidates the
 * receipts and schedule queries so the UI reflects the newly created
 * receipts and updated bill statuses immediately.
 */
export function useBulkReceiptImport() {
  const qc = useQueryClient();

  return useMutation<BulkReceiptImportResult, Error, BulkReceiptImportPayload>({
    mutationFn: async (payload) => {
      const fd = new FormData();
      fd.append('file', payload.file);
      fd.append('payment_mode', payload.payment_mode);
      fd.append('payment_paid_date', payload.payment_paid_date);
      fd.append('payer_mode', payload.payer_mode);
      if (payload.payer_name_fixed)
        fd.append('payer_name_fixed', payload.payer_name_fixed);
      if (payload.payer_contact)
        fd.append('payer_contact', payload.payer_contact);
      if (payload.payment_reference_number)
        fd.append('payment_reference_number', payload.payment_reference_number);
      if (payload.payment_remarks)
        fd.append('payment_remarks', payload.payment_remarks);
      if (payload.accountant_id)
        fd.append('accountant_id', payload.accountant_id);

      const res = await fetch('/api/billing/receipts/bulk-import', {
        method: 'POST',
        body: fd
      });

      // The route returns 200 even on partial failure (partial-success
      // contract). Only treat true HTTP errors as throws.
      if (!res.ok && res.status !== 200) {
        const text = await res.text();
        throw new Error(text || `Import failed with status ${res.status}`);
      }

      return (await res.json()) as BulkReceiptImportResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-receipts'] });
      qc.invalidateQueries({ queryKey: ['billing-schedule'] });
      qc.invalidateQueries({ queryKey: ['student-bills'] });
    }
  });
}
