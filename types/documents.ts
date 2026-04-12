// types/documents.ts
// Document Generation Engine — types, constants, and DTOs

// ── Document Type Constants ──────────────────────────────────────

export const DOCUMENT_TYPES = {
  // Certificates
  COMPLETION_CERTIFICATE: 'completion_certificate',
  SCHOLARSHIP_CERTIFICATE: 'scholarship_certificate',
  ATTENDANCE_CERTIFICATE: 'attendance_certificate',
  ACHIEVEMENT_CERTIFICATE: 'achievement_certificate',
  TRAINING_CERTIFICATE: 'training_certificate',
  // Letters
  ADMISSION_LETTER: 'admission_letter',
  BONAFIDE_LETTER: 'bonafide_letter',
  FEE_NOTICE_LETTER: 'fee_notice_letter',
  RECOMMENDATION_LETTER: 'recommendation_letter',
  GENERAL_LETTER: 'general_letter',
  // Administrative
  REPORT_CARD: 'report_card',
  HALL_TICKET: 'hall_ticket',
  TRANSFER_CERTIFICATE: 'transfer_certificate',
  PROGRESS_REPORT: 'progress_report',
  CLASS_ROSTER: 'class_roster',
} as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

export type DocumentCategory = 'certificate' | 'letter' | 'administrative';

export type DocumentStatus = 'generated' | 'printed' | 'revoked' | 'superseded';

export type PageOrientation = 'portrait' | 'landscape';

export type PageSize = 'a4' | 'letter' | 'legal';

// ── Document Type Metadata ──────────────────────────────────────

/** Static metadata describing each document type's defaults and capabilities. */
export interface DocumentTypeInfo {
  type: DocumentType;
  displayName: string;
  category: DocumentCategory;
  defaultOrientation: PageOrientation;
  supportsQR: boolean;
  description: string;
}

export const DOCUMENT_TYPE_INFO: Record<DocumentType, DocumentTypeInfo> = {
  completion_certificate: {
    type: 'completion_certificate',
    displayName: 'Certificate of Completion',
    category: 'certificate',
    defaultOrientation: 'landscape',
    supportsQR: true,
    description: 'Course/program completion certificate with QR verification',
  },
  scholarship_certificate: {
    type: 'scholarship_certificate',
    displayName: 'Scholarship Certificate',
    category: 'certificate',
    defaultOrientation: 'landscape',
    supportsQR: true,
    description: 'Scholarship award certificate',
  },
  attendance_certificate: {
    type: 'attendance_certificate',
    displayName: 'Attendance Certificate',
    category: 'certificate',
    defaultOrientation: 'landscape',
    supportsQR: false,
    description: 'Certificate for meeting attendance threshold',
  },
  achievement_certificate: {
    type: 'achievement_certificate',
    displayName: 'Achievement Certificate',
    category: 'certificate',
    defaultOrientation: 'landscape',
    supportsQR: false,
    description: 'Certificate recognizing specific achievements',
  },
  training_certificate: {
    type: 'training_certificate',
    displayName: 'Training Certificate',
    category: 'certificate',
    defaultOrientation: 'landscape',
    supportsQR: true,
    description: 'Training program completion certificate',
  },
  admission_letter: {
    type: 'admission_letter',
    displayName: 'Letter of Admission',
    category: 'letter',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Official admission/welcome letter with program details',
  },
  bonafide_letter: {
    type: 'bonafide_letter',
    displayName: 'Bonafide Certificate',
    category: 'letter',
    defaultOrientation: 'portrait',
    supportsQR: true,
    description: 'Certificate confirming student enrollment status',
  },
  fee_notice_letter: {
    type: 'fee_notice_letter',
    displayName: 'Fee Notice',
    category: 'letter',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Outstanding fee notice with payment details',
  },
  recommendation_letter: {
    type: 'recommendation_letter',
    displayName: 'Recommendation Letter',
    category: 'letter',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Academic recommendation letter',
  },
  general_letter: {
    type: 'general_letter',
    displayName: 'General Letter',
    category: 'letter',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Customizable letter with free-form body template',
  },
  report_card: {
    type: 'report_card',
    displayName: 'Report Card',
    category: 'administrative',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Semester report card with grades, attendance, and remarks',
  },
  hall_ticket: {
    type: 'hall_ticket',
    displayName: 'Hall Ticket',
    category: 'administrative',
    defaultOrientation: 'portrait',
    supportsQR: true,
    description: 'Examination hall ticket with student photo and QR',
  },
  transfer_certificate: {
    type: 'transfer_certificate',
    displayName: 'Transfer Certificate',
    category: 'administrative',
    defaultOrientation: 'portrait',
    supportsQR: true,
    description: 'Official Transfer Certificate (TC) with conduct and dates',
  },
  progress_report: {
    type: 'progress_report',
    displayName: 'Progress Report',
    category: 'administrative',
    defaultOrientation: 'portrait',
    supportsQR: false,
    description: 'Student progress report with attendance trends',
  },
  class_roster: {
    type: 'class_roster',
    displayName: 'Class Roster',
    category: 'administrative',
    defaultOrientation: 'landscape',
    supportsQR: false,
    description: 'Section-wise student list with roll numbers',
  },
};

