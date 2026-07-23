// types/cdc/employer-requirements.ts
// CDC Employer Requirement Intake — a company's inbound job-vacancy submission
// (header) with one or more roles, each carrying structured skills. Two entry
// paths: public self-submit portal (→ pending_review) and CDC staff direct entry.

export type EmployerRequirementSource =
  | 'public_portal'
  | 'cdc_staff'
  | 'email'
  | 'walk_in';

export type EmployerRequirementStatus =
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'closed';

export type RoleExperienceLevel = 'fresher' | 'experienced' | 'any';
export type RoleWorkMode = 'in_person' | 'remote' | 'hybrid';
export type RoleStatus = 'open' | 'published_bulletin' | 'converted_drive' | 'closed';

export interface EmployerRequirementRole {
  id: string;
  requirement_id: string;
  role_title: string;
  description: string | null;
  skills: string[];
  experience_level: RoleExperienceLevel;
  experience_min_years: number | null;
  education_text: string | null;
  package_lpa: number | null;
  benefits: string | null;
  work_mode: RoleWorkMode | null;
  location: string | null;
  openings_count: number;
  status: RoleStatus;
  published_opportunity_id: string | null;
  drive_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployerRequirement {
  id: string;
  recruiter_id: string | null;
  company_name: string;
  company_website: string | null;
  industry_sector_id: string | null;
  hq_city: string | null;
  hq_state: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  source: EmployerRequirementSource;
  source_document_url: string | null;
  institution_id: string | null;
  status: EmployerRequirementStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EmployerRequirementWithRoles extends EmployerRequirement {
  roles: EmployerRequirementRole[];
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateRoleInput {
  role_title: string;
  description?: string | null;
  skills?: string[];
  experience_level?: RoleExperienceLevel;
  experience_min_years?: number | null;
  education_text?: string | null;
  package_lpa?: number | null;
  benefits?: string | null;
  work_mode?: RoleWorkMode | null;
  location?: string | null;
  openings_count?: number;
}

export interface CreateEmployerRequirementInput {
  company_name: string;
  company_website?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  secondary_contact_name?: string | null;
  secondary_contact_phone?: string | null;
  institution_id?: string | null;
  roles: CreateRoleInput[];
}

// Public-portal submission body (superset adds the honeypot anti-spam field).
export interface PublicEmployerSubmitInput extends CreateEmployerRequirementInput {
  // Honeypot: must be empty. Bots fill hidden fields; real users can't see it.
  company_fax?: string;
}

export interface ModerateRequirementInput {
  status: Extract<EmployerRequirementStatus, 'approved' | 'rejected' | 'closed'>;
  review_notes?: string | null;
}

// ── Skills-match RPC result ───────────────────────────────────────────────────

export interface RoleMatchLearner {
  learner_id: string;
  learner_name: string;
  register_number: string | null;
  institution_id: string | null;
  institution_name: string | null;
  matched_skills: string[];
  match_count: number;
}
