// types/cdc/internships.ts
// CDC Sprint 4 — Corporate internship types
// Derived from live DB schema probed 2026-05-18.

export type CdcInternshipType =
  | 'clinical_posting'
  | 'teaching_practice'
  | 'pharmacy_practice'
  | 'corporate_internship';

// internship_assignments.status values (no DB enum — plain text in prod)
export type InternshipAssignmentStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'withdrawn'
  | 'cancelled';

export interface InternshipSite {
  id: string;
  institution_id: string;
  site_name: string;
  internship_type: CdcInternshipType;
  // corporate-only fields (nullable for clinical/teaching/pharmacy)
  city: string | null;
  state: string | null;
  address_line1: string | null;
  is_active: boolean;
  operates_weekends: boolean | null;
  created_at: string;
}

export interface InternshipAssignment {
  id: string;
  institution_id: string;
  cycle_id: string;
  learner_id: string;
  site_id: string;
  facilitator_id: string;
  preceptor_id: string | null;
  program_id: string | null;
  department_rotation: string | null;
  rotation_start_date: string;
  rotation_end_date: string;
  assignment_join_date: string | null;
  required_attendance_pct: number;
  status: InternshipAssignmentStatus;
  internship_type: CdcInternshipType;
  total_days: number | null;
  days_present: number | null;
  attendance_percentage: number | null;
  overall_grade: string | null;
  // BUG-004087: optional offer-letter document URL (cdc-docs bucket)
  offer_letter_url: string | null;
  // BUG-004039: FK to cdc_internship_types config-master (nullable — backfilled
  // from the legacy internship_type ENUM; null only for rows whose enum had no
  // matching master config_key, which the seed guarantees does not happen).
  internship_type_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InternshipCertificate {
  id: string;
  institution_id: string;
  assignment_id: string;
  certificate_number: string;
  issued_date: string;
  attendance_percentage: number;
  evaluation_average: number;
  certificate_pdf_url: string | null;
  verification_url: string;
  is_revoked: boolean;
  created_at: string;
  created_by: string | null;
}

// Enriched view for the detail page
export interface InternshipAssignmentDetail extends InternshipAssignment {
  site: InternshipSite | null;
  certificate: InternshipCertificate | null;
}

// Filters used by the list page
export interface CdcInternshipFilters {
  internship_type?: CdcInternshipType;
  status?: InternshipAssignmentStatus;
  institution_id?: string;
  page?: number;
  limit?: number;
}

export interface CdcInternshipListResponse {
  data: InternshipAssignmentDetail[];
  total: number;
  page: number;
  limit: number;
}

// Payload for creating a new corporate internship assignment
export interface CreateCorporateInternshipPayload {
  learner_id: string;
  site_id: string;
  facilitator_id: string;
  cycle_id: string;
  rotation_start_date: string; // ISO date
  rotation_end_date: string;   // ISO date
  required_attendance_pct?: number;
  department_rotation?: string;
  // BUG-004087: optional offer-letter document URL (cdc-docs bucket)
  offer_letter_url?: string | null;
  // BUG-004293: optional company/host website URL.
  company_website_url?: string | null;
  // BUG-004295: perks beyond stipend (accommodation / transport / food).
  has_accommodation?: boolean;
  has_transport?: boolean;
  has_food?: boolean;
  // BUG-004292: internship duration in months (e.g. 1, 2, 3, 6, 12).
  duration_months?: number | null;
  // BUG-004039: FK to cdc_internship_types (the CRUDable config-master).
  // Required on new records (Director decision). The API derives the legacy
  // internship_type ENUM from the selected master row's config_key for
  // back-compat, so this FK is the forward-looking source of truth.
  internship_type_id?: string;
}

// Payload for issuing a certificate (POST to /api/cdc/internships/:id/certificate)
export interface IssueCertificatePayload {
  attendance_percentage: number;
  evaluation_average: number;
  competencies_passed?: number;
  competencies_total?: number;
  certificate_pdf_url?: string;
}
