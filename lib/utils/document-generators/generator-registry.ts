/**
 * Document Generation Engine — Generator Registry
 * Factory pattern with lazy imports so only the requested generator's
 * code is loaded — critical for keeping the client-side bundle small.
 */

import type { DocumentBranding, DocumentMetadata, DocumentType } from '@/types/documents';
import type { BaseDocumentGenerator } from './base-document-generator';

type GeneratorClass = new (
  branding: DocumentBranding,
  metadata: DocumentMetadata
) => BaseDocumentGenerator;

type LazyImport = () => Promise<GeneratorClass>;

const GENERATOR_MAP: Record<DocumentType, LazyImport> = {
  // Certificates
  completion_certificate: () =>
    import('./certificates/completion-certificate').then((m) => m.CompletionCertificateGenerator),
  scholarship_certificate: () =>
    import('./certificates/scholarship-certificate').then((m) => m.ScholarshipCertificateGenerator),
  attendance_certificate: () =>
    import('./certificates/attendance-certificate').then((m) => m.AttendanceCertificateGenerator),
  achievement_certificate: () =>
    import('./certificates/achievement-certificate').then((m) => m.AchievementCertificateGenerator),
  training_certificate: () =>
    import('./certificates/training-certificate').then((m) => m.TrainingCertificateGenerator),

  // Letters
  admission_letter: () =>
    import('./letters/admission-letter').then((m) => m.AdmissionLetterGenerator),
  bonafide_letter: () =>
    import('./letters/bonafide-letter').then((m) => m.BonafideLetterGenerator),
  fee_notice_letter: () =>
    import('./letters/fee-notice-letter').then((m) => m.FeeNoticeLetterGenerator),
  recommendation_letter: () =>
    import('./letters/recommendation-letter').then((m) => m.RecommendationLetterGenerator),
  general_letter: () =>
    import('./letters/general-letter').then((m) => m.GeneralLetterGenerator),

  // Administrative
  report_card: () =>
    import('./administrative/report-card').then((m) => m.ReportCardGenerator),
  hall_ticket: () =>
    import('./administrative/hall-ticket').then((m) => m.HallTicketGenerator),
  transfer_certificate: () =>
    import('./administrative/transfer-certificate').then((m) => m.TransferCertificateGenerator),
  progress_report: () =>
    import('./administrative/progress-report').then((m) => m.ProgressReportGenerator),
  class_roster: () =>
    import('./administrative/class-roster').then((m) => m.ClassRosterGenerator),
};

/**
 * Resolve and instantiate the generator for a given document type.
 * Uses lazy imports — only the requested generator is loaded.
 */
export async function getGenerator(
  documentType: DocumentType,
  branding: DocumentBranding,
  metadata: DocumentMetadata
): Promise<BaseDocumentGenerator> {
  const loader = GENERATOR_MAP[documentType];
  if (!loader) {
    throw new Error(`No generator registered for document type: ${documentType}`);
  }
  const GeneratorClass = await loader();
  return new GeneratorClass(branding, metadata);
}

/** All registered document type keys */
export const REGISTERED_TYPES = Object.keys(GENERATOR_MAP) as DocumentType[];
