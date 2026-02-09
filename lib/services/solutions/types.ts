// lib/services/solutions/types.ts
// Type definitions for Solutions Hub services

// ============================================
// ENUMS (matching database types)
// ============================================

export type SolutionType = 'software' | 'training' | 'content';

export type SolutionStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'in_amc';

export type PhaseStatus =
  | 'prospecting'
  | 'discovery'
  | 'prd_writing'
  | 'prototype_building'
  | 'client_demo'
  | 'revisions'
  | 'approved'
  | 'deploying'
  | 'training'
  | 'live'
  | 'in_amc'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export type SourceType = 'placement' | 'alumni' | 'clinical' | 'referral' | 'direct' | 'yi' | 'intent';

export type PartnerStatus = 'standard' | 'yi' | 'alumni' | 'mou' | 'referral';

export type PaymentType = 'advance' | 'milestone' | 'completion' | 'amc' | 'mou_signing' | 'deployment' | 'acceptance';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export type RecipientType =
  | 'builder'
  | 'cohort_member'
  | 'production_learner'
  | 'department'
  | 'jicate'
  | 'institution'
  | 'council'
  | 'infrastructure'
  | 'referral_bonus';

export type EarningsStatus = 'calculated' | 'approved' | 'paid';

export type AssignmentStatus = 'requested' | 'approved' | 'active' | 'completed' | 'withdrawn';

export type BuilderRole = 'lead' | 'contributor';

export type CohortTrack = 'track_a' | 'track_b' | 'both';

export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';

export type ContentDivision = 'video' | 'design' | 'writing' | 'animation' | 'social' | 'other';

export type ContentOrderType = 'video' | 'graphic' | 'document' | 'presentation' | 'animation' | 'social_media' | 'other';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type DeliverableStatus = 'pending' | 'in_progress' | 'review' | 'revision' | 'approved' | 'delivered';

export type ProgramType =
  | 'workshop'
  | 'bootcamp'
  | 'certification'
  | 'custom'
  | 'faculty_development'
  | 'corporate'
  | 'academic';

export type LocationPreference = 'on_site' | 'remote' | 'hybrid';

export type CommunicationType = 'email' | 'call' | 'meeting' | 'whatsapp' | 'other';

export type CommunicationDirection = 'inbound' | 'outbound';

export type PaperType = 'journal' | 'conference' | 'patent' | 'book_chapter' | 'case_study';

export type JournalType = 'scopus' | 'wos' | 'ugc' | 'other';

export type PublicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'published'
  | 'rejected';

export type MouStatus = 'draft' | 'pending_signatures' | 'active' | 'expired' | 'terminated';

export type NotificationType = 'payment' | 'approval' | 'assignment' | 'deadline' | 'system';

// ============================================
// BASE INTERFACES
// ============================================

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at?: string;
}

// ============================================
// CLIENT INTERFACES
// ============================================

export interface Client extends BaseEntity {
  name: string;
  company_code?: string;
  industry_sector?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gst_number?: string;
  pan_number?: string;
  company_size?: string;
  source_type: SourceType;
  source_department_id?: string;
  partner_status: PartnerStatus;
  referral_count: number;
  intent_agency_id?: string;
  logo_url?: string;
  website?: string;
  linkedin_url?: string;
  notes?: string;
  tags?: string[];
  is_active: boolean;
  created_by?: string;
}

export interface ClientReferral extends BaseEntity {
  client_id: string;
  referring_dept_id?: string;
  executing_dept_id?: string;
  referral_type?: string;
  bonus_percentage: number;
  bonus_amount?: number;
  bonus_paid: boolean;
  paid_at?: string;
  notes?: string;
}

// ============================================
// SOLUTION INTERFACES
// ============================================

export interface Solution extends BaseEntity {
  solution_code: string;
  client_id: string;
  solution_type: SolutionType;
  title: string;
  description?: string;
  lead_department_id: string;
  institution_id?: string;
  status: SolutionStatus;
  base_price?: number;
  final_price?: number;
  discount_percentage?: number;
  discount_reason?: string;
  currency?: string;
  start_date?: string;
  target_date?: string;
  completion_date?: string;
  priority?: number;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  // Networker integration fields
  networker_contact_id?: string;
  client_name?: string;
  client_organization?: string;
}

