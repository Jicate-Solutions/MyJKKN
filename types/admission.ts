// types/admission.ts
// Types for the Admission Management module
// Only includes types actively used by existing features

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & UNION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type LeadSource =
  | 'website'
  | 'walk_in'
  | 'referral'
  | 'social_media'
  | 'newspaper'
  | 'education_fair'
  | 'agent'
  | 'publisher'
  | 'google_ads'
  | 'facebook_ads'
  | 'other';

export type FunnelStage =
  | 'new'
  | 'contacted'
  | 'not_reachable'
  | 'interested'
  | 'follow_up_scheduled'
  | 'engaged'
  | 'qualified'
  | 'application_started'
  | 'application_submitted'
  | 'documents_pending'
  | 'documents_verified'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'offer_sent'
  | 'offer_accepted'
  | 'token_paid'
  | 'applied'
  | 'interviewed'
  | 'offered'
  | 'enrolled'
  | 'confirmed'
  | 'declined'
  | 'withdrew'
  | 'expired'
  | 'lost'
  | 'dormant';

export type LeadPriority = 'hot' | 'warm' | 'cold';

export type Gender = 'male' | 'female' | 'other';

export type DocumentType =
  | 'photo'
  | 'id_proof'
  | 'address_proof'
  | 'marksheet_10th'
  | 'marksheet_12th'
  | 'degree_certificate'
  | 'transfer_certificate'
  | 'migration_certificate'
  | 'income_certificate'
  | 'caste_certificate'
  | 'medical_certificate'
  | 'other';

export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'reupload_requested';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'documents_pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'offer_sent'
  | 'offer_accepted'
  | 'enrolled'
  | 'withdrawn';

export type TemplateType = 'sms' | 'email' | 'whatsapp';

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionLead {
  id: string;
  institution_id: string;
  full_name: string;
  email: string | null;
  phone: string;
  // Personal details
  alternate_phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;

  // Academic details
  interested_programs: string[] | null;
  preferred_campus: string | null;
  academic_year: string | null;

  // Source & Attribution
  source: LeadSource;

  // Status & Scoring
  funnel_stage: FunnelStage;
  is_hot_lead: boolean;
  is_priority: boolean;
  // Virtual/computed field: populated by LeadService.normalizeLead() from is_hot_lead/is_priority
  priority: LeadPriority;
  score: number;
  score_category: string | null;
  score_updated_at: string | null;
  engagement_score: number | null;
  quality_score: number | null;
  combined_score: number | null;
  score_breakdown: Record<string, unknown> | null;
  conversion_probability: number | null;

  // JKKN Tier-1 fields
  student_interest_level: string | null;
  parent_decision_status: string | null;

  // Assignment
  counselor_id: string | null;
  assigned_at: string | null;
  assigned_counselor_id: string | null;
  ownership_mode: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  last_activity_at: string | null;

  // Communication
  preferred_channel: string | null;
  total_messages_sent: number | null;
  messages_this_week: number | null;
  last_message_at: string | null;

  // Parent/Guardian
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  parent_opted_in: boolean | null;

  // Notes
  notes: string | null;

  // Metadata
  learner_profile_id: string | null;
  tags: string[];
  is_active: boolean;
  is_dormant: boolean | null;
  dormant_at: string | null;
  is_lost: boolean | null;
  lost_reason: string | null;
  lost_at: string | null;
  entry_date: string | null;
  stage: string | null;
  stage_changed_at: string | null;
  previous_stage: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Relationships (optional populated)
  counselor?: Counselor;
  application?: AdmissionApplication;
}

export interface CreateLeadInput {
  institution_id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  alternate_phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  district?: string | null;
  pincode?: string | null;
  interested_programs?: string[] | null;
  preferred_campus?: string | null;
  academic_year?: string | null;
  source: LeadSource;
  tags?: string[];
  counselor_id?: string | null;
  preferred_channel?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  entry_date?: string | null;
  notes?: string | null;
  // JKKN Tier-1 fields
  student_interest_level?: string | null;
  parent_decision_status?: string | null;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  id: string;
  funnel_stage?: FunnelStage;
  is_hot_lead?: boolean;
  is_priority?: boolean;
  counselor_id?: string | null;
  next_followup_at?: string | null;
  last_contact_at?: string | null;
  student_interest_level?: string | null;
  parent_decision_status?: string | null;
  academic_year?: string | null;
}

