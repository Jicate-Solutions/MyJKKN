import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerAdmissionDocument } from '@/types/admission';

import {
  LEARNER_DOCUMENTS_BUCKET,
  LEARNER_DOCUMENT_MAX_BYTES,
  LEARNER_DOCUMENT_TYPES,
} from '@/lib/admission/learner-documents';

export {
  LEARNER_DOCUMENTS_BUCKET,
  PG_DEGREE_DOC_TYPES,
  type PgDegreeDocType,
} from '@/lib/admission/learner-documents';

export class AdmissionDocumentService {
  static async listForLearner(learnerId: string): Promise<LearnerAdmissionDocument[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .select('*')
      .eq('learner_id', learnerId)
      .order('doc_type', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LearnerAdmissionDocument[];
  }

  static async upsert(input: {
    learner_id: string;
    doc_type: string;
    is_received?: boolean;
    received_via?: 'physical' | 'email' | 'upload' | null;
    document_ref?: string | null;
    notes?: string | null;
  }): Promise<LearnerAdmissionDocument> {
    const supabase = createClientSupabaseClient();
    const payload = {
      ...input,
      received_at: input.is_received ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .upsert(payload, { onConflict: 'learner_id,doc_type' })
      .select('*')
      .single();
    if (error) throw error;
    return data as LearnerAdmissionDocument;
  }

  static async remove(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('learner_admission_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Upload one paper and record it on the checklist row. Replacing keeps the row
   * (one per learner per doc_type) and removes the previous file once the new one
   * is safely recorded.
   */
  static async uploadFile(
    learnerId: string,
    docType: string,
    file: File,
  ): Promise<LearnerAdmissionDocument> {
    const ext = LEARNER_DOCUMENT_TYPES[file.type];
    if (!ext) throw new Error('Only PDF, JPG or PNG files can be uploaded.');
    if (file.size > LEARNER_DOCUMENT_MAX_BYTES) throw new Error('The file is larger than 5 MB.');

    const supabase = createClientSupabaseClient();
    const { data: existing } = await supabase
      .from('learner_admission_documents')
      .select('document_ref')
      .eq('learner_id', learnerId)
      .eq('doc_type', docType)
      .maybeSingle();

    const path = `${learnerId}/${docType}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(LEARNER_DOCUMENTS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .upsert(
        {
          learner_id: learnerId,
          doc_type: docType,
          is_received: true,
          received_at: new Date().toISOString(),
          received_by: userData.user?.id ?? null,
          received_via: 'upload',
          document_ref: path,
        },
        { onConflict: 'learner_id,doc_type' },
      )
      .select('*')
      .single();
    if (error) {
      // The row is what makes the file findable; without it the upload is an orphan.
      await supabase.storage.from(LEARNER_DOCUMENTS_BUCKET).remove([path]);
      throw error;
    }

    const oldRef = (existing as { document_ref?: string | null } | null)?.document_ref;
    if (oldRef && oldRef !== path && oldRef.startsWith(`${learnerId}/`)) {
      await supabase.storage.from(LEARNER_DOCUMENTS_BUCKET).remove([oldRef]);
    }
    return data as LearnerAdmissionDocument;
  }

  /** A short-lived link to open one paper (10 minutes). */
  static async getViewUrl(path: string): Promise<string> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.storage
      .from(LEARNER_DOCUMENTS_BUCKET)
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open this file.');
    return data.signedUrl;
  }
}
