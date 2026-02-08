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

export type DataSource =
  | 'self_reported'       // Alumni filled form themselves
  | 'phone_survey'        // Data collected via phone call
  | 'email_survey'        // Data collected via email survey
  | 'linkedin_scrape'     // Auto-collected from LinkedIn
  | 'placement_cell'      // Entered by placement officer
  | 'employer_feedback'   // Provided by employer
  | 'alumni_meet'         // Collected at alumni gathering
  | 'manual_entry';       // Admin manual entry

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  self_reported: 'Self Reported',
  phone_survey: 'Phone Survey',
  email_survey: 'Email Survey',
  linkedin_scrape: 'LinkedIn',
  placement_cell: 'Placement Cell',
  employer_feedback: 'Employer Feedback',
  alumni_meet: 'Alumni Meet',
  manual_entry: 'Manual Entry'
};

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Individual alumni outcome record - MATCHES DATABASE SCHEMA */
export interface AlumniOutcome {
  id: string;

  // Core relationships
  learner_id: string | null;  // NULLABLE in DB (verified 2026-02-08)
  institution_id: string;  // NOT NULL in DB
  program_id: string | null;

  // Graduation info
  graduation_date: string | null;  // NULLABLE in DB (verified 2026-02-08)
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
  data_source: DataSource | null;  // USER-DEFINED ENUM in DB (not VARCHAR)

  // Audit fields
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields (populated by service)
  program?: { id: string; program_name: string };
  learner?: { id: string; first_name: string; last_name: string };  // Add learner join
}

/** Program-level outcome correlation / effectiveness - MATCHES DATABASE SCHEMA */
export interface OutcomeProgramCorrelation {
  id: string;

  // Core relationships
  program_id: string;
  institution_id: string;

  // Cohort identification
  cohort_year: number;  // INTEGER in DB, not "academic_year" string
  cohort_batch_id: string | null;

  // Graduate counts
  total_graduates: number;
  tracked_graduates: number | null;
  tracking_percentage: number | null;  // Computed column

  // Outcome breakdown (by type)
  employed_count: number | null;
  self_employed_count: number | null;
  entrepreneur_count: number | null;
  higher_studies_count: number | null;
  competitive_exams_count: number | null;
  family_business_count: number | null;
  seeking_count: number | null;
  unknown_count: number | null;

  // Computed rates
  employment_rate: number | null;  // (employed + self_employed) / tracked * 100
  placement_rate: number | null;  // employed through placement cell / tracked * 100
  entrepreneurship_rate: number | null;
  higher_studies_rate: number | null;

  // Salary analytics
  average_salary_range: SalaryRange | null;  // ENUM, not number!
  median_salary_range: SalaryRange | null;  // ENUM, not number!
  salary_distribution: any | null;  // JSONB: { "below_3l": 5, "3l_to_5l": 15, ... }

  // Top performers
  top_employers: any | null;  // JSONB: [{ "company": "TCS", "count": 15, "avg_package": "5l_to_8l" }]
  top_sectors: any | null;  // JSONB: [{ "sector": "IT Services", "count": 45, "percentage": 35.5 }]
  top_roles: any | null;  // JSONB: [{ "role": "Software Engineer", "count": 30 }]
  top_locations: any | null;  // JSONB: [{ "city": "Chennai", "count": 40 }]

  // Higher studies analytics
  top_institutions_for_studies: any | null;  // JSONB
  top_courses_pursued: any | null;  // JSONB
  scholarship_recipients: number | null;

  // Entrepreneurship analytics
  startups_founded: number | null;
  total_funding_raised: string | null;
  jobs_created: number | null;

  // Program relevance
  avg_relevance_percentage: number | null;
  program_satisfaction_avg: number | null;  // 1-10 scale
  would_recommend_percentage: number | null;

  // Time to outcome
  avg_days_to_placement: number | null;  // DB field name (not average_time_to_placement_days)
  placement_before_graduation_count: number | null;

  // Engagement metrics
  alumni_engaged_count: number | null;
  mentors_available: number | null;
  guest_lecturers_available: number | null;
  potential_recruiters: number | null;

  // Comparison metrics
  industry_benchmark_employment_rate: number | null;
  performance_vs_benchmark: string | null;  // 'above', 'at_par', 'below'

  // Computation metadata
  computed_at: string | null;
  computation_notes: string | null;
  is_published: boolean | null;
  published_at: string | null;

  // Audit fields
  created_at: string;
  updated_at: string;