export interface LeadFilters {
  search?: string;
  institution_id?: string;
  funnel_stage?: FunnelStage | FunnelStage[];
  // Service layer maps priority to is_hot_lead/is_priority booleans
  priority?: LeadPriority | LeadPriority[];
  source?: LeadSource | LeadSource[];
  counselor_id?: string;
  interested_programs?: string;
  date_from?: string;
  date_to?: string;
  is_hot_lead?: boolean;
  is_priority?: boolean;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface LeadListResponse {
  data: AdmissionLead[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNSELORS
// ═══════════════════════════════════════════════════════════════════════════

export interface Counselor {
  id: string;
  user_id: string | null;
  institution_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  is_active: boolean | null;
  created_at: string | null;

  // Performance metrics (optional, joined from separate table)
  performance?: CounselorPerformance;
}

export interface CounselorPerformance {
  counselor_id: string;
  period: string;
  total_leads: number;
  contacted_leads: number;
  converted_leads: number;
  conversion_rate: number;
  avg_response_time: number;
  avg_followup_count: number;
  rating: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionApplication {
  id: string;
  institution_id: string;
  lead_id: string;
  application_number: string;
  status: ApplicationStatus;
  program_id: string;
  batch_id: string | null;

  // Personal details (may differ from lead)
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: Gender | null;

  // Address
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;

  // Academic
  previous_qualification: string | null;
  percentage: number | null;
  board: string | null;
  passing_year: number | null;

  // Parent/Guardian
  father_name: string | null;
  mother_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;

  // Fees
  total_fees: number | null;
  paid_amount: number | null;
  discount_amount: number | null;
  scholarship_amount: number | null;

  // Metadata
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Relationships
  lead?: AdmissionLead;
  documents?: ApplicationDocument[];

  // Extended admission fields (from database)
  religion?: string | null;
  community?: string | null;
  first_graduate?: boolean | null;
  entry_type?: string | null;
  application_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  student_email?: string | null;
  student_mobile?: string | null;
  tenth_percentage?: number | null;
  twelfth_percentage?: number | null;
  neet_score?: number | string | null;
  reference_source?: string | null;
  reference_type?: string | null;
  counsellor_id?: string | null;
  [key: string]: any; // Allow additional fields
}

export interface CreateApplicationInput {
  institution_id: string;
  lead_id: string;
  program_id: string;
  batch_id?: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth?: string;
  gender?: Gender;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  father_name?: string;
  mother_name?: string;
  guardian_phone?: string;
}

export interface UpdateApplicationInput extends Partial<CreateApplicationInput> {
  id: string;
  status?: ApplicationStatus;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  status: DocumentStatus;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD ANALYTICS (used by admission-ai-service)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionDashboardAnalytics {
  overview: {
    combinedTotal: number;
    totalAdmissions: number;
    totalStudents: number;
    onboarded: number;
    onboardingRate: number;
    directStudents: number;
    pending: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    enrolled: number;
    conversionRate: number;
    avgProcessingDays: number;
  };
  statusBreakdown: {
    admissionStatuses: { status: string; count: number; percentage: number }[];
    studentStatuses: { status: string; count: number; percentage: number }[];
    totalAdmissions: number;
    totalStudents: number;
  };
  demographics: {
    gender: { label: string; count: number }[];
    religion: { label: string; count: number }[];
    community: { label: string; count: number }[];
    firstGraduate: { label: string; count: number }[];
  };
  academicPerformance: {
    tenthMarksDistribution: { range: string; count: number }[];
    twelfthMarksDistribution: { range: string; count: number }[];
    neetScoreDistribution: { range: string; count: number }[];
    averageMarks: {
      tenth: number;
      twelfth: number;
      neet: number | null;
    };
  };
  institutionDistribution: {
    institutions: { name: string; count: number; percentage: number }[];
    degrees: { name: string; count: number }[];
    departments: { name: string; count: number }[];
    programs: { name: string; count: number }[];
  };
  geographic: {
    states: { state: string; count: number }[];
    districts: { district: string; count: number }[];
  };
  referenceSources: {
    type: string;
    count: number;
    percentage: number;
  }[];
  timeTrends: {
    daily: { date: string; count: number; approved: number; rejected: number }[];
    monthly: { month: string; count: number }[];
    peakPeriods: { period: string; count: number }[];
  };
  metadata: {
    totalRecords: number;
    dateRange: {
      from: string;
      to: string;
    };
    lastUpdated: string;
  };
}

export interface AdmissionAIInsights {
  summary: string;
  generatedAt: string;
  keyFindings: {
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info' | 'success';
  }[];
  recommendations: {
    category: string;
    priority: 'high' | 'medium' | 'low';
    insight: string;
    action: string;
    expectedImpact: string;
    implementationSteps: string[];
  }[];
  predictions: {
    metric: string;
    prediction: string;
    confidence: 'high' | 'medium' | 'low';
    timeline: string;
    reasoning: string;
  }[];
  trends: {
    trend: string;
    direction: 'up' | 'down' | 'stable';
    impact: string;
    significance: 'high' | 'medium' | 'low';
  }[];
  riskAssessment: {
    risk: string;
    severity: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    mitigation: string;
  }[];
  opportunities: {
    opportunity: string;
    potential: 'high' | 'medium' | 'low';
    actionPlan: string;
  }[];
  competitiveInsights: {
    insight: string;
    comparison: string;
    recommendation: string;
  }[];
}
