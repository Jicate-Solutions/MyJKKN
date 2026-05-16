'use client';

/**
 * Solutions Hub - Prospect Attachments Hooks
 * Purpose: React Query hooks for the sh_prospect_attachments substrate
 * (list / upload / delete / signed-URL).
 * Connected to: /api/solutions/prospects/[id]/attachments
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  AttachmentKind,
  ProspectAttachment,
} from '@/lib/services/solutions/prospect-attachments-service';

// Re-export for downstream consumers
export type { AttachmentKind, ProspectAttachment };

// ============================================
// QUERY HOOKS
// ============================================

export function useProspectAttachments(prospectId: string) {
  return useQuery<ProspectAttachment[]>({
    queryKey: solutionsHubKeys.prospects.attachments(prospectId),
    queryFn: () =>
      apiClient.get<ProspectAttachment[]>(
        `/api/solutions/prospects/${prospectId}/attachments`
      ),
    enabled: !!prospectId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Resolve a private storage path to a short-lived signed URL.
 * Storage is private; consumers use the returned signedUrl in <a href>.
 * Caller passes a falsy `storagePath` to disable the query.
 *
 * Endpoint: GET /api/solutions/prospects/{prospectId}/attachments?signedUrlFor=<path>
 */
export function useProspectAttachmentSignedUrl(
  prospectId: string | undefined | null,
  storagePath: string | undefined | null
) {
  return useQuery<{ signedUrl: string }>({
    queryKey: solutionsHubKeys.prospects.attachmentSignedUrl(
      storagePath ?? ''
    ),
    queryFn: () =>
      apiClient.get<{ signedUrl: string }>(
        `/api/solutions/prospects/${prospectId}/attachments?signedUrlFor=${encodeURIComponent(
          storagePath ?? ''
        )}`
      ),
    enabled: !!prospectId && !!storagePath,
    // Signed URL is short-lived; refetch on each consumer instance
    staleTime: 30_000,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export interface UploadProspectAttachmentVars {
  prospectId: string;
  file: File;
  kind: AttachmentKind;
}

export function useUploadProspectAttachment() {
  const queryClient = useQueryClient();
  return useMutation<ProspectAttachment, Error, UploadProspectAttachmentVars>({
    mutationFn: async ({ prospectId, file, kind }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);

      // apiClient.post sets Content-Type: application/json which would break
      // the multipart boundary, so use raw fetch + parse the same response shape.
      const res = await fetch(
        `/api/solutions/prospects/${prospectId}/attachments`,
        {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const json = await res.json();
      // withAuth wrappers respond with { success, data }; unwrap if present.
      return (json?.data ?? json) as ProspectAttachment;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.prospects.attachments(vars.prospectId),
      });
    },
  });
}

export interface DeleteProspectAttachmentVars {
  prospectId: string;
  attachmentId: string;
}

export function useDeleteProspectAttachment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteProspectAttachmentVars>({
    mutationFn: ({ prospectId, attachmentId }) =>
      apiClient.delete(
        `/api/solutions/prospects/${prospectId}/attachments?attachmentId=${attachmentId}`
      ) as Promise<void>,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.prospects.attachments(vars.prospectId),
      });
    },
  });
}