// ── Signature Configuration ─────────────────────────────────────

/** Signatory block that appears at the bottom of a document. */
export interface SignatureConfig {
  /** Role title displayed beneath the line, e.g. "Principal" */
  role: string;
  /** Full name of the signatory, e.g. "Dr. S. Omm" */
  name: string;
  /** Optional URL to a signature image stored in Supabase Storage */
  signatureImageUrl?: string;
  /** Horizontal position of this signature block on the page */
  position: 'left' | 'center' | 'right';
}

// ── Institution Settings Entity ─────────────────────────────────

/** Per-institution branding and layout configuration for all generated documents. */
export interface DocumentInstitutionSettings {
  id: string;
  institution_id: string;
  logo_url?: string;
  header_text?: string;
  footer_text?: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  signatures: SignatureConfig[];
  watermark_text?: string;
  watermark_opacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertDocumentSettingsDto {
  logo_url?: string;
  header_text?: string;
  footer_text?: string;
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  signatures?: SignatureConfig[];
  watermark_text?: string;
  watermark_opacity?: number;
}

// ── Document Template Entity ────────────────────────────────────

/**
 * A document template defines how a specific document type is rendered
 * for a given institution. Each institution can customise orientation,
 * page size, header/footer overrides, body template (for letters),
 * field visibility, and numbering prefix.
 */
export interface DocumentTemplate {
  id: string;
  institution_id: string;
  document_type: DocumentType;
  display_name: string;
  category: DocumentCategory;
  orientation: PageOrientation;
  page_size: PageSize;
  custom_header_text?: string;
  custom_footer_text?: string;
  /** Free-form text with {{placeholder}} tokens, used for letters */
  body_template?: string;
  /** Toggle visibility of optional fields, e.g. { show_grades: true, show_photo: true } */
  field_config: Record<string, boolean>;
  qr_verification: boolean;
  /** Auto-numbering prefix, e.g. 'JKKN/CERT/2026/' */
  number_prefix?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateDocumentTemplateDto {
  display_name?: string;
  orientation?: PageOrientation;
  page_size?: PageSize;
  custom_header_text?: string;
  custom_footer_text?: string;
  body_template?: string;
  field_config?: Record<string, boolean>;
  qr_verification?: boolean;
  number_prefix?: string;
  is_active?: boolean;
}

// ── Generated Document Entity ───────────────────────────────────

/**
 * A single generated document record. Stores the data snapshot used at
 * generation time so the document can be re-rendered exactly as issued,
 * even if the source data changes later.
 */
export interface GeneratedDocument {
  id: string;
  institution_id: string;
  template_id?: string;
  document_type: DocumentType;
  category: DocumentCategory;
  /** null for class-level docs like class_roster */
  learner_id?: string;
  section_id?: string;
  document_number: string;
  title: string;
  /** Frozen copy of all data used to render the document */
  data_snapshot: Record<string, unknown>;
  status: DocumentStatus;
  generated_by: string;
  generated_at: string;
  verification_code?: string;
  verification_url?: string;
  storage_path?: string;
  file_size_bytes?: number;
  revoked_at?: string;
  revoked_by?: string;
  revoke_reason?: string;
  created_at: string;
  updated_at: string;

