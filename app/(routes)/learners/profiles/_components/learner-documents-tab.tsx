'use client';

/**
 * Learner Documents Tab — integrated into learner profile detail page.
 * Uses shared PDF utilities directly (no centralized hub).
 * Offers: Bonafide Certificate, Transfer Certificate, General Letter
 */

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';
import { DocumentAuditService } from '@/lib/services/document-audit-service';
import { DOCUMENT_TYPE_INFO, type DocumentType, type GeneratedDocument } from '@/types/documents';
import type { LearnerProfile } from '@/types/learner-profile';
import {
  DEFAULT_COLORS, fetchImageAsDataUrl, hexToRgb, getFullName,
} from '@/lib/utils/pdf/brand-utils';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';

interface Props {
  learner: LearnerProfile;
}

// Only these 3 document types are available from the learner profile
const AVAILABLE_TYPES: { type: DocumentType; label: string }[] = [
  { type: 'bonafide_letter', label: 'Bonafide Certificate' },
  { type: 'transfer_certificate', label: 'Transfer Certificate' },
  { type: 'general_letter', label: 'General Letter' },
];

async function assembleBranding(institutionId: string): Promise<DocumentBranding> {
  const settings = await DocumentAuditService.getInstitutionBranding(institutionId);
  const logoDataUrl = settings?.logo_url ? await fetchImageAsDataUrl(settings.logo_url) : '';
  return {
    institutionName: 'JKKN Institution',
    institutionAddress: '', institutionCity: '', institutionState: '', institutionPinCode: '',
    logoDataUrl,
    primaryColor: settings?.primary_color ? hexToRgb(settings.primary_color) : DEFAULT_COLORS.primary,
    secondaryColor: settings?.secondary_color ? hexToRgb(settings.secondary_color) : DEFAULT_COLORS.secondary,
    backgroundColor: settings?.background_color ? hexToRgb(settings.background_color) : DEFAULT_COLORS.background,
    signatures: settings?.signatures || [],
    watermarkOpacity: settings?.watermark_opacity ?? 0.05,
    headerText: settings?.header_text,
    footerText: settings?.footer_text,
    watermarkText: settings?.watermark_text,
  };
}

export function LearnerDocumentsTab({ learner }: Props) {
  const { profile } = useAuth();
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    DocumentAuditService.getLearnerDocuments(learner.id)
      .then(setDocuments)
      .finally(() => setLoadingDocs(false));
  }, [learner.id]);

  const handleGenerate = async (documentType: DocumentType) => {
    if (!profile) return;
    setGeneratingType(documentType);

    try {
      // 1. Assemble branding
      const branding = await assembleBranding(learner.institution_id);
      branding.institutionName = (learner as any).institutions?.name || branding.institutionName;

      // 2. Generate document number + verification
      const docNumber = await DocumentAuditService.generateDocumentNumber(learner.institution_id, documentType);
      const verification = DocumentAuditService.generateVerification();
      const info = DOCUMENT_TYPE_INFO[documentType];

      const metadata: DocumentMetadata = {
        documentNumber: docNumber,
        documentType,
        category: info.category,
        verificationCode: info.supportsQR ? verification.code : undefined,
        verificationUrl: info.supportsQR ? verification.url : undefined,
        generatedAt: new Date().toISOString(),
        generatedBy: profile.id,
      };

      // 3. Build data from already-loaded learner profile
      const fullName = getFullName(learner.first_name, learner.last_name);
      const data: Record<string, unknown> = {
        ...learner,
        full_name: fullName,
        program_name: (learner as any).programs?.program_name || '',
        degree_name: (learner as any).degrees?.degree_name || '',
        department_name: (learner as any).departments?.department_name || '',
        semester_name: (learner as any).semesters?.semester_name || '',
        section_name: (learner as any).sections?.section_name || '',
        academic_year_name: (learner as any).academic_years?.academic_year_name || '',
        batch_name: (learner as any).batches?.batch_name || '',
      };

      // 4. Lazy-load the right generator and generate
      let generator;
      if (documentType === 'bonafide_letter') {
        const { BonafideLetterGenerator } = await import('@/lib/utils/pdf/generators/bonafide-letter');
        generator = new BonafideLetterGenerator(branding, metadata);
      } else if (documentType === 'transfer_certificate') {
        const { TransferCertificateGenerator } = await import('@/lib/utils/pdf/generators/transfer-certificate');
        generator = new TransferCertificateGenerator(branding, metadata);
      } else {
        const { GeneralLetterGenerator } = await import('@/lib/utils/pdf/generators/general-letter');
        generator = new GeneralLetterGenerator(branding, metadata);
      }

      const filename = `${docNumber.replace(/\//g, '-')}_${fullName.replace(/\s/g, '_')}.pdf`;
      await generator.generateAndDownload(data, filename);

      // 5. Audit trail (non-blocking)
      await DocumentAuditService.insertAuditRecord({
        institution_id: learner.institution_id,
        document_type: documentType,
        category: info.category,
        learner_id: learner.id,
        document_number: docNumber,
        title: `${info.displayName} — ${fullName}`,
        generated_by: profile.id,
        verification_code: metadata.verificationCode,
        verification_url: metadata.verificationUrl,
      });

      toast.success(`${info.displayName} generated`);

      // Refresh history
      const updated = await DocumentAuditService.getLearnerDocuments(learner.id);
      setDocuments(updated);
    } catch (err) {
      toast.error('Failed to generate document');
      console.error('[learner-docs] Generation error:', err);
    } finally {
      setGeneratingType(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {documents.length} document(s) generated
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={!!generatingType}>
              {generatingType ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Generate Document
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {AVAILABLE_TYPES.map((dt) => (
              <DropdownMenuItem
                key={dt.type}
                onClick={() => handleGenerate(dt.type)}
                disabled={generatingType === dt.type}
              >
                {dt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loadingDocs ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No documents generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate bonafide certificates, transfer certificates, or general letters
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const typeInfo = DOCUMENT_TYPE_INFO[doc.document_type];
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium text-sm">
                    {typeInfo?.displayName || doc.document_type}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{doc.document_number}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${
                      doc.status === 'revoked' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.generated_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