  // Joined fields
  program?: { id: string; program_name: string };
}

// ============================================================================
// DTOs - CREATE / UPDATE
// ============================================================================

export interface CreateAlumniOutcomeInput {
  // Required fields
  learner_id: string;  // NOT NULL in DB
  institution_id: string;  // NOT NULL in DB
  graduation_date: string;  // DATE NOT NULL - CRITICAL
  outcome_type: OutcomeType;

  // Optional relationships
  program_id?: string;
  batch_id?: string;

  // Outcome details
  outcome_start_date?: string;

  // Employment details
  company_name?: string;
  company_website?: string;
  designation?: string;  // Not job_title
  department?: string;
  industry_sector?: string;  // Not industry
  job_function?: string;

  // Location
  city?: string;
  state?: string;
  country?: string;
  is_remote?: boolean;

  // Compensation
  salary_range?: SalaryRange;
  has_equity?: boolean;
  other_benefits?: string;

  // Program relevance
  is_relevant_to_program?: boolean;  // Not is_core_domain
  relevance_percentage?: number;
  skills_used?: string[];  // Not competencies_utilized

  // Higher studies
  institution_name?: string;  // Not higher_study_institution
  course_name?: string;  // Not higher_study_program
  specialization?: string;
  is_scholarship?: boolean;
  scholarship_details?: string;

  // Entrepreneurship
  business_name?: string;  // Not startup_name
  business_type?: string;
  business_sector?: string;  // Not startup_industry
  funding_raised?: string;
  employee_count?: number;

  // Feedback
  satisfaction_score?: number;
  would_recommend_program?: boolean;
  feedback?: string;
  suggestions?: string;
  testimonial?: string;
  testimonial_approved?: boolean;

  // Verification
  verification_status?: VerificationStatus;
  verification_notes?: string;

  // Contact & Engagement
  is_contactable?: boolean;
  preferred_contact_method?: string;
  contact_frequency?: string;
  is_willing_to_mentor?: boolean;
  is_willing_to_hire?: boolean;
  is_willing_to_guest_lecture?: boolean;

  // Tracking
  data_source?: string;
  created_by?: string;
}

export interface UpdateAlumniOutcomeInput {
  id: string;

  // Can update most fields except core IDs
  graduation_date?: string;
  program_id?: string;
  batch_id?: string;
  outcome_type?: OutcomeType;
  outcome_start_date?: string;

  // Employment
  company_name?: string;
  company_website?: string;
  designation?: string;
  department?: string;
  industry_sector?: string;
  job_function?: string;

  // Location
  city?: string;
  state?: string;
  country?: string;
  is_remote?: boolean;

  // Compensation
  salary_range?: SalaryRange;
  has_equity?: boolean;
  other_benefits?: string;

  // Program relevance
  is_relevant_to_program?: boolean;
  relevance_percentage?: number;
  skills_used?: string[];

  // Higher studies
  institution_name?: string;
  course_name?: string;
  specialization?: string;
  is_scholarship?: boolean;
  scholarship_details?: string;

  // Entrepreneurship
  business_name?: string;
  business_type?: string;
  business_sector?: string;
  funding_raised?: string;
  employee_count?: number;

  // Feedback
  satisfaction_score?: number;
  would_recommend_program?: boolean;
  feedback?: string;
  suggestions?: string;
  testimonial?: string;
  testimonial_approved?: boolean;

  // Verification
  verification_status?: VerificationStatus;
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;

  // Contact & Engagement
  is_contactable?: boolean;
  preferred_contact_method?: string;
  contact_frequency?: string;
  is_willing_to_mentor?: boolean;
  is_willing_to_hire?: boolean;
  is_willing_to_guest_lecture?: boolean;
  last_engagement_date?: string;
  engagement_notes?: string;

  // Tracking
  data_source?: string;
}

export interface CreateOutcomeCorrelationInput {
  // Required fields
  institution_id: string;
  program_id: string;
  cohort_year: number;  // INTEGER, not "academic_year" string

  // Optional fields
  cohort_batch_id?: string;
  total_graduates?: number;
  tracked_graduates?: number;

  // Outcome counts
  employed_count?: number;
  self_employed_count?: number;
  entrepreneur_count?: number;
  higher_studies_count?: number;
  competitive_exams_count?: number;
  family_business_count?: number;
  seeking_count?: number;
  unknown_count?: number;

  // Computed rates
  employment_rate?: number;
  placement_rate?: number;
  entrepreneurship_rate?: number;
  higher_studies_rate?: number;