  // Joined relations (optional, populated by service select)
  learner?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number?: string;
    register_number?: string;
    student_photo_url?: string;
  };
  institution?: {
    id: string;
    name: string;
  };
  generated_by_profile?: {
    id: string;
    full_name: string;
  };
}

// ── Generation DTOs ─────────────────────────────────────────────

/** Request body for generating a single document for one learner. */
export interface GenerateDocumentDto {
  institutionId: string;
  documentType: DocumentType;
  learnerId: string;
  /** Extra fields like achievement_title, exam_name, etc. */
  additionalData?: Record<string, unknown>;
}

/** Request body for bulk-generating documents for an entire section. */
export interface GenerateBulkDocumentsDto {
  institutionId: string;
  documentType: DocumentType;
  sectionId: string;
  /** Extra fields applied to all documents in the batch */
  additionalData?: Record<string, unknown>;
}

// ── History Filters ─────────────────────────────────────────────

export interface DocumentHistoryFilters {
  institutionId?: string;
  documentType?: DocumentType;
  category?: DocumentCategory;
  status?: DocumentStatus;
  learnerId?: string;
  sectionId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'generated_at' | 'document_number' | 'document_type';
  sortDirection?: 'asc' | 'desc';
}

export interface DocumentHistoryListResponse {
  data: GeneratedDocument[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Generator Types (internal, used by PDF generators) ──────────

/**
 * Pre-resolved branding payload passed to every PDF generator function.
 * All image URLs are already fetched and converted to base64 data URIs
 * so generators can work synchronously with the drawing context.
 */
export interface DocumentBranding {
  institutionName: string;
  institutionAddress: string;
  institutionCity: string;
  institutionState: string;
  institutionPinCode: string;
  counsellingCode?: string;
  accreditedBy?: string;
  /** Pre-fetched base64 data URI of institution logo */
  logoDataUrl: string;
  headerText?: string;
  footerText?: string;
  primaryColor: { r: number; g: number; b: number };
  secondaryColor: { r: number; g: number; b: number };
  backgroundColor: { r: number; g: number; b: number };
  signatures: Array<SignatureConfig & { signatureDataUrl?: string }>;
  watermarkText?: string;
  watermarkOpacity: number;
}

/** Metadata stamped onto every generated document for tracking and verification. */
export interface DocumentMetadata {
  documentNumber: string;
  documentType: DocumentType;
  category: DocumentCategory;
  verificationCode?: string;
  verificationUrl?: string;
  generatedAt: string;
  generatedBy: string;
}

// ── Learner Core Data (assembled by data service) ───────────────

/**
 * Flattened learner record assembled from students, enrollments,
 * institutions, programs, sections, semesters, etc. Used as the
 * primary data source for all document generators.
 */
export interface LearnerCoreData {
  // Student identity
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  roll_number?: string;
  register_number?: string;
  student_photo_url?: string;
  student_mobile?: string;
  student_email?: string;
  father_name?: string;
  mother_name?: string;
  permanent_address_street?: string;
  permanent_address_district?: string;
  permanent_address_state?: string;
  permanent_address_pin_code?: string;
  lifecycle_status?: string;
  admission_year?: string;
  aadhar_number?: string;
  blood_group?: string;
  religion?: string;
  community?: string;
  caste?: string;

  // Historical marks
  tenth_marks?: {
    max_marks?: number;
    obtained_marks?: number;
    percentage?: number;
  };
  twelfth_marks?: {
    group?: string;
    max_marks?: number;
    obtained_marks?: number;
    percentage?: number;
    subjects?: unknown[];
  };

  // Academic hierarchy
  institution_id: string;
  institution_name: string;
  institution_logo_url?: string;
  institution_address?: string;
  institution_city?: string;
  institution_state?: string;
  institution_pin_code?: string;
  institution_counselling_code?: string;
  institution_accredited_by?: string;
  degree_name?: string;
  degree_type?: string;
  department_name?: string;
  program_name?: string;
  program_type?: string;
  section_name?: string;
  semester_name?: string;
  academic_year_name?: string;
  batch_name?: string;
  regulation_code?: string;
}

// ── Supporting Data Types ───────────────────────────────────────

/** Attendance summary for a learner, optionally broken down by course. */
export interface AttendanceData {
  totalClasses: number;
  presentCount: number;
  absentCount: number;
  percentage: number;
  courseWise?: Array<{
    course_name: string;
    course_code?: string;
    total: number;
    present: number;
    absent: number;
    percentage: number;
  }>;
}

/** Outstanding billing summary for fee notice documents. */
export interface BillingData {
  totalOutstanding: number;
  bills: Array<{
    id: string;
    description: string;
    amount: number;
    due_date: string;
    status: 'unpaid' | 'paid' | 'partial';
    balance: number;
  }>;
}

/** Authority figures resolved for the learner's academic unit. */
export interface AuthorityData {
  principal?: { name: string; designation: string };
  hod?: { name: string; designation: string };
  classIncharge?: { name: string; designation: string };
}
