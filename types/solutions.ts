// Solutions Hub Types
// Migrated from JKKN-Solutions-Hub

// ============================================
// ENUMS / CONSTANTS
// ============================================

export type SolutionType = 'software' | 'training' | 'content'

export type SolutionStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'in_amc'

export type PartnerStatus = 'standard' | 'yi' | 'alumni' | 'mou' | 'referral'

export type SourceType = 'placement' | 'alumni' | 'clinical' | 'referral' | 'direct' | 'yi' | 'intent'

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
  | 'cancelled'

export type MouStatus = 'draft' | 'sent' | 'signed' | 'active' | 'expired' | 'renewed'

export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type TrainingProgramType = 'workshop' | 'seminar' | 'bootcamp' | 'certification' | 'transformation'

export type TrainingTrack = 'track_a' | 'track_b'

export type LocationPreference = 'client_site' | 'jkkn_campus' | 'online' | 'hybrid'

export type CohortMemberLevel = 0 | 1 | 2 | 3

export type CohortRole = 'observer' | 'support' | 'co_lead' | 'lead'

export type ContentOrderType = 'video' | 'social_media' | 'presentation' | 'writing' | 'branding' | 'podcast' | 'package'

export type ContentDivision = 'video' | 'graphics' | 'content' | 'education' | 'translation' | 'research'

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export type DeliverableStatus = 'pending' | 'in_progress' | 'review' | 'revision' | 'approved' | 'rejected'

export type PaymentStatus = 'pending' | 'invoiced' | 'received' | 'overdue' | 'failed'

export type PaymentType = 'advance' | 'milestone' | 'completion' | 'mou_signing' | 'deployment' | 'acceptance' | 'amc'

export type EarningsStatus = 'calculated' | 'approved' | 'paid'

export type RecipientType =
  | 'builder'
  | 'cohort_member'
  | 'production_learner'
  | 'department'
  | 'jicate'
  | 'institution'
  | 'council'
  | 'infrastructure'
  | 'referral_bonus'

export type CommunicationType = 'call' | 'email' | 'whatsapp' | 'meeting' | 'note'

export type CommunicationDirection = 'inbound' | 'outbound'

export type PaperType = 'problem' | 'design' | 'technical' | 'data' | 'impact'

export type JournalType = 'scopus' | 'ugc_care' | 'other'

export type PublicationStatus =
  | 'identified'
  | 'drafting'
  | 'submitted'
  | 'under_review'
  | 'revision'
  | 'accepted'
  | 'published'
  | 'rejected'

export type SplitType = 'software' | 'training_track_a' | 'training_track_b' | 'content'

// ============================================
// BASE TYPES
// ============================================

export interface SHDepartment {
  id: string
  name: string
  code: string
  hod_id: string | null
  created_at: string
  updated_at: string
}

