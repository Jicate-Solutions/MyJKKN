// lib/services/solutions/prospect-attachments-service.ts
// CRUD + Storage operations for sh_prospect_attachments
// Substrate provided by C1a migration: table sh_prospect_attachments + bucket
// sh-prospect-attachments (private). RLS gates all reads/writes by
// sh_has_management_access() / sh_is_staff().

import { BaseService } from '../base-service';

// ============================================
// TYPES
// ============================================

export type AttachmentKind =
  | 'proposal'
  | 'rfp'
  | 'mou_draft'
  | 'contract'
  | 'other';

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  proposal: 'Proposal',
  rfp: 'RFP',
  mou_draft: 'MoU Draft',
  contract: 'Contract',
  other: 'Other',
};

export const ATTACHMENT_KINDS: AttachmentKind[] = [
  'proposal',
  'rfp',
  'mou_draft',
  'contract',
  'other',
];

export interface ProspectAttachment {
  id: string;
  prospect_id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  kind: AttachmentKind;
  uploaded_by: string | null;
  created_at: string;
  // Joined
  uploaded_by_user?: { id: string; full_name: string } | null;
}

export interface UploadProspectAttachmentInput {
  prospectId: string;
  file: File;
  kind: AttachmentKind;
  uploadedBy: string;
}

const STORAGE_BUCKET = 'sh-prospect-attachments';
const TABLE = 'sh_prospect_attachments';

// ============================================
// SERVICE
// ============================================

export class ProspectAttachmentsService extends BaseService {
  /**
   * List all attachments for a prospect (newest first).
   */
  static async listByProspect(
    prospectId: string
  ): Promise<ProspectAttachment[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select(
        `
        *,
        uploaded_by_user:profiles!uploaded_by(id, full_name)
      `
      )
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(
        `Failed to fetch prospect attachments: ${error.message}`
      );
    }
    return (data || []) as ProspectAttachment[];
  }

  /**
   * Upload a file to Storage, then INSERT an index row.
   * Path scheme: `{prospectId}/{uuid}-{sanitizedFilename}`.
   * If the index INSERT fails, the orphaned object is removed.
   */
  static async upload(
    input: UploadProspectAttachmentInput
  ): Promise<ProspectAttachment> {
    const { prospectId, file, kind, uploadedBy } = input;

    // Sanitize filename: strip path separators + collapse whitespace.
    const safeName = file.name
      .replace(/[\\/]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 200);

    // Browser-safe UUID. crypto.randomUUID() exists on modern browsers and
    // Node 19+; fall back to a Math.random-based id for older runtimes.
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const storagePath = `${prospectId}/${uuid}-${safeName}`;

    // Upload to Storage
    const { error: uploadError } = await this.supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Insert index row
    const { data, error: insertError } = await this.supabase
      .from(TABLE)
      .insert({
        prospect_id: prospectId,
        storage_path: storagePath,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        kind,
        uploaded_by: uploadedBy,
      })
      .select(
        `
        *,
        uploaded_by_user:profiles!uploaded_by(id, full_name)
      `
      )
      .single();

    if (insertError) {
      // Cleanup orphaned object so storage doesn't drift from index.
      await this.supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath])
        .catch(() => {
          // best-effort cleanup; don't shadow the original error
        });
      throw new Error(
        `Failed to record attachment: ${insertError.message}`
      );
    }

    return data as ProspectAttachment;
  }

  /**
   * Delete a single attachment: removes the storage object and the index row.
   * If the storage delete fails, the row is kept so it can be retried.
   */
  static async delete(attachmentId: string): Promise<void> {
    // Look up storage_path before deleting
    const { data: row, error: fetchError } = await this.supabase
      .from(TABLE)
      .select('storage_path')
      .eq('id', attachmentId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return; // already gone
      throw new Error(
        `Failed to find attachment: ${fetchError.message}`
      );
    }

    if (row?.storage_path) {
      const { error: storageError } = await this.supabase.storage
        .from(STORAGE_BUCKET)
        .remove([row.storage_path]);
      if (storageError) {
        throw new Error(
          `Failed to delete storage object: ${storageError.message}`
        );
      }
    }

    const { error: deleteError } = await this.supabase
      .from(TABLE)
      .delete()
      .eq('id', attachmentId);

    if (deleteError) {
      throw new Error(
        `Failed to delete attachment row: ${deleteError.message}`
      );
    }
  }

  /**
   * Generate a short-lived signed URL for a Storage object so the browser
   * can download a private file. Default 1 hour.
   */
  static async getSignedUrl(
    storagePath: string,
    expiresIn = 3600
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      throw new Error(`Failed to sign URL: ${error.message}`);
    }
    if (!data?.signedUrl) {
      throw new Error('Signed URL response missing signedUrl');
    }
    return data.signedUrl;
  }
}

// Singleton-style export to mirror prospects-service.ts usage
export const prospectAttachmentsService = {
  listByProspect:
    ProspectAttachmentsService.listByProspect.bind(ProspectAttachmentsService),
  upload: ProspectAttachmentsService.upload.bind(ProspectAttachmentsService),
  delete: ProspectAttachmentsService.delete.bind(ProspectAttachmentsService),
  getSignedUrl:
    ProspectAttachmentsService.getSignedUrl.bind(ProspectAttachmentsService),
};