  // Salary analytics
  average_salary_range?: SalaryRange;
  median_salary_range?: SalaryRange;
  salary_distribution?: any;

  // Top performers
  top_employers?: any;
  top_sectors?: any;
  top_roles?: any;
  top_locations?: any;

  // Higher studies
  top_institutions_for_studies?: any;
  top_courses_pursued?: any;
  scholarship_recipients?: number;

  // Entrepreneurship
  startups_founded?: number;
  total_funding_raised?: string;
  jobs_created?: number;

  // Program relevance
  avg_relevance_percentage?: number;
  program_satisfaction_avg?: number;
  would_recommend_percentage?: number;

  // Time to outcome
  avg_days_to_placement?: number;
  placement_before_graduation_count?: number;

  // Engagement
  alumni_engaged_count?: number;
  mentors_available?: number;
  guest_lecturers_available?: number;
  potential_recruiters?: number;

  // Benchmarks
  industry_benchmark_employment_rate?: number;
  performance_vs_benchmark?: string;

  // Metadata
  computation_notes?: string;
  is_published?: boolean;
}

export interface UpdateOutcomeCorrelationInput {
  id: string;

  // Can update most computed fields
  total_graduates?: number;
  tracked_graduates?: number;

  // Outcome counts
  employed_count?: number;
  self_employed_count?: number;
  entrepreneur_count?: number;
  higher_studies_count?: number;
  competitive_exams_count?: number;
  family_business_count?: number;
  seeking_count?: number;
  unknown_count?: number;

  // Computed rates
  employment_rate?: number;
  placement_rate?: number;
  entrepreneurship_rate?: number;
  higher_studies_rate?: number;

  // Salary analytics
  average_salary_range?: SalaryRange;
  median_salary_range?: SalaryRange;
  salary_distribution?: any;

  // Top performers
  top_employers?: any;
  top_sectors?: any;
  top_roles?: any;
  top_locations?: any;

  // Higher studies
  top_institutions_for_studies?: any;
  top_courses_pursued?: any;
  scholarship_recipients?: number;

  // Entrepreneurship
  startups_founded?: number;
  total_funding_raised?: string;
  jobs_created?: number;

  // Program relevance
  avg_relevance_percentage?: number;
  program_satisfaction_avg?: number;
  would_recommend_percentage?: number;

  // Time to outcome
  avg_days_to_placement?: number;
  placement_before_graduation_count?: number;

  // Engagement
  alumni_engaged_count?: number;
  mentors_available?: number;
  guest_lecturers_available?: number;
  potential_recruiters?: number;

  // Benchmarks
  industry_benchmark_employment_rate?: number;
  performance_vs_benchmark?: string;

  // Metadata
  computation_notes?: string;
  is_published?: boolean;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface AlumniOutcomeFilters {
  institution_id?: string;
  search?: string;  // Search across learner name, company_name, designation, industry_sector
  outcome_type?: OutcomeType;
  graduation_year?: number;
  program_id?: string;
  batch_id?: string;
  verification_status?: VerificationStatus;  // Not just boolean verified
  is_relevant_to_program?: boolean;  // Not is_core_domain
  city?: string;
  state?: string;
  country?: string;
  salary_range?: SalaryRange;
  page?: number;
  limit?: number;
  sort_by?: 'graduation_date' | 'graduation_year' | 'created_at' | 'outcome_type' | 'satisfaction_score';
  sort_order?: 'asc' | 'desc';
}

export interface OutcomeCorrelationFilters {
  institution_id?: string;
  program_id?: string;
  cohort_year?: number;  // INTEGER, not "academic_year" string
  cohort_batch_id?: string;
  is_published?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// DASHBOARD / ANALYTICS
// ============================================================================

export interface AlumniDashboardStats {
  total_tracked: number;
  by_outcome_type: Record<OutcomeType, number>;
  employment_percentage: number;  // employed + self_employed
  higher_studies_percentage: number;
  entrepreneur_percentage: number;
  avg_relevance_percentage: number;  // Not core_domain_percentage
  average_satisfaction: number;
  verified_count: number;  // verification_status != 'pending'
  pending_count: number;  // verification_status = 'pending'
  by_salary_range: Record<SalaryRange, number>;
  by_city: Record<string, number>;
  engagement_stats: {
    willing_to_mentor: number;
    willing_to_hire: number;
    willing_to_guest_lecture: number;
  };
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
