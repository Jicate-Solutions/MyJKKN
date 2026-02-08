// ============================================================================
// Alumni Outcomes Module Types
// Phase P4.1 - Accountability: Track graduate outcomes and program effectiveness
// ============================================================================

// ============================================================================
// ENUMS (MUST match database ENUMs exactly!)
// ============================================================================

export type OutcomeType =
  | 'employed'           // Working in a company
  | 'self_employed'      // Freelance/consulting (was 'freelancer' - WRONG)
  | 'entrepreneur'       // Started own business
  | 'higher_studies'     // Pursuing further education
  | 'competitive_exams'  // Preparing for govt/competitive exams
  | 'family_business'    // Joined family business
  | 'gap_year'          // Taking planned break
  | 'seeking'           // Actively job seeking
  | 'unknown';          // Lost contact/no update

export type SalaryRange =
  | 'below_3l'          // Below 3 LPA
  | '3l_to_5l'          // 3-5 LPA
  | '5l_to_8l'          // 5-8 LPA
  | '8l_to_12l'         // 8-12 LPA
  | '12l_to_20l'        // 12-20 LPA
  | '20l_to_35l'        // 20-35 LPA
  | 'above_35l'         // Above 35 LPA
  | 'not_applicable'    // For non-employed outcomes
  | 'undisclosed';      // Chose not to share

export type VerificationStatus =
  | 'pending'            // Not yet verified
  | 'self_reported'      // Reported by alumni, not verified
  | 'document_verified'  // Verified with offer letter/ID
  | 'employer_confirmed' // Confirmed by employer
  | 'linkedin_verified'  // Verified via LinkedIn
  | 'rejected';          // Verification failed

// ============================================================================
// OUTCOME TYPE LABELS (for UI)
// ============================================================================

export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  employed: 'Employed',
  self_employed: 'Self-Employed / Freelancer',
  entrepreneur: 'Entrepreneur',
  higher_studies: 'Higher Studies',
  competitive_exams: 'Competitive Exams',
  family_business: 'Family Business',
  gap_year: 'Gap Year',
  seeking: 'Seeking',
  unknown: 'Unknown'
};

export const SALARY_RANGE_OPTIONS: SalaryRange[] = [
  'below_3l',
  '3l_to_5l',
  '5l_to_8l',
  '8l_to_12l',
  '12l_to_20l',
  '20l_to_35l',
  'above_35l',
  'not_applicable',
  'undisclosed'
];

export const SALARY_RANGE_LABELS: Record<SalaryRange, string> = {
  below_3l: 'Below 3 LPA',
  '3l_to_5l': '3-5 LPA',
  '5l_to_8l': '5-8 LPA',
  '8l_to_12l': '8-12 LPA',
  '12l_to_20l': '12-20 LPA',
  '20l_to_35l': '20-35 LPA',
  above_35l: 'Above 35 LPA',
  not_applicable: 'Not Applicable',
  undisclosed: 'Undisclosed'
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending',
  self_reported: 'Self Reported',
  document_verified: 'Document Verified',
  employer_confirmed: 'Employer Confirmed',
  linkedin_verified: 'LinkedIn Verified',
  rejected: 'Rejected'
};

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Individual alumni outcome record - MATCHES DATABASE SCHEMA */
export interface AlumniOutcome {
  id: string;

  // Core relationships
  learner_id: string;  // NOT NULL in DB
  institution_id: string;  // NOT NULL in DB
  program_id: string | null;

  // Graduation info
  graduation_date: string;  // DATE NOT NULL - CRITICAL FIELD
  graduation_year: number;  // Auto-computed from graduation_date
  batch_id: string | null;

  // Outcome details
  outcome_type: OutcomeType;
  outcome_start_date: string | null;  // When they started job/business/studies

  // Employment details (when outcome_type = 'employed' or 'self_employed')
  company_name: string | null;
  company_website: string | null;
  designation: string | null;  // DB field name (not job_title)
  department: string | null;
  industry_sector: string | null;  // DB field name (not industry)
  job_function: string | null;  // e.g., "Software Development", "Data Analytics"

  // Location
  city: string | null;
  state: string | null;
  country: string | null;
  is_remote: boolean | null;

  // Compensation
  salary_range: SalaryRange | null;
  has_equity: boolean | null;
  other_benefits: string | null;

  // Program relevance
  is_relevant_to_program: boolean | null;  // DB field name (not is_core_domain)
  relevance_percentage: number | null;  // 0-100
  skills_used: string[] | null;  // DB field name (not competencies_utilized)

  // Higher studies details (when outcome_type = 'higher_studies')
  institution_name: string | null;  // DB field name (not higher_study_institution)
  course_name: string | null;  // DB field name (not higher_study_program)
  specialization: string | null;
  is_scholarship: boolean | null;
  scholarship_details: string | null;

  // Entrepreneurship details (when outcome_type = 'entrepreneur')
  business_name: string | null;  // DB field name (not startup_name)
  business_type: string | null;
  business_sector: string | null;  // DB field name (not startup_industry)
  funding_raised: string | null;
  employee_count: number | null;

  // Satisfaction and feedback
  satisfaction_score: number | null;  // 1-10
  would_recommend_program: boolean | null;
  feedback: string | null;
  suggestions: string | null;
  testimonial: string | null;
  testimonial_approved: boolean | null;

