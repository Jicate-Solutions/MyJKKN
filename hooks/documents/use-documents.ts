/**
 * Document Generation Engine — React Query Hooks
 * Follows existing patterns from hooks/billing/use-billing-invoices.ts
 */

'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { DocumentGenerationService } from '@/lib/services/documents/document-generation-service';
import { DocumentDataService } from '@/lib/services/documents/document-data-service';
import type {
  DocumentType,
  DocumentHistoryFilters,
  DocumentHistoryListResponse,
  GenerateDocumentDto,
  UpsertDocumentSettingsDto,
  UpdateDocumentTemplateDto,
} from '@/types/documents';

// ── Query Key Factory ───────────────────────────────────────────

const documentKeys = {
  all: ['documents'] as const,
  history: (filters: DocumentHistoryFilters) => ['documents', 'history', filters] as const,
  learner: (learnerId: string) => ['documents', 'learner', learnerId] as const,
  templates: (institutionId: string) => ['documents', 'templates', institutionId] as const,
  settings: (institutionId: string) => ['documents', 'settings', institutionId] as const,
};

// ── Document History ────────────────────────────────────────────

export function useDocumentHistory(initialFilters: DocumentHistoryFilters = {}) {
  const [filters, setFilters] = useState<DocumentHistoryFilters>({
    page: 1,
    limit: 20,
    ...initialFilters,
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: documentKeys.history(filters),
    queryFn: () => DocumentGenerationService.getDocumentHistory(filters),
    placeholderData: (previousData: DocumentHistoryListResponse | undefined) => previousData,
  });

  const updateFilters = useCallback((newFilters: Partial<DocumentHistoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: newFilters.page || 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: documentKeys.all });
  }, [queryClient]);

  return {
    documents: data?.data || [],
    metadata: data?.metadata || { total: 0, page: 1, limit: 20, totalPages: 0 },
    loading: isLoading,
    error: error?.message,
    filters,
    updateFilters,
    changePage,
    refresh,
  };
}

// ── Learner Documents ───────────────────────────────────────────

export function useLearnerDocuments(learnerId: string) {
  return useQuery({
    queryKey: documentKeys.learner(learnerId),
    queryFn: () => DocumentGenerationService.getLearnerDocuments(learnerId),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ── Templates ───────────────────────────────────────────────────

export function useDocumentTemplates(institutionId: string) {
  return useQuery({
    queryKey: documentKeys.templates(institutionId),
    queryFn: () => DocumentGenerationService.getTemplates(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ── Institution Settings ────────────────────────────────────────

export function useDocumentSettings(institutionId: string) {
  return useQuery({
    queryKey: documentKeys.settings(institutionId),
    queryFn: () => DocumentGenerationService.getInstitutionSettings(institutionId),
    enabled: !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ── Generate Single Document ────────────────────────────────────

export function useGenerateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dto, userId }: { dto: GenerateDocumentDto; userId: string }) => {
      return DocumentGenerationService.generateDocument(dto, userId);
    },
    onSuccess: (result) => {
      // Trigger browser download
      const blob = new Blob([result.pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.document.document_number.replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(`${result.document.title} generated successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate document');
    },
  });
}

// ── Generate Bulk Documents ─────────────────────────────────────

export function useGenerateBulkDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      institutionId,
      documentType,
      sectionId,
      userId,
      additionalData,
      onProgress,
    }: {
      institutionId: string;
      documentType: DocumentType;
      sectionId: string;
      userId: string;
      additionalData?: Record<string, unknown>;
      onProgress?: (current: number, total: number) => void;
    }) => {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      // 1. Fetch all learners in section
      const learners = await DocumentDataService.getSectionLearnersData(sectionId);
      if (learners.length === 0) throw new Error('No active learners found in this section');

      // 2. Assemble branding once
      const branding = await DocumentGenerationService.assembleBranding(institutionId);

      // 3. Generate each document
      const { getGenerator } = await import('@/lib/utils/document-generators/generator-registry');
      const { DOCUMENT_TYPE_INFO } = await import('@/types/documents');
      const { generateVerificationCode, buildVerificationUrl, getFullName } = await import('@/lib/utils/document-generators/brand-utils');

      const info = DOCUMENT_TYPE_INFO[documentType];
      const auditRecords: Record<string, unknown>[] = [];

      for (let i = 0; i < learners.length; i++) {
        const learner = learners[i];
        onProgress?.(i + 1, learners.length);

        const docNumber = await DocumentGenerationService.generateDocumentNumber(institutionId, documentType);
        const verificationCode = info.supportsQR ? generateVerificationCode() : undefined;
        const verificationUrl = verificationCode ? buildVerificationUrl(verificationCode) : undefined;

        const metadata = {
          documentNumber: docNumber,
          documentType,
          category: info.category,
          verificationCode,
          verificationUrl,
          generatedAt: new Date().toISOString(),
          generatedBy: userId,
        };

        const docData: Record<string, unknown> = {
          ...learner,
          full_name: getFullName(learner.first_name, learner.last_name),
          ...additionalData,
        };

        const generator = await getGenerator(documentType, branding, metadata);
        const pdfBytes = await generator.generateAndReturn(docData);

        const filename = `${learner.roll_number || i + 1}_${learner.last_name}_${learner.first_name}_${documentType}.pdf`;
        zip.file(filename, pdfBytes);

        auditRecords.push({
          institution_id: institutionId,
          document_type: documentType,
          category: info.category,
          learner_id: learner.id,
          section_id: sectionId,
          document_number: docNumber,
          title: `${info.displayName} — ${getFullName(learner.first_name, learner.last_name)}`,
          data_snapshot: docData,
          status: 'generated',
          generated_by: userId,
          generated_at: metadata.generatedAt,
          verification_code: verificationCode || null,
          verification_url: verificationUrl || null,
          file_size_bytes: pdfBytes.byteLength,
        });
      }

      // 4. Generate ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      return { zipBlob, count: learners.length, auditRecords };
    },
    onSuccess: (result) => {
      // Trigger ZIP download
      const url = URL.createObjectURL(result.zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success(`${result.count} documents generated and downloaded`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate bulk documents');
    },
  });
}

// ── Update Template ─────────────────────────────────────────────

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: UpdateDocumentTemplateDto }) =>
      DocumentGenerationService.updateTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success('Template updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update template');
    },
  });
}

// ── Update Settings ─────────────────────────────────────────────

export function useUpdateDocumentSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      institutionId,
      data,
    }: {
      institutionId: string;
      data: UpsertDocumentSettingsDto;
    }) => DocumentGenerationService.upsertInstitutionSettings(institutionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success('Document settings saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });
}

// ── Revoke Document ─────────────────────────────────────────────

export function useRevokeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      reason,
      userId,
    }: {
      documentId: string;
      reason: string;
      userId: string;
    }) => DocumentGenerationService.revokeDocument(documentId, reason, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      toast.success('Document revoked');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke document');
    },
  });
}
