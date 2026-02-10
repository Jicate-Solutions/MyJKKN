// lib/services/admission/document-service.ts
// Service for document types and application document verification

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface DocumentType {
  id: string;
  name: string;
  code: string;
  is_required: boolean;
  is_active: boolean;
  description: string | null;
  allowed_extensions: string[] | null;
  max_file_size_mb: number | null;
  display_order: number | null;
}

export interface DocumentStats {
  totalDocuments: number;
  pendingVerification: number;
  verified: number;
  rejected: number;
  incomplete: number;
}

export interface PendingDocument {
  id: string;
  application_id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  verification_status: string | null;
  uploaded_at: string | null;
  rejection_reason: string | null;
  document_type_name: string;
  document_type_code: string;
}

export class DocumentService {
  static async getDocumentTypes(institutionId: string): Promise<DocumentType[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('document_types')
      .select('*')
      .eq('institution_id', institutionId)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      is_required: d.is_required ?? false,
      is_active: d.is_active ?? true,
      description: d.description,
      allowed_extensions: d.allowed_extensions,
      max_file_size_mb: d.max_file_size_mb,
      display_order: d.display_order,
    }));
  }

  static async getDocumentStats(institutionId: string): Promise<DocumentStats> {
    const supabase = createClientSupabaseClient();

    // Get all application documents for this institution's applications
    const { data, error } = await (supabase as any)
      .from('application_documents')
      .select(`
        id,
        verification_status,
        application:admission_applications!application_documents_application_id_fkey(institution_id)
      `)
      .not('application', 'is', null);

    if (error) throw error;

    // Filter by institution
    const docs = (data || []).filter(
      (d: any) => d.application?.institution_id === institutionId
    );

    const totalDocuments = docs.length;
    const pendingVerification = docs.filter((d: any) => d.verification_status === 'pending' || !d.verification_status).length;
    const verified = docs.filter((d: any) => d.verification_status === 'verified').length;
    const rejected = docs.filter((d: any) => d.verification_status === 'rejected').length;
    const incomplete = totalDocuments - pendingVerification - verified - rejected;

    return { totalDocuments, pendingVerification, verified, rejected, incomplete: Math.max(0, incomplete) };
  }

  static async getPendingDocuments(institutionId: string): Promise<PendingDocument[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('application_documents')
      .select(`
        id,
        application_id,
        file_name,
        file_size,
        mime_type,
        verification_status,
        uploaded_at,
        rejection_reason,
        document_type:document_types(name, code)
      `)
      .in('verification_status', ['pending', null])
      .order('uploaded_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((d: any) => ({
      id: d.id,
      application_id: d.application_id,
      file_name: d.file_name,
      file_size: d.file_size,
      mime_type: d.mime_type,
      verification_status: d.verification_status,
      uploaded_at: d.uploaded_at,
      rejection_reason: d.rejection_reason,
      document_type_name: d.document_type?.name || 'Unknown',
      document_type_code: d.document_type?.code || '',
    }));
  }

  static async updateVerificationStatus(
    docId: string,
    status: 'verified' | 'rejected' | 'pending',
    rejectionReason?: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const update: Record<string, any> = {
      verification_status: status,
      verified_at: status !== 'pending' ? new Date().toISOString() : null,
    };
    if (rejectionReason) update.rejection_reason = rejectionReason;
    if (status === 'verified') update.rejection_reason = null;

    const { error } = await (supabase as any)
      .from('application_documents')
      .update(update)
      .eq('id', docId);

    if (error) throw error;
  }

  static async getRecentVerifications(institutionId: string): Promise<PendingDocument[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('application_documents')
      .select(`
        id,
        application_id,
        file_name,
        file_size,
        mime_type,
        verification_status,
        uploaded_at,
        verified_at,
        rejection_reason,
        document_type:document_types(name, code)
      `)
      .in('verification_status', ['verified', 'rejected'])
      .order('verified_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return (data || []).map((d: any) => ({
      id: d.id,
      application_id: d.application_id,
      file_name: d.file_name,
      file_size: d.file_size,
      mime_type: d.mime_type,
      verification_status: d.verification_status,
      uploaded_at: d.uploaded_at,
      rejection_reason: d.rejection_reason,
      document_type_name: d.document_type?.name || 'Unknown',
      document_type_code: d.document_type?.code || '',
    }));
  }
}