export interface SolutionPhase extends BaseEntity {
  solution_id: string;
  phase_number: number;
  phase_code?: string;
  title: string;
  description?: string;
  status: PhaseStatus;
  owner_department_id?: string;
  owner_user_id?: string;
  estimated_value?: number;
  actual_value?: number;
  estimated_hours?: number;
  actual_hours?: number;
  start_date?: string;
  due_date?: string;
  completion_date?: string;
  requirements_doc_url?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface SolutionMou extends BaseEntity {
  solution_id: string;
  mou_number?: string;
  deal_value: number;
  amc_value?: number;
  amc_duration_months?: number;
  amc_start_date?: string;
  payment_terms?: Record<string, unknown>;
  status: MouStatus;
  mou_document_url?: string;
  signed_date?: string;
  expiry_date?: string;
  signatory_client?: string;
  signatory_jkkn?: string;
  witness_1?: string;
  witness_2?: string;
  terms_and_conditions?: string;
  notes?: string;
  created_by?: string;
}

// ============================================
// BUILDER INTERFACES
// ============================================

export interface Builder extends BaseEntity {
  user_id?: string;
  learner_id?: string;
  staff_id?: string;
  builder_code?: string;
  name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  institution_id?: string;
  trained_date?: string;
  specialization?: string;
  bio?: string;
  portfolio_url?: string;
  github_url?: string;
  linkedin_url?: string;
  hourly_rate?: number;
  total_earnings?: number;
  projects_completed?: number;
  average_rating?: number;
  is_internal?: boolean;
  is_active: boolean;
  availability_status?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface BuilderSkill extends BaseEntity {
  builder_id: string;
  skill_name: string;
  proficiency_level: number;
  assessed_date?: string;
}

export interface BuilderAssignment extends BaseEntity {
  phase_id: string;
  builder_id: string;
  role: BuilderRole;
  status: AssignmentStatus;
  requested_at?: string;
  approved_at?: string;
  approved_by?: string;
  started_at?: string;
  completed_at?: string;
  notes?: string;
}

export interface PrototypeIteration extends BaseEntity {
  phase_id: string;
  version: number;
  prototype_url?: string;
  changes_made?: string;
  feedback?: string;
  client_approved: boolean;
  demo_date?: string;
}

export interface BugReport extends BaseEntity {
  iteration_id: string;
  reported_by?: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'wont_fix';
  resolved_by?: string;
  resolution_notes?: string;
  resolved_at?: string;
  screenshots_urls?: string[];
}

export interface PhaseDeployment extends BaseEntity {
  phase_id: string;
  environment: 'development' | 'staging' | 'production';
  version?: string;
  vercel_url?: string;
  supabase_project_id?: string;
  custom_domain?: string;
  deployed_date?: string;
  deployed_by?: string;
  status: string;
}

export interface ImplementationUser extends BaseEntity {
  phase_id: string;
  user_name: string;
  user_email?: string;
  trained_date?: string;
  usage_status: 'pending' | 'active' | 'inactive';
  notes?: string;
}

// ============================================
// TRAINING INTERFACES
// ============================================

export interface TrainingProgram extends BaseEntity {
  solution_id: string;
  program_code?: string;
  title?: string;
  program_type?: ProgramType;
  track?: string;
  description?: string;
  objectives?: string[];
  prerequisites?: string[];
  participant_count?: number;
  max_participants?: number;
  location_preference?: string;
  venue?: string;
  start_date?: string;
  end_date?: string;
  total_hours?: number;
  total_sessions?: number;
  price_per_participant?: number;
  total_price?: number;
  materials_included?: boolean;
  certification_included?: boolean;
  status?: string;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface TrainingSession extends BaseEntity {
  program_id: string;
  session_number: number;
  title?: string;
  description?: string;
  topics?: string[];
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
  room?: string;
  is_virtual?: boolean;
  meeting_url?: string;
  google_calendar_event_id?: string;
  microsoft_calendar_event_id?: string;
  status: SessionStatus;
  attendance_count?: number;
  max_attendance?: number;
  materials_url?: string;
  recording_url?: string;
  feedback_form_url?: string;
  notes?: string;
}

export interface CohortMember extends BaseEntity {
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  level: number;
  track?: CohortTrack;
  sessions_observed: number;
  sessions_co_led: number;
  sessions_led: number;
  total_earnings: number;
  status: string;
}

export interface CohortAssignment extends BaseEntity {
  session_id: string;
  cohort_member_id: string;
  role: 'observer' | 'co_lead' | 'lead' | 'support';
  status?: string;
  earnings?: number;
  hours_worked?: number;
  rating?: number;
  feedback_from_participants?: string;
  self_reflection?: string;
  mentor_feedback?: string;
  areas_of_improvement?: string[];
  requested_at?: string;
  approved_at?: string;
  approved_by?: string;
  completed_at?: string;
}

// ============================================
// CONTENT INTERFACES
// ============================================

export interface ContentOrder extends BaseEntity {
  solution_id: string;
  order_code?: string;
  title?: string;
  order_type?: ContentOrderType;
  division?: ContentDivision;
  description?: string;
  requirements?: string;
  brand_guidelines_url?: string;
  reference_files?: string[];
  quantity: number;
  duration_minutes?: number;
  dimensions?: string;
  format?: string;
  revision_rounds: number;
  revisions_used?: number;
  due_date?: string;
  priority?: number;
  estimated_hours?: number;
  actual_hours?: number;
  price?: number;
  status?: string;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface ContentDeliverable extends BaseEntity {
  order_id: string;
  title: string;
  file_url?: string;
  file_format?: string;
  status: DeliverableStatus;
  revision_count: number;
  approved_by?: string;
  approved_at?: string;
  notes?: string;
}

export interface ProductionLearner extends BaseEntity {
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  division?: ContentDivision;
  skill_level: SkillLevel;
  orders_completed: number;
  total_earnings: number;
  is_active?: boolean;
  availability_status?: string;
  average_rating?: number;
  institution_id?: string;
  department_id?: string;
  learner_id?: string;
  staff_id?: string;
  learner_code?: string;
  bio?: string;
  specializations?: string[];
  software_tools?: string[];
  portfolio_url?: string;
  behance_url?: string;
  dribbble_url?: string;
  tags?: string[];
  total_deliverables?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductionAssignment extends BaseEntity {
  deliverable_id: string;
  learner_id: string;
  role: 'lead' | 'contributor' | 'reviewer';
  earnings?: number;
  quality_rating?: number;
  timeliness_rating?: number;
  requested_at?: string;
  started_at?: string;
  submitted_at?: string;
  completed_at?: string;
  approved_by?: string;
  approved_at?: string;
  estimated_hours?: number;
  actual_hours?: number;
  feedback?: string;
  notes?: string;
  status?: string;
}

// ============================================
// DISCOVERY & COMMUNICATION INTERFACES
// ============================================

export interface DiscoveryVisit extends BaseEntity {
  client_id: string;
  solution_id?: string;
  department_id?: string;
  visit_code?: string;
  visit_date: string;
  visit_time?: string;
  duration_hours?: number;
  location?: string;
  visit_type?: string;
  visitors?: Record<string, unknown>[];
  client_attendees?: Record<string, unknown>[];
  observations?: string;
  current_systems?: string;
  pain_points?: string;
  opportunities?: string;
  competitor_info?: string;
  budget_indication?: string;
  timeline_indication?: string;
  decision_makers?: string[];
  photos_urls?: string[];
  document_urls?: string[];
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_notes?: string;
  outcome?: string;
  notes?: string;
  created_by?: string;
}

export interface ClientCommunication extends BaseEntity {
  client_id: string;
  solution_id?: string;
  phase_id?: string;
  communication_type: CommunicationType;
  source: 'manual';
  direction?: CommunicationDirection;
  subject?: string;
  summary: string;
  participants?: Array<{ name: string; role?: string }>;
  attachments_urls?: string[];
  communication_date: string;
  recorded_by?: string;
}

// ============================================
// FINANCIAL INTERFACES
// ============================================

export interface RevenueSplitModel extends BaseEntity {
  solution_type: string;
  name: string;
  description?: string;
  split_config: Record<string, number>;
  is_default: boolean;
  effective_from?: string;
  effective_to?: string;
  created_by?: string;
}

export interface Payment extends BaseEntity {
  payment_code?: string;
  solution_id?: string;
  phase_id?: string;
  order_id?: string;
  program_id?: string;
  mou_id?: string;
  client_id?: string;
  amount: number;
  currency?: string;
  payment_type: PaymentType;
  status: PaymentStatus;
  payment_date?: string;
  due_date?: string;
  payment_method?: string;
  reference_number?: string;
  invoice_number?: string;
  invoice_url?: string;
  receipt_url?: string;
  split_model_id?: string;
  split_processed: boolean;
  split_processed_at?: string;
  gst_amount?: number;
  tds_amount?: number;
  net_amount?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface EarningsLedger extends BaseEntity {
  ledger_code?: string;
  payment_id: string;
  recipient_type: RecipientType;
  recipient_id?: string;
  builder_id?: string;
  cohort_member_id?: string;
  production_learner_id?: string;
  department_id?: string;
  institution_id?: string;
  amount: number;
  percentage: number;
  status: EarningsStatus;
  approved_at?: string;
  approved_by?: string;
  processed_at?: string;
  paid_at?: string;
  payment_reference?: string;
  bank_account?: string;
  notes?: string;
}

// ============================================
// PUBLICATION INTERFACES
// ============================================

export interface Publication extends BaseEntity {
  solution_id: string;
  phase_id?: string;
  paper_type?: PaperType;
  title: string;
  authors?: Array<{ name: string; affiliation?: string }>;
  abstract?: string;
  journal_name?: string;
  journal_type?: JournalType;
  status: PublicationStatus;
  submission_date?: string;
  publication_date?: string;
  doi?: string;
  url?: string;
  nirf_category?: string;
  naac_criterion?: string;
  created_by?: string;
}

export interface PublicationContributor extends BaseEntity {
  publication_id: string;
  builder_id?: string;
  cohort_member_id?: string;
  learner_id?: string;
  contribution_type: string;
  credit_type: 'coauthor' | 'acknowledgment';
}

export interface AccreditationMetric extends BaseEntity {
  metric_type: 'nirf' | 'naac';
  metric_code: string;
  metric_name: string;
  max_score?: number;
  calculation_method?: string;
  is_active: boolean;
}

// ============================================
// JICATE & SYSTEM INTERFACES
// ============================================

export interface JicateSession extends BaseEntity {
  solution_id?: string;
  phase_id?: string;
  session_date: string;
  booked_by_dept_id?: string;
  attendees?: string[];
  jicate_facilitator?: string;
  agenda?: string;
  outcome?: 'successful' | 'needs_followup' | 'escalated' | 'cancelled';
  notes?: string;
}

export interface Notification extends BaseEntity {
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
}

export interface AuditLog extends BaseEntity {
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// ============================================
// SERVICE INPUT TYPES
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface CreateClientInput {
  name: string;
  industry?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  company_size?: string;
  source_type?: SourceType;
  source_department_id?: string;
  partner_status?: PartnerStatus;
}

export interface CreateSolutionInput {
  client_id: string;
  solution_type: SolutionType;
  title: string;
  description?: string;
  lead_department_id: string;
  base_price?: number;
  discount_percentage?: number;
  start_date?: string;
  target_date?: string;
  created_by: string;
  // Networker integration fields (optional — solutions can exist without Networker link)
  networker_contact_id?: string;
  client_name?: string;
  client_organization?: string;
}

export interface CreatePhaseInput {
  solution_id: string;
  phase_number?: number;
  title: string;
  description?: string;
  owner_department_id: string;
  estimated_value?: number;
  start_date?: string;
  due_date?: string;
}

export interface CreateBuilderInput {
  name: string;
  email?: string;
  phone?: string;
  user_id?: string;
  department_id?: string;
  trained_date?: string;
  hourly_rate?: number;
  specialization?: string;
  availability_status?: string;
  bio?: string;
}

export interface CreateMouInput {
  solution_id: string;
  deal_value: number;
  amc_value?: number;
  amc_duration_months?: number;
  amc_start_date?: string;
  payment_terms?: Record<string, unknown>;
  signed_date?: string;
  expiry_date?: string;
  signatory_client?: string;
  signatory_jkkn?: string;
  witness_1?: string;
  witness_2?: string;
  terms_and_conditions?: string;
  notes?: string;
  mou_document_url?: string;
  created_by?: string;
}

export interface UpdateMouInput {
  deal_value?: number;
  amc_value?: number;
  amc_duration_months?: number;
  amc_start_date?: string;
  payment_terms?: Record<string, unknown>;
  status?: MouStatus;
  signed_date?: string;
  expiry_date?: string;
  signatory_client?: string;
  signatory_jkkn?: string;
  witness_1?: string;
  witness_2?: string;
  terms_and_conditions?: string;
  notes?: string;
  mou_document_url?: string;
}

export interface CreatePaymentInput {
  solution_id?: string;
  phase_id?: string;
  program_id?: string;
  order_id?: string;
  client_id?: string;
  amount: number;
  payment_type: PaymentType;
  payment_method?: string;
  reference_number?: string;
  due_date?: string;
  payment_date?: string;
  status?: PaymentStatus;
  notes?: string;
  created_by?: string;
}
