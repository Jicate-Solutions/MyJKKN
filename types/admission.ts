// types/admission.ts
// Comprehensive types for the Admission Management module

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
  | 'enrolled'
  | 'lost';

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
  | 'interview_pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'enrolled';

export type InterviewType = 'in_person' | 'video' | 'phone';

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export type PaymentStatus = 'pending' | 'partial' | 'completed' | 'refunded';

export type ScholarshipStatus = 'applied' | 'under_review' | 'approved' | 'rejected' | 'disbursed';

export type LoanStatus = 'inquiry' | 'applied' | 'processing' | 'approved' | 'rejected' | 'disbursed';

export type ReminderStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled';

export type ReminderChannel = 'sms' | 'email' | 'whatsapp' | 'push';

export type WorkflowTriggerType =
  | 'stage_change'
  | 'document_upload'
  | 'application_submit'
  | 'payment_received'
  | 'time_based'
  | 'manual';

export type WorkflowActionType =
  | 'send_sms'
  | 'send_email'
  | 'send_whatsapp'
  | 'assign_counselor'
  | 'update_stage'
  | 'create_task'
  | 'webhook';

export type TemplateType = 'sms' | 'email' | 'whatsapp';

export type FeedbackType = 'application_experience' | 'counselor_feedback' | 'campus_visit' | 'general';

export type DataIssueSeverity = 'critical' | 'warning' | 'low';

export type PhoneValidationStatus = 'valid' | 'invalid' | 'pending' | 'unknown';

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionLead {
  id: string;
  institution_id: string;
  full_name: string;
  email: string | null;
  phone: string;
  // FIX: alternate_phone, date_of_birth, gender, address, city, state,
  // pincode, country do not exist in admission_leads table - removed

  // Academic details
  // FIX: program_interest does not exist in DB → use interested_programs (text array)
  interested_programs: string[] | null;
  preferred_campus: string | null;

  // Source & Attribution
  source: LeadSource;

  // Status & Scoring
  funnel_stage: FunnelStage;
  // DB stores is_hot_lead + is_priority booleans; service layer computes priority
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

  // Assignment
  counselor_id: string | null;
  assigned_at: string | null;
  assigned_counselor_id: string | null;
  ownership_mode: string | null;
  // FIX: last_contacted_at does not exist → correct column is last_contact_at
  last_contact_at: string | null;
  // FIX: next_followup_at does not exist in DB - removed
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

  // Metadata
  learner_profile_id: string | null;
  tags: string[];
  // FIX: is_duplicate and duplicate_of do not exist in DB - removed
  is_active: boolean;
  is_dormant: boolean | null;
  dormant_at: string | null;
  is_lost: boolean | null;
  lost_reason: string | null;
  lost_at: string | null;
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
  // FIX: alternate_phone, date_of_birth, gender, address, city, state, pincode
  // do not exist on admission_leads table - removed
  // FIX: program_interest does not exist → use interested_programs (text array)
  interested_programs?: string[] | null;
  preferred_campus?: string | null;
  source: LeadSource;
  // FIX: source_detail, utm_* columns do not exist on admission_leads - removed
  tags?: string[];
  counselor_id?: string | null;
  preferred_channel?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  id: string;
  funnel_stage?: FunnelStage;
  // FIX: priority enum does not exist → use is_hot_lead + is_priority booleans
  is_hot_lead?: boolean;
  is_priority?: boolean;
  counselor_id?: string | null;
  // FIX: next_followup_at does not exist in DB - removed
  last_contact_at?: string | null;
}

export interface LeadFilters {
  search?: string;
  institution_id?: string;
  funnel_stage?: FunnelStage | FunnelStage[];
  // FIX: priority enum does not exist in DB, but kept as filter concept
  // Service layer maps this to is_hot_lead/is_priority booleans
  priority?: LeadPriority | LeadPriority[];
  source?: LeadSource | LeadSource[];
  counselor_id?: string;
  // FIX: program_interest does not exist → use interested_programs
  interested_programs?: string;
  date_from?: string;
  date_to?: string;
  // FIX: is_duplicate does not exist in DB - removed
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
// LEAD SCORING
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringCriteria {
  id: string;
  name: string;
  category: 'engagement' | 'quality' | 'demographic';
  weight: number;
  conditions: ScoringCondition[];
}

export interface ScoringCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: string | number | string[];
  points: number;
}

