// types/admission-workflow-config.ts
// TypeScript types for institution-specific admission workflow configurations

export interface AdmissionWorkflowConfig {
  id: string;
  institution_id: string;
  config_name: string;
  academic_year: string;

  // Stage configuration
  active_stages: string[];
  stage_configs: Record<string, StageConfig>;

  // Assessment
  has_entrance_exam: boolean;
  entrance_exam_type: string | null;
  has_gd_pi: boolean;
  has_merit_list: boolean;
  merit_criteria: MeritCriteria;

  // Quota
  has_government_quota: boolean;
  government_quota_percentage: number;
  has_management_quota: boolean;
  has_nri_quota: boolean;
  quota_config: Record<string, number>;

  // Documents
  required_documents: string[];

  // Communication
  default_templates: Record<string, string>;

  // SLA
  sla_config: SLAConfig;

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StageConfig {
  enabled?: boolean;
  label?: string;
  required_fields?: string[];
  min_percentage?: number;
  age_verification?: boolean;
  types?: string[];
  required_documents?: string[];
}

export interface MeritCriteria {
  weightage?: Record<string, number>;
  cutoff?: Record<string, number>;
}

export interface SLAConfig {
  first_contact_hours?: number;
  document_verification_hours?: number;
  offer_validity_days?: number;
  token_payment_days?: number;
}

export interface InstitutionSeatConfig {
  id: string;
  institution_id: string;
  academic_year: string;
  program_name: string | null;
  total_seats: number;
  government_quota_seats: number;
  management_quota_seats: number;
  nri_quota_seats: number;
  created_at: string;
  updated_at: string;
}

// Group dashboard types
export interface InstitutionAdmissionSummary {
  institution_id: string;
  institution_name: string;
  total_leads: number;
  applied: number;
  enrolled: number;
  total_seats: number;
  fill_percentage: number;
}

export interface GroupDashboardData {
  institutions: InstitutionAdmissionSummary[];
  totals: {
    total_leads: number;
    total_applied: number;
    total_enrolled: number;
    total_seats: number;
    overall_fill_percentage: number;
  };
}

export interface CrossCampusDuplicate {
  lead_1_id: string;
  institution_1: string;
  institution_1_name: string;
  lead_2_id: string;
  institution_2: string;
  institution_2_name: string;
  full_name: string;
  phone: string;
  confidence: number;
}

// Default stage definitions
export const ALL_ADMISSION_STAGES: { id: string; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'application_started', label: 'Application Started' },
  { id: 'application_submitted', label: 'Application Submitted' },
  { id: 'documents_pending', label: 'Documents Pending' },
  { id: 'documents_verified', label: 'Documents Verified' },
  { id: 'interview_scheduled', label: 'Interview Scheduled' },
  { id: 'interview_completed', label: 'Interview Completed' },
  { id: 'merit_list', label: 'Merit List' },
  { id: 'offer_sent', label: 'Offer Sent' },
  { id: 'offer_accepted', label: 'Offer Accepted' },
  { id: 'token_paid', label: 'Token Paid' },
  { id: 'enrolled', label: 'Enrolled' },
];

export const COMMON_DOCUMENTS = [
  'photo',
  'id_proof',
  'marksheet_10th',
  'marksheet_12th',
  'transfer_certificate',
  'community_certificate',
  'neet_scorecard',
  'birth_certificate',
  'previous_report_card',
  'address_proof',
  'migration_certificate',
  'gap_certificate',
  'income_certificate',
];
