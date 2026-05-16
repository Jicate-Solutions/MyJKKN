import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkReceiptImportResult,
  BulkReceiptPreviewResult
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

/**
 * Both preview and commit endpoints take just the file — the per-row
 * payment metadata lives inside the workbook itself now, so the multipart
 * form payload collapsed to a single field.
 */
export interface BulkReceiptImportPayload {
  file: File;
}

/**
 * Preview mutation — calls /api/billing/receipts/bulk-import?dry_run=true.
 *
 * Parses + validates + groups but does NOT write to the DB. The dialog
 * uses the response to render the Preview step. No query invalidation
 * because nothing actually changed server-side.
 */
export function useBulkReceiptPreview() {
  return useMutation<BulkReceiptPreviewResult, Error, BulkReceiptImportPayload>(
    {
      mutationFn: async ({ file }) => {
        const fd = new FormData();
        fd.append('file', file);

        const res = await fetch(
          '/api/billing/receipts/bulk-import?dry_run=true',
          { method: 'POST', body: fd }
        );

        if (!res.ok) {
          let message = `Preview failed with status ${res.status}`;
          try {
            const body = await res.json();
            message = body.error || body.message || message;
          } catch {
            const text = await res.text();
            if (text) message = text;
          }
          throw new Error(message);
        }

        return (await res.json()) as BulkReceiptPreviewResult;
      }
    }
  );
}

/**
 * Commit mutation — calls /api/billing/receipts/bulk-import.
 *
 * Same multipart payload as preview (just the file), but this path
 * actually creates the receipts. Invalidates receipts / schedule /
 * student-bills queries so the rest of the UI reflects the change.
 */
export function useBulkReceiptImport() {
  const qc = useQueryClient();

  return useMutation<BulkReceiptImportResult, Error, BulkReceiptImportPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);

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
