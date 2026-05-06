import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerAdmissionDocument } from '@/types/admission';

export class AdmissionDocumentService {
  static async listForLearner(learnerId: string): Promise<LearnerAdmissionDocument[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learner_admission_documents')
      .select('*')
      .eq('learner_id', learnerId)
      .order('doc_type', { ascending: true });
    if (error) throw error;
    return data ?? [];
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
    return data;
  }

  static async remove(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('learner_admission_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