export interface ScoringRule {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  criteria: ScoringCriteria[];
  created_at: string;
  updated_at: string;
}

export interface CreateScoringRuleInput {
  institution_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  criteria: ScoringCriteria[];
}

export interface LeadScore {
  lead_id: string;
  total_score: number;
  engagement_score: number;
  quality_score: number;
  demographic_score: number;
  breakdown: {
    criteria_id: string;
    criteria_name: string;
    points_earned: number;
    max_points: number;
  }[];
  calculated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNSELORS & ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface Counselor {
  id: string;
  user_id: string;
  institution_id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  max_leads: number;
  current_leads: number;
  specializations: string[];
  created_at: string;
  updated_at: string;

  // Performance metrics (optional)
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

export interface CounselorAssignment {
  id: string;
  lead_id: string;
  counselor_id: string;
  assigned_at: string;
  assigned_by: string | null;
  reason: string | null;
  is_active: boolean;
}

export interface AssignCounselorInput {
  lead_id: string;
  counselor_id: string;
  reason?: string;
}

export interface BulkAssignInput {
  lead_ids: string[];
  counselor_id: string;
  reason?: string;
}

export interface AssignmentRule {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  criteria: AssignmentCriteria[];
  action: AssignmentAction;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCriteria {
  field: string;
  operator: 'equals' | 'contains' | 'in' | 'not_in';
  value: string | string[];
}

export interface AssignmentAction {
  type: 'round_robin' | 'load_balanced' | 'specific_counselor';
  counselor_ids?: string[];
}

export interface CreateAssignmentRuleInput {
  institution_id: string;
  name: string;
  description?: string;
  priority: number;
  is_active?: boolean;
  criteria: AssignmentCriteria[];
  action: AssignmentAction;
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
  interviews?: Interview[];

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

export interface ApplicationFilters {
  search?: string;
  institution_id?: string;
  status?: ApplicationStatus | ApplicationStatus[];
  program_id?: string;
  batch_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
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

export interface UploadDocumentInput {
  application_id: string;
  document_type: DocumentType;
  file: File;
}

export interface VerifyDocumentInput {
  document_id: string;
  status: 'approved' | 'rejected' | 'reupload_requested';
  rejection_reason?: string;
}

export interface DocumentVerification {
  id: string;
  document_id: string;
  action: 'approved' | 'rejected' | 'reupload_requested';
  reason: string | null;
  verified_by: string;
  verified_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERVIEWS
// ═══════════════════════════════════════════════════════════════════════════

export interface Interview {
  id: string;
  application_id: string;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  interviewer_ids: string[];
  status: InterviewStatus;
  notes: string | null;
  result?: InterviewResult;
  created_at: string;
  updated_at: string;
}

export interface ScheduleInterviewInput {
  application_id: string;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes?: number;
  location?: string;
  meeting_link?: string;
  interviewer_ids: string[];
  notes?: string;
}

export interface InterviewResult {
  id: string;
  interview_id: string;
  overall_rating: number;
  communication_score: number | null;
  technical_score: number | null;
  attitude_score: number | null;
  recommendation: 'strongly_recommend' | 'recommend' | 'neutral' | 'not_recommend';
  feedback: string | null;
  recorded_by: string;
  recorded_at: string;
}

export interface RecordInterviewResultInput {
  interview_id: string;
  overall_rating: number;
  communication_score?: number;
  technical_score?: number;
  attitude_score?: number;
  recommendation: 'strongly_recommend' | 'recommend' | 'neutral' | 'not_recommend';
  feedback?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GD-PI (Group Discussion & Personal Interview)
// ═══════════════════════════════════════════════════════════════════════════

export interface GDPISession {
  id: string;
  institution_id: string;
  session_name: string;
  session_date: string;
  venue: string | null;
  gd_topic: string | null;
  max_participants: number;
  panelist_ids: string[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  participants: GDPIParticipant[];
  created_at: string;
  updated_at: string;
}

export interface GDPIParticipant {
  application_id: string;
  application?: AdmissionApplication;
  gd_score: number | null;
  pi_score: number | null;
  overall_score: number | null;
  remarks: string | null;
}

export interface GDPIResult {
  id: string;
  session_id: string;
  application_id: string;
  gd_score: number | null;
  gd_remarks: string | null;
  pi_score: number | null;
  pi_remarks: string | null;
  overall_score: number;
  recommendation: 'select' | 'waitlist' | 'reject';
  recorded_by: string;
  recorded_at: string;
}

export interface RecordGDPIResultInput {
  session_id: string;
  application_id: string;
  gd_score?: number;
  gd_remarks?: string;
  pi_score?: number;
  pi_remarks?: string;
  recommendation: 'select' | 'waitlist' | 'reject';
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENING EXAM
// ═══════════════════════════════════════════════════════════════════════════

export interface ScreeningExam {
  id: string;
  institution_id: string;
  exam_name: string;
  exam_date: string;
  venue: string | null;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface ExamResult {
  id: string;
  exam_id: string;
  application_id: string;
  marks_obtained: number;
  percentage: number;
  rank: number | null;
  is_passed: boolean;
  remarks: string | null;
  created_at: string;
}

export interface RecordExamResultInput {
  exam_id: string;
  application_id: string;
  marks_obtained: number;
  remarks?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MERIT LIST
// ═══════════════════════════════════════════════════════════════════════════

export interface MeritListEntry {
  id: string;
  institution_id: string;
  program_id: string;
  batch_id: string;
  application_id: string;
  rank: number;
  total_score: number;
  category: string | null;
  is_selected: boolean;
  selection_status: 'selected' | 'waitlisted' | 'not_selected';
  created_at: string;
}

export interface MeritCriteria {
  id: string;
  institution_id: string;
  program_id: string;
  name: string;
  criteria: {
    field: string;
    weight: number;
  }[];
  is_active: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// OFFER LETTER & SEAT CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════

export interface OfferLetter {
  id: string;
  application_id: string;
  offer_number: string;
  program_name: string;
  batch_name: string;
  total_fees: number;
  scholarship_amount: number | null;
  discount_amount: number | null;
  net_fees: number;
  token_amount: number;
  token_deadline: string;
  full_payment_deadline: string;
  status: OfferStatus;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferLetterInput {
  application_id: string;
  program_name: string;
  batch_name: string;
  total_fees: number;
  scholarship_amount?: number;
  discount_amount?: number;
  token_amount: number;
  token_deadline: string;
  full_payment_deadline: string;
}

export interface AcceptOfferInput {
  offer_id: string;
}

export interface RejectOfferInput {
  offer_id: string;
  rejection_reason: string;
}

export interface SeatConfirmation {
  id: string;
  application_id: string;
  offer_id: string;
  confirmation_number: string;
  token_payment_status: PaymentStatus;
  token_paid_at: string | null;
  token_transaction_id: string | null;
  full_payment_status: PaymentStatus;
  full_paid_at: string | null;
  enrollment_status: 'pending' | 'confirmed' | 'cancelled';
  enrollment_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfirmSeatInput {
  offer_id: string;
  transaction_id: string;
  payment_amount: number;
  payment_mode: 'online' | 'cash' | 'cheque' | 'dd';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CommunicationTemplate {
  id: string;
  institution_id: string;
  name: string;
  channel: TemplateType;
  subject: string | null;
  content: string;
  variables: TemplateVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  default_value?: string;
}

export interface CreateTemplateInput {
  institution_id: string;
  name: string;
  type: TemplateType;
  subject?: string;
  content: string;
  variables?: TemplateVariable[];
  is_active?: boolean;
}

export interface UpdateTemplateInput extends Partial<CreateTemplateInput> {
  id: string;
}

export interface Reminder {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  delay_hours: number;
  channel: ReminderChannel;
  template_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReminderConfig {
  id: string;
  reminder_id: string;
  lead_id: string;
  scheduled_at: string;
  status: ReminderStatus;
  sent_at: string | null;
  error_message: string | null;
}

export interface CreateReminderInput {
  institution_id: string;
  name: string;
  description?: string;
  trigger_event: string;
  delay_hours: number;
  channel: ReminderChannel;
  template_id: string;
  is_active?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════

export interface Workflow {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: Record<string, unknown>;
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: unknown;
}

export interface WorkflowAction {
  type: WorkflowActionType;
  config: Record<string, unknown>;
  delay_minutes?: number;
}

export interface CreateWorkflowInput {
  institution_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES (Scholarships, Hostels, Loans, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export interface Scholarship {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  type: 'merit' | 'need_based' | 'sports' | 'special';
  amount: number;
  percentage: number | null;
  eligibility_criteria: string | null;
  max_recipients: number | null;
  is_active: boolean;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScholarshipApplication {
  id: string;
  scholarship_id: string;
  application_id: string;
  status: ScholarshipStatus;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_amount: number | null;
  remarks: string | null;
}

export interface ApplyScholarshipInput {
  scholarship_id: string;
  application_id: string;
  supporting_documents?: string[];
}

export interface HostelRequest {
  id: string;
  application_id: string;
  room_type: 'single' | 'double' | 'triple' | 'dormitory';
  preference: 'ac' | 'non_ac' | 'any';
  food_preference: 'veg' | 'non_veg' | 'any';
  special_requirements: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
  created_at: string;
  updated_at: string;
}

export interface HostelAllocation {
  id: string;
  request_id: string;
  hostel_name: string;
  room_number: string;
  bed_number: string | null;
  allocated_at: string;
  valid_from: string;
  valid_to: string;
}

export interface LateralEntry {
  id: string;
  application_id: string;
  current_institution: string;
  current_program: string;
  current_semester: number;
  cgpa: number | null;
  reason_for_transfer: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface LoanApplication {
  id: string;
  application_id: string;
  bank_name: string | null;
  loan_amount: number;
  interest_rate: number | null;
  tenure_months: number | null;
  status: LoanStatus;
  applied_at: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplyLoanInput {
  application_id: string;
  loan_amount: number;
  bank_name?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISHERS & SOURCE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export interface Publisher {
  id: string;
  institution_id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublisherLead {
  id: string;
  publisher_id: string;
  lead_id: string;
  commission_status: 'pending' | 'approved' | 'paid';
  commission_amount: number | null;
  created_at: string;
}

export interface LeadSourceROI {
  source: LeadSource;
  total_leads: number;
  converted_leads: number;
  conversion_rate: number;
  total_cost: number;
  cost_per_lead: number;
  cost_per_conversion: number;
  revenue: number;
  roi: number;
}

export interface SourceMetrics {
  institution_id: string;
  period: string;
  sources: LeadSourceROI[];
  total_leads: number;
  total_conversions: number;
  overall_conversion_rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

export interface Feedback {
  id: string;
  institution_id: string;
  application_id: string | null;
  lead_id: string | null;
  type: FeedbackType;
  rating: number;
  comments: string | null;
  is_anonymous: boolean;
  submitted_at: string;
}

export interface SubmitFeedbackInput {
  institution_id: string;
  application_id?: string;
  lead_id?: string;
  type: FeedbackType;
  rating: number;
  comments?: string;
  is_anonymous?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA QUALITY
// ═══════════════════════════════════════════════════════════════════════════

export interface DataProfilingResult {
  id: string;
  institution_id: string;
  run_at: string;
  total_records: number;
  overall_score: number;
  completeness_score: number;
  accuracy_score: number;
  consistency_score: number;
  validity_score: number;
  uniqueness_score: number;
  field_analysis: FieldAnalysis[];
  issues: DataIssue[];
}

export interface FieldAnalysis {
  field: string;
  completeness: number;
  validity: number;
  issues_count: number;
  status: 'good' | 'warning' | 'critical';
}

export interface DataIssue {
  type: string;
  count: number;
  severity: DataIssueSeverity;
  affected_percentage: number;
  sample_records?: string[];
}

export interface PhoneValidation {
  id: string;
  lead_id: string;
  phone: string;
  status: PhoneValidationStatus;
  issue_type: string | null;
  validated_at: string | null;
  validation_method: 'regex' | 'api' | 'manual';
}

export interface ValidationResult {
  lead_id: string;
  field: string;
  is_valid: boolean;
  issue: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export interface DeduplicationMatch {
  id: string;
  lead_id_1: string;
  lead_id_2: string;
  confidence_score: number;
  matching_fields: string[];
  status: 'pending' | 'merged' | 'ignored';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;

  // Populated leads
  lead_1?: AdmissionLead;
  lead_2?: AdmissionLead;
}

export interface MergeLeadsInput {
  match_id: string;
  primary_lead_id: string;
  fields_to_merge: Record<string, 'lead_1' | 'lead_2'>;
}

export interface MergeAction {
  match_id: string;
  action: 'merge' | 'ignore';
  merged_lead_id?: string;
  performed_by: string;
  performed_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionDashboardStats {
  total_leads: number;
  new_leads_today: number;
  leads_by_stage: Record<FunnelStage, number>;
  leads_by_source: Record<LeadSource, number>;
  conversion_rate: number;
  avg_time_to_convert: number;
  top_programs: { program: string; count: number }[];
  counselor_performance: CounselorPerformance[];
}

export interface AdmissionAnalytics {
  institution_id: string;
  period: {
    start: string;
    end: string;
  };
  funnel: {
    stage: FunnelStage;
    count: number;
    conversion_rate: number;
  }[];
  source_performance: LeadSourceROI[];
  program_demand: { program_id: string; name: string; applications: number }[];
  trends: {
    date: string;
    leads: number;
    applications: number;
    enrollments: number;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INSIGHTS
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

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TYPES (for admission-service.ts compatibility)
// ═══════════════════════════════════════════════════════════════════════════

// Alias for AdmissionApplication (legacy compatibility)
export type Admission = AdmissionApplication;

export interface AdmissionFilters {
  institution_id?: string;
  institution?: string;
  application_status?: ApplicationStatus | ApplicationStatus[];
  status?: string;
  academic_year?: string;
  semester_id?: string;
  program_id?: string;
  course?: string;
  department?: string;
  assigned_to?: string;
  search?: string;
  name?: string;
  entry_type?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface AdmissionListResponse {
  data: Admission[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateAdmissionDto {
  institution_id: string;
  lead_id?: string;
  first_name?: string;
  last_name?: string;
  applicant_name?: string;
  email?: string;
  student_email?: string;
  phone?: string;
  student_mobile?: string;
  program_id?: string;
  semester_id?: string;
  academic_year?: string;
  status?: string;
  application_status?: ApplicationStatus;
  personal_details?: Record<string, any>;
  academic_history?: Record<string, any>;
  created_by?: string;
  [key: string]: any; // Allow additional fields
}

export interface UpdateAdmissionDto {
  applicant_name?: string;
  email?: string;
  phone?: string;
  program_id?: string;
  semester_id?: string;
  academic_year?: string;
  application_status?: ApplicationStatus;
  personal_details?: Record<string, any>;
  academic_history?: Record<string, any>;
  assigned_to?: string;
  remarks?: string;
}

export interface AdmissionAnalyticsFilters {
  institution_id?: string;
  start_date?: string;
  end_date?: string;
  academic_year?: string;
  program_id?: string;
  degree_id?: string;
  department_id?: string;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  [key: string]: any; // Allow additional filter fields
}
