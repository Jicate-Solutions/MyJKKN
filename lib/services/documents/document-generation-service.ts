/**
 * Document Generation Service
 * Orchestrates the full document generation pipeline:
 * Template config → Branding assembly → Data aggregation → PDF generation → Audit log
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  DocumentBranding,
  DocumentMetadata,
  DocumentType,
  DocumentInstitutionSettings,
  DocumentTemplate,
  GeneratedDocument,
  GenerateDocumentDto,
  DocumentHistoryFilters,
  DocumentHistoryListResponse,
  UpsertDocumentSettingsDto,
  UpdateDocumentTemplateDto,
} from '@/types/documents';
import { DocumentDataService } from './document-data-service';
import { getGenerator } from '@/lib/utils/document-generators/generator-registry';
import {
  hexToRgb,
  DEFAULT_COLORS,
  fetchImageAsDataUrl,
  generateVerificationCode,
  buildVerificationUrl,
  getFullName,
} from '@/lib/utils/document-generators/brand-utils';

export class DocumentGenerationService {
  private static supabase = createClientSupabaseClient();

  // ── Institution Settings ──────────────────────────────────────

  static async getInstitutionSettings(institutionId: string): Promise<DocumentInstitutionSettings | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('document_institution_settings')
        .select('*')
        .eq('institution_id', institutionId)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data as DocumentInstitutionSettings | null;
    } catch (error) {
      console.error('[documents/service] Failed to fetch institution settings:', error);
      return null;
    }
  }

  static async upsertInstitutionSettings(
    institutionId: string,
    dto: UpsertDocumentSettingsDto
  ): Promise<DocumentInstitutionSettings> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('document_institution_settings')
        .upsert(
          { institution_id: institutionId, ...dto },
          { onConflict: 'institution_id' }
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as DocumentInstitutionSettings;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to save settings');
    }
  }

  // ── Template Management ───────────────────────────────────────

  static async getTemplates(institutionId: string): Promise<DocumentTemplate[]> {
    try {
      const { data, error } = await this.supabase
        .from('document_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .order('category', { ascending: true })
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data || []) as DocumentTemplate[];
    } catch (error) {
      console.error('[documents/service] Failed to fetch templates:', error);
      return [];
    }
  }

  static async getTemplate(institutionId: string, documentType: DocumentType): Promise<DocumentTemplate | null> {
    try {
      const { data, error } = await this.supabase
        .from('document_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('document_type', documentType)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as DocumentTemplate | null;
    } catch (error) {
      console.error('[documents/service] Failed to fetch template:', error);
      return null;
    }
  }

  static async updateTemplate(
    templateId: string,
    dto: UpdateDocumentTemplateDto
  ): Promise<DocumentTemplate> {
    try {
      const { data, error } = await this.supabase
        .from('document_templates')
        .update(dto)
        .eq('id', templateId)
        .select('*')
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to update template');
    }
  }

  // ── Branding Assembly ─────────────────────────────────────────

  /**
   * Build a complete DocumentBranding object by merging:
   * 1. Institution record (name, logo, address)
   * 2. Document settings overrides (colors, signatures, watermark)
   * 3. Pre-fetched image data URLs
   */
  static async assembleBranding(institutionId: string): Promise<DocumentBranding> {
    // Fetch institution base data
    const { data: inst } = await this.supabase
      .from('institutions')
      .select('name, logo_url, address_line1, city, state, pin_code, counselling_code, accredited_by')
      .eq('id', institutionId)
      .single();

    // Fetch document settings (may not exist)
    const settings = await this.getInstitutionSettings(institutionId);

    const logoUrl = settings?.logo_url || inst?.logo_url || '';
    const logoDataUrl = await fetchImageAsDataUrl(logoUrl);

    // Pre-fetch signature images
    const signatures: DocumentBranding['signatures'] = [];
    if (settings?.signatures) {
      for (const sig of settings.signatures) {
        const signatureDataUrl = sig.signature_image_url
          ? await fetchImageAsDataUrl(sig.signature_image_url)
          : undefined;
        signatures.push({ ...sig, signatureDataUrl });
      }
    }

    return {
      institutionName: inst?.name || 'Institution',
      institutionAddress: inst?.address_line1 || '',
      institutionCity: inst?.city || '',
      institutionState: inst?.state || '',
      institutionPinCode: inst?.pin_code || '',
      counsellingCode: inst?.counselling_code || undefined,
      accreditedBy: inst?.accredited_by || undefined,
      logoDataUrl,
      headerText: settings?.header_text || undefined,
      footerText: settings?.footer_text || undefined,
      primaryColor: settings?.primary_color ? hexToRgb(settings.primary_color) : DEFAULT_COLORS.primary,
      secondaryColor: settings?.secondary_color ? hexToRgb(settings.secondary_color) : DEFAULT_COLORS.secondary,
      backgroundColor: settings?.background_color ? hexToRgb(settings.background_color) : DEFAULT_COLORS.background,
      signatures,
      watermarkText: settings?.watermark_text || undefined,
      watermarkOpacity: settings?.watermark_opacity ?? 0.05,
    };
  }

  // ── Document Number Generation ────────────────────────────────

  static async generateDocumentNumber(
    institutionId: string,
    documentType: DocumentType,
    prefix?: string
  ): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const { data, error } = await this.supabase.rpc('next_document_number', {
        p_institution_id: institutionId,
        p_document_type: documentType,
        p_year: year,
      });
      if (error) throw error;
      const seq = String(data).padStart(5, '0');
      return prefix ? `${prefix}${seq}` : `JKKN/${documentType.toUpperCase().slice(0, 4)}/${year}/${seq}`;
    } catch (error) {
      // Fallback: timestamp-based number
      console.error('[documents/service] Failed to generate doc number via RPC:', error);
      return `DOC-${Date.now()}`;
    }
  }

  // ── Single Document Generation ────────────────────────────────

  /**
   * Generate a single document for one learner.
   * Returns PDF as Uint8Array plus the audit record.
   */
  static async generateDocument(
    dto: GenerateDocumentDto,
    userId: string
  ): Promise<{ pdfBytes: Uint8Array; document: GeneratedDocument }> {
    const { institutionId, documentType, learnerId, additionalData } = dto;

    // 1. Fetch template
    const template = await this.getTemplate(institutionId, documentType);

    // 2. Assemble branding
    const branding = await this.assembleBranding(institutionId);

    // 3. Generate document number
    const documentNumber = await this.generateDocumentNumber(
      institutionId,
      documentType,
      template?.number_prefix
    );

    // 4. Generate verification code (if QR enabled)
    const qrEnabled = template?.qr_verification ?? false;
    const verificationCode = qrEnabled ? generateVerificationCode() : undefined;
    const verificationUrl = verificationCode ? buildVerificationUrl(verificationCode) : undefined;

    // 5. Build metadata
    const { DOCUMENT_TYPE_INFO: typeInfo } = await import('@/types/documents');
    const info = typeInfo[documentType];
    const metadata: DocumentMetadata = {
      documentNumber,
      documentType,
      category: info?.category || 'administrative',
      verificationCode,
      verificationUrl,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
    };

    // 6. Aggregate learner data
    const docData = await DocumentDataService.aggregateDataForDocument(
      documentType,
      learnerId,
      { ...additionalData, body_template: template?.body_template }
    );

    // 7. Get generator and produce PDF
    const generator = await getGenerator(documentType, branding, metadata);
    const pdfBytes = await generator.generateAndReturn(docData);

    // 8. Create audit record
    const fullName = getFullName(docData.first_name as string, docData.last_name as string);
    const auditRecord = {
      institution_id: institutionId,
      template_id: template?.id || null,
      document_type: documentType,
      category: info?.category || 'administrative',
      learner_id: learnerId,
      document_number: documentNumber,
      title: `${info?.displayName || documentType} — ${fullName}`,
      data_snapshot: docData,
      status: 'generated',
      generated_by: userId,
      generated_at: metadata.generatedAt,
      verification_code: verificationCode || null,
      verification_url: verificationUrl || null,
      file_size_bytes: pdfBytes.byteLength,
    };

    const { data: savedDoc, error: saveError } = await this.supabase
      .from('generated_documents')
      .insert(auditRecord)
      .select('*')
      .single();

    if (saveError) {
      console.error('[documents/service] Failed to save audit record:', saveError);
    }

    return {
      pdfBytes,
      document: (savedDoc as GeneratedDocument) || (auditRecord as unknown as GeneratedDocument),
    };
  }

  // ── Document History ──────────────────────────────────────────

  static async getDocumentHistory(filters: DocumentHistoryFilters): Promise<DocumentHistoryListResponse> {
    try {
      let query = this.supabase
        .from('generated_documents')
        .select(`
          *,
          learner:learner_id ( id, first_name, last_name, roll_number, register_number ),
          institution:institution_id ( id, name )
        `, { count: 'exact' });

      if (filters.institutionId) query = query.eq('institution_id', filters.institutionId);
      if (filters.documentType) query = query.eq('document_type', filters.documentType);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.learnerId) query = query.eq('learner_id', filters.learnerId);
      if (filters.sectionId) query = query.eq('section_id', filters.sectionId);
      if (filters.dateFrom) query = query.gte('generated_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('generated_at', filters.dateTo);
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,document_number.ilike.%${filters.search}%`);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const sortBy = filters.sortBy || 'generated_at';
      const sortDir = filters.sortDirection === 'asc';

      query = query
        .order(sortBy, { ascending: sortDir })
        .range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        data: (data || []) as GeneratedDocument[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[documents/service] Failed to fetch history:', error);
      return { data: [], metadata: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  static async getLearnerDocuments(learnerId: string): Promise<GeneratedDocument[]> {
    try {
      const { data, error } = await this.supabase
        .from('generated_documents')
        .select('*')
        .eq('learner_id', learnerId)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as GeneratedDocument[];
    } catch (error) {
      console.error('[documents/service] Failed to fetch learner documents:', error);
      return [];
    }
  }

  // ── Verification ──────────────────────────────────────────────

  static async verifyDocument(verificationCode: string): Promise<GeneratedDocument | null> {
    try {
      const { data, error } = await this.supabase
        .from('generated_documents')
        .select(`
          *,
          learner:learner_id ( id, first_name, last_name, roll_number ),
          institution:institution_id ( id, name )
        `)
        .eq('verification_code', verificationCode)
        .single();
      if (error) return null;
      return data as GeneratedDocument;
    } catch {
      return null;
    }
  }

  // ── Revocation ────────────────────────────────────────────────

  static async revokeDocument(documentId: string, reason: string, userId: string): Promise<GeneratedDocument> {
    try {
      const { data, error } = await this.supabase
        .from('generated_documents')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revoke_reason: reason,
        })
        .eq('id', documentId)
        .select('*')
        .single();
      if (error) throw error;
      return data as GeneratedDocument;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to revoke document');
    }
  }
}