  // Verification
  verification_status: VerificationStatus;  // ENUM, not boolean
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  verification_documents: any | null;  // JSONB

  // Contact preferences
  is_contactable: boolean | null;
  preferred_contact_method: string | null;
  contact_frequency: string | null;

  // Engagement
  is_willing_to_mentor: boolean | null;
  is_willing_to_hire: boolean | null;
  is_willing_to_guest_lecture: boolean | null;
  last_engagement_date: string | null;
  engagement_notes: string | null;

  // Tracking
  reported_at: string | null;
  last_updated_at: string | null;
  update_count: number | null;
  data_source: string | null;  // VARCHAR in DB

  // Audit fields
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields (populated by service)
  program?: { id: string; program_name: string };
  learner?: { id: string; first_name: string; last_name: string };  // Add learner join
}

/** Program-level outcome correlation / effectiveness */
export interface OutcomeProgramCorrelation {
  id: string;
  institution_id: string;
  program_id: string;
  department_id: string | null;
  academic_year: string;
  total_graduates: number;
  placed_count: number;
  higher_studies_count: number;
  entrepreneur_count: number;
  average_salary_lpa: number | null;
  median_salary_lpa: number | null;
  core_domain_percentage: number | null;
  average_time_to_placement_days: number | null;
  top_recruiters: string[];
  top_competencies: string[];
  satisfaction_average: number | null;
  effectiveness_score: number | null;
  computed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  program?: { id: string; program_name: string };
  department?: { id: string; name: string };
}

// ============================================================================
// DTOs - CREATE / UPDATE
// ============================================================================

export interface CreateAlumniOutcomeInput {
  institution_id: string;
  learner_id?: string;
  name: string;
  graduation_year: number;
  program_id?: string;
  department_id?: string;
  outcome_type: OutcomeType;
  company_name?: string;
  job_title?: string;
  industry?: string;
  location?: string;
  salary_range?: string;
  is_core_domain?: boolean;
  higher_study_institution?: string;
  higher_study_program?: string;
  startup_name?: string;
  startup_industry?: string;
  time_to_placement_days?: number;
  competencies_utilized?: string[];
  satisfaction_score?: number;
  feedback?: string;
  linkedin_url?: string;
  data_source?: DataSource;
}

export interface UpdateAlumniOutcomeInput {
  id: string;
  name?: string;
  graduation_year?: number;
  program_id?: string;
  department_id?: string;
  outcome_type?: OutcomeType;
  company_name?: string;
  job_title?: string;
  industry?: string;
  location?: string;
  salary_range?: string;
  is_core_domain?: boolean;
  higher_study_institution?: string;
  higher_study_program?: string;
  startup_name?: string;
  startup_industry?: string;
  time_to_placement_days?: number;
  competencies_utilized?: string[];
  satisfaction_score?: number;
  feedback?: string;
  linkedin_url?: string;
  verified?: boolean;
  verified_by?: string;
  verified_at?: string;
  data_source?: DataSource;
}

export interface CreateOutcomeCorrelationInput {
  institution_id: string;
  program_id: string;
  department_id?: string;
  academic_year: string;
  total_graduates?: number;
  placed_count?: number;
  higher_studies_count?: number;
  entrepreneur_count?: number;
  average_salary_lpa?: number;
  median_salary_lpa?: number;
  core_domain_percentage?: number;
  average_time_to_placement_days?: number;
  top_recruiters?: string[];
  top_competencies?: string[];
  satisfaction_average?: number;
  effectiveness_score?: number;
}

export interface UpdateOutcomeCorrelationInput {
  id: string;
  total_graduates?: number;
  placed_count?: number;
  higher_studies_count?: number;
  entrepreneur_count?: number;
  average_salary_lpa?: number;
  median_salary_lpa?: number;
  core_domain_percentage?: number;
  average_time_to_placement_days?: number;
  top_recruiters?: string[];
  top_competencies?: string[];
  satisfaction_average?: number;
  effectiveness_score?: number;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface AlumniOutcomeFilters {
  institution_id?: string;
  search?: string;
  outcome_type?: OutcomeType;
  graduation_year?: number;
  program_id?: string;
  department_id?: string;
  verified?: boolean;
  data_source?: DataSource;
  is_core_domain?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'name' | 'graduation_year' | 'created_at' | 'outcome_type';
  sort_order?: 'asc' | 'desc';
}

export interface OutcomeCorrelationFilters {
  institution_id?: string;
  program_id?: string;
  department_id?: string;
  academic_year?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// DASHBOARD / ANALYTICS
// ============================================================================

export interface AlumniDashboardStats {
  total_tracked: number;
  by_outcome_type: Record<OutcomeType, number>;
  placement_percentage: number;
  higher_studies_percentage: number;
  entrepreneur_percentage: number;
  core_domain_percentage: number;
  average_satisfaction: number;
  verified_count: number;
  unverified_count: number;
  average_time_to_placement_days: number;
  by_salary_range: Record<string, number>;
}

// ============================================================================
// RESPONSE / UTILITY TYPES
// ============================================================================

/** Paginated list response */
export interface AlumniListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
