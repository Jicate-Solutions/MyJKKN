import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkCreatePreviewResult,
  ImportResult
} from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * Hooks for the multi-step bulk bill upload.
 *
 * The same `File` is posted twice — once to /preview for the dry run, then to
 * /import to commit. That is deliberate (see the service docblock): the commit
 * re-validates from the file against fresh database state instead of trusting
 * anything the browser assembled, and a stale preview therefore cannot slip a
 * now-invalid row past the guards. Mirrors `use-bulk-edit-bills.ts`.
 */

export interface BulkCreatePreviewPayload {
  file: File;
}

export interface BulkCreateCommitPayload {
  file: File;
  /**
   * True only when the user has explicitly accepted that invalid rows will be
   * skipped. False makes the server refuse to write anything unless the sheet
   * is clean, so the confirmation is enforced server-side too.
   */
  skipInvalid: boolean;
}

/**
 * Pull the best available message out of a failed response.
 *
 * Both endpoints answer with a renderable body even on failure (`fatal` for
 * preview, `errors[0]` for commit), so prefer those over the bare status line.
 */
async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return (
      body?.fatal ||
      body?.errors?.[0]?.message ||
      body?.message ||
      body?.error ||
      fallback
    );
  } catch {
    try {
      const text = await res.text();
      return text || fallback;
    } catch {
      return fallback;
    }
  }
}

/** Dry run — POST .../bills/import/preview. No writes, so no invalidation. */
export function useBulkCreatePreview() {
  return useMutation<BulkCreatePreviewResult, Error, BulkCreatePreviewPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/billing/schedule/bills/import/preview', {
        method: 'POST',
        body: fd
      });
      if (!res.ok) {
        throw new Error(await messageFrom(res, `Preview failed with status ${res.status}`));
      }
      return (await res.json()) as BulkCreatePreviewResult;
    }
  });
}

/**
 * Commit — POST .../bills/import.
 *
 * A partial import is a success for cache purposes: bills were created, so the
 * schedule list is stale either way. Only a transport/auth failure throws.
 */
export function useBulkCreateCommit() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, BulkCreateCommitPayload>({
    mutationFn: async ({ file, skipInvalid }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('skipInvalid', skipInvalid ? 'true' : 'false');
      const res = await fetch('/api/billing/schedule/bills/import', {
        method: 'POST',
        body: fd
      });
      // A 200 carrying errors[] is the partial-success contract, not a failure —
      // only a non-2xx means the request itself didn't land.
      if (!res.ok) {
        throw new Error(await messageFrom(res, `Import failed with status ${res.status}`));
      }
      return (await res.json()) as ImportResult;
    },
    onSuccess: (result) => {
      if (result.successCount === 0) return;
      qc.invalidateQueries({ queryKey: ['student-bills'] });
      qc.invalidateQueries({ queryKey: ['billing-schedule'] });
      qc.invalidateQueries({ queryKey: ['billing-activities'] });
    }
  });
}