export interface SHClient {
  id: string
  name: string
  industry_sector: string | null
  contact_person: string
  contact_phone: string
  contact_email: string | null
  address: string | null
  city: string | null
  state: string | null
  company_size: string | null
  source_type: SourceType | null
  source_department_id: string | null
  partner_status: PartnerStatus
  referral_count: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SHSolution {
  id: string
  solution_code: string
  solution_type: SolutionType
  title: string
  description: string | null
  client_id: string
  lead_department_id: string | null
  institution_id: string | null
  base_price: number | null
  discount_percentage: number | null
  discount_reason: string | null
  final_price: number | null
  status: SolutionStatus
  start_date: string | null
  target_date: string | null
  completion_date: string | null
  currency: string | null
  priority: number | null
  tags: string[] | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SHSolutionWithClient extends SHSolution {
  client: SHClient | null
  department: SHDepartment | null
}

export interface SHPhase {
  id: string
  solution_id: string
  phase_number: number
  phase_code: string | null
  title: string
  description: string | null
  status: PhaseStatus
  owner_department_id: string | null
  owner_user_id: string | null
  estimated_value: number | null
  actual_value: number | null
  estimated_hours: number | null
  actual_hours: number | null
  start_date: string | null
  due_date: string | null
  completion_date: string | null
  requirements_doc_url: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SHPhaseWithDetails extends SHPhase {
  solution?: SHSolutionWithClient
  assignments?: SHBuilderAssignment[]
  iterations?: SHPhaseIteration[]
}

export interface SHPhaseIteration {
  id: string
  phase_id: string
  version: number
  changes_summary: string | null
  feedback: string | null
  created_at: string
}

export interface SHBuilder {
  id: string
  user_id: string
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  department_id: string | null
  level: number
  availability_status: 'available' | 'busy' | 'unavailable'
  phases_completed: number
  total_earnings: number
  avg_rating: number | null
  active_assignments_count: number
  created_at: string
  updated_at: string
}

export interface SHBuilderWithDetails extends SHBuilder {
  department: SHDepartment | null
  skills: SHBuilderSkill[]
  assignments?: SHBuilderAssignment[]
}

export interface SHBuilderSkill {
  id: string
  builder_id: string
  skill_name: string
  proficiency_level: number | null
  version: number
  created_at: string
}

export interface SHBuilderAssignment {
  id: string
  builder_id: string
  phase_id: string
  role: 'lead' | 'contributor'
  requested_at: string
  approved_at: string | null
  approved_by: string | null
  completed_at: string | null
  earnings: number | null
  rating: number | null
  created_at: string
}

export interface SHBuilderAssignmentWithPhase extends SHBuilderAssignment {
  phase?: SHPhaseWithDetails
}

// Training Types
export interface SHTrainingProgram {
  id: string
  solution_id: string
  program_type: TrainingProgramType
  track: TrainingTrack | null
  topic: string | null
  participant_count: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  location_preference: LocationPreference | null
  venue_details: string | null
  created_at: string
  updated_at: string
}

export interface SHTrainingProgramWithDetails extends SHTrainingProgram {
  solution?: SHSolutionWithClient
  sessions?: SHTrainingSession[]
}

export interface SHTrainingSession {
  id: string
  program_id: string
  session_number: number
  title: string | null
  scheduled_at: string | null
  duration_minutes: number
  location: string | null
  status: SessionStatus
  attendance_count: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SHTrainingSessionWithDetails extends SHTrainingSession {
  program?: SHTrainingProgram
  assignments?: SHTrainingSessionAssignment[]
}

export interface SHTrainingSessionAssignment {
  id: string
  session_id: string
  cohort_member_id: string
  role: CohortRole
  completed_at: string | null
  earnings: number | null
  created_at: string
  cohort_member?: SHCohortMember
}

export interface SHCohortMember {
  id: string
  user_id: string | null
  name: string
  email: string | null
  phone: string | null
  department_id: string | null
  track: TrainingTrack | null
  level: CohortMemberLevel
  status: 'active' | 'inactive'
  sessions_observed: number
  sessions_co_led: number
  sessions_led: number
  total_earnings: number
  created_at: string
  updated_at: string
}

export interface SHCohortMemberWithDetails extends SHCohortMember {
  department: SHDepartment | null
  assignments?: SHTrainingSessionAssignment[]
}

// Content Types
export interface SHContentOrder {
  id: string
  solution_id: string
  order_type: ContentOrderType | null
  division: ContentDivision | null
  quantity: number
  due_date: string | null
  revision_rounds: number
  created_at: string
  updated_at: string
}

export interface SHContentOrderWithSolution extends SHContentOrder {
  solution?: SHSolutionWithClient
  deliverables?: SHContentDeliverable[]
}

export interface SHContentDeliverable {
  id: string
  order_id: string
  title: string
  status: DeliverableStatus
  file_url: string | null
  file_type: string | null
  revision_count: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SHContentDeliverableWithDetails extends SHContentDeliverable {
  order?: SHContentOrder
  assignments?: SHDeliverableAssignment[]
}

export interface SHDeliverableAssignment {
  id: string
  deliverable_id: string
  learner_id: string
  claimed_at: string
  completed_at: string | null
  earnings: number | null
  rating: number | null
  learner?: SHProductionLearner
}

export interface SHProductionLearner {
  id: string
  user_id: string | null
  name: string
  email: string | null
  phone: string | null
  division: ContentDivision | null
  skill_level: SkillLevel
  status: 'active' | 'inactive'
  orders_completed: number
  total_earnings: number
  avg_rating: number | null
  created_at: string
  updated_at: string
}

export interface SHProductionLearnerWithAssignments extends SHProductionLearner {
  assignments?: SHDeliverableAssignment[]
}

// Financial Types
export interface SHPayment {
  id: string
  phase_id: string | null
  program_id: string | null
  order_id: string | null
  amount: number
  payment_type: PaymentType | null
  payment_method: string | null
  reference_number: string | null
  due_date: string | null
  paid_at: string | null
  status: PaymentStatus
  notes: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export interface SHPaymentWithDetails extends SHPayment {
  phase?: SHPhaseWithDetails
  program?: SHTrainingProgramWithDetails
  order?: SHContentOrderWithSolution
}

export interface SHEarningsLedger {
  id: string
  payment_id: string
  recipient_type: RecipientType
  recipient_id: string | null
  recipient_name: string | null
  amount: number
  percentage: number | null
  status: EarningsStatus
  paid_at: string | null
  created_at: string
  updated_at: string
  payment?: SHPaymentWithDetails
}

// Discovery Types
export interface SHDiscoveryVisit {
  id: string
  client_id: string
  department_id: string | null
  solution_id: string | null
  visit_date: string
  visitors: Array<{ name: string; role?: string }>
  observations: string
  pain_points: string[]
  photos_urls: string[]
  next_steps: string | null
  created_at: string
  updated_at: string
}

export interface SHClientCommunication {
  id: string
  client_id: string
  solution_id: string | null
  communication_type: CommunicationType | null
  direction: CommunicationDirection | null
  communication_date: string
  subject: string | null
  summary: string
  participants: Array<{ name: string; role?: string }>
  attachments_urls: string[]
  created_at: string
  updated_at: string
}

// Publication Types
export interface SHPublication {
  id: string
  solution_id: string | null
  title: string
  paper_type: PaperType | null
  journal_type: JournalType | null
  journal_name: string | null
  authors: Array<{ name: string; affiliation?: string }>
  abstract: string | null
  doi: string | null
  status: PublicationStatus
  nirf_category: string | null
  naac_criterion: string | null
  created_at: string
  updated_at: string
}

export interface SHPublicationWithSolution extends SHPublication {
  solution?: SHSolution
}

// Revenue Split Types
export interface CalculatedSplit {
  recipientType: string
  recipientName: string
  amount: number
  percentage: number
}
