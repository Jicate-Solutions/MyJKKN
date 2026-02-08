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
  higher_studies: 'Higher Studies',
  entrepreneur: 'Entrepreneur',
  freelancer: 'Freelancer',
  unemployed: 'Unemployed',
  unknown: 'Unknown'
};

export const SALARY_RANGE_OPTIONS: SalaryRange[] = [
  'below_3_lpa',
  '3-5 LPA',
  '5-8 LPA',
  '8-12 LPA',
  '12+ LPA'
];

export const SALARY_RANGE_LABELS: Record<SalaryRange, string> = {
  below_3_lpa: 'Below 3 LPA',
  '3-5 LPA': '3-5 LPA',
  '5-8 LPA': '5-8 LPA',
  '8-12 LPA': '8-12 LPA',
  '12+ LPA': '12+ LPA'
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  self_reported: 'Self Reported',
  verified: 'Verified',
  alumni_survey: 'Alumni Survey',
  linkedin: 'LinkedIn'
};

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Individual alumni outcome record */
export interface AlumniOutcome {
  id: string;
  institution_id: string;
  learner_id: string | null;
  name: string;
  graduation_year: number;
  program_id: string | null;
  department_id: string | null;
  outcome_type: OutcomeType;
  company_name: string | null;
  job_title: string | null;
  industry: string | null;
  location: string | null;
  salary_range: string | null;
  is_core_domain: boolean | null;
  higher_study_institution: string | null;
  higher_study_program: string | null;
  startup_name: string | null;
  startup_industry: string | null;
  time_to_placement_days: number | null;
  competencies_utilized: string[];
  satisfaction_score: number | null;
  feedback: string | null;
  linkedin_url: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by service)
  program?: { id: string; program_name: string };
  department?: { id: string; name: string };
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
