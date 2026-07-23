import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkEditPreviewResult,
  BulkEditApplyResult
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export interface BulkEditPayload {
  file: File;
}

/** Dry-run preview — POST .../bulk-edit/preview. No writes, no invalidation. */
export function useBulkEditPreview() {
  return useMutation<BulkEditPreviewResult, Error, BulkEditPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/billing/schedule/bills/bulk-edit/preview', {
        method: 'POST',
        body: fd
      });
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
      return (await res.json()) as BulkEditPreviewResult;
    }
  });
}

/** Commit — POST .../bulk-edit/apply. Invalidates bills/schedule/activities. */
export function useBulkEditApply() {
  const qc = useQueryClient();
  return useMutation<BulkEditApplyResult, Error, BulkEditPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/billing/schedule/bills/bulk-edit/apply', {
        method: 'POST',
        body: fd
      });
      if (!res.ok && res.status !== 200) {
        const text = await res.text();
        throw new Error(text || `Apply failed with status ${res.status}`);
      }
      return (await res.json()) as BulkEditApplyResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-bills'] });
      qc.invalidateQueries({ queryKey: ['billing-schedule'] });
      qc.invalidateQueries({ queryKey: ['billing-activities'] });
    }
  });
}
