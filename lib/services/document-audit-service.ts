/**
 * Document Audit Service — Standalone
 * Audit trail, verification, numbering for ANY module's document generation.
 * Not tied to any specific module. Used by learner profile, billing, academic, PDE.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { DocumentType, GeneratedDocument, DocumentStatus } from '@/types/documents';
import { generateVerificationCode, buildVerificationUrl } from '@/lib/utils/pdf/brand-utils';

export class DocumentAuditService {
  private static supabase = createClientSupabaseClient();

  static async generateDocumentNumber(
    institutionId: string,
    documentType: DocumentType,
    prefix?: string
  ): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const { data, error } = await (this.supabase as any).rpc('next_document_number', {
        p_institution_id: institutionId,
        p_document_type: documentType,
        p_year: year,
      });
      if (error) throw error;
      const seq = String(data).padStart(5, '0');
      return prefix ? `${prefix}${seq}` : `JKKN/${documentType.toUpperCase().slice(0, 4)}/${year}/${seq}`;
    } catch {
      return `DOC-${Date.now()}`;
    }
  }

  static generateVerification(): { code: string; url: string } {
    const code = generateVerificationCode();
    return { code, url: buildVerificationUrl(code) };
  }

  static async insertAuditRecord(record: {
    institution_id: string;
    document_type: DocumentType;
    category: string;
    learner_id?: string;
    section_id?: string;
    document_number: string;
    title: string;
    data_snapshot?: Record<string, unknown>;
    generated_by: string;
    verification_code?: string;
    verification_url?: string;
    file_size_bytes?: number;
  }): Promise<GeneratedDocument | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('generated_documents')
        .insert({ ...record, status: 'generated', generated_at: new Date().toISOString() })
        .select('*')
        .single();
      if (error) {
        console.error('[document-audit] Insert failed:', error.message);
        return null;
      }
      return data as GeneratedDocument;
    } catch (e) {
      console.error('[document-audit] Insert error:', e);
      return null;
    }
  }

  static async verifyByCode(code: string): Promise<GeneratedDocument | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('generated_documents')
        .select('*, learner:learner_id(id, first_name, last_name, roll_number), institution:institution_id(id, name)')
        .eq('verification_code', code)
        .single();
      if (error) return null;
      return data as GeneratedDocument;
    } catch {
      return null;
    }
  }

  static async revoke(documentId: string, reason: string, userId: string): Promise<boolean> {
    try {
      const { error } = await (this.supabase as any)
        .from('generated_documents')
        .update({
          status: 'revoked' as DocumentStatus,
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revoke_reason: reason,
        })
        .eq('id', documentId);
      return !error;
    } catch {
      return false;
    }
  }

  static async getInstitutionBranding(institutionId: string) {
    try {
      const { data } = await (this.supabase as any)
        .from('document_institution_settings')
        .select('*')
        .eq('institution_id', institutionId)
        .single();
      return data || null;
    } catch {
      return null;
    }
  }

  static async getLearnerDocuments(learnerId: string): Promise<GeneratedDocument[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('generated_documents')
        .select('*')
        .eq('learner_id', learnerId)
        .order('generated_at', { ascending: false });
      if (error) return [];
      return (data || []) as GeneratedDocument[];
    } catch {
      return [];
    }
  }
}
