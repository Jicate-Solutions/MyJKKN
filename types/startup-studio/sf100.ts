// types/startup-studio/sf100.ts

export type SF100Phase =
  | 'setup'
  | 'problem_solution_fit'
  | 'first_users'
  | 'growth'
  | 'hundred_users'
  | 'graduated'

export type SF100EnrollmentStatus =
  | 'active'
  | 'warning'
  | 'probation'
  | 'removed'
  | 'graduated'
  | 'withdrawn'

export type SF100PaymentStatus =
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'auto_verified'
  | 'refunded'

export type SF100CheckInType = 'weekly' | 'micro'

export type SF100NotificationType =
  | 'weekly_reminder'
  | 'milestone_first_sale'
  | 'milestone_10_users'
  | 'milestone_25_users'
  | 'milestone_50_users'
  | 'milestone_100_users'
  | 'mentor_feedback'
  | 'stall_warning'
  | 'stall_probation'
  | 'stall_removal'
  | 'deadline_warning'
  | 'phase_advance'
  | 'roster_change_approved'
  | 'roster_change_rejected'

export type SF100PricingModel =
  | 'subscription'
  | 'one_time'
  | 'freemium'
  | 'usage_based'
  | 'other'

export type SF100PivotType =
  | 'customer_segment'
  | 'pricing'
  | 'solution'
  | 'channel'
  | 'problem'
  | 'full'

export type SF100RosterAction = 'add' | 'remove'
export type SF100RosterStatus = 'pending' | 'approved' | 'rejected'

export interface SF100Program {
  id: string
  name: string
  description: string | null
  source_event_id: string | null
  institution_id: string
  enrollment_start: string | null
  enrollment_deadline: string | null
  hard_deadline: string
  started_at: string | null
  completed_at: string | null
  status: 'draft' | 'enrollment_open' | 'active' | 'completed' | 'archived'
  paid_user_target: number
  min_transaction_amount: number
  max_internal_user_pct: number
  stall_warning_days: number
  stall_probation_days: number
  stall_removal_days: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface SF100Enrollment {
  id: string
  program_id: string
  registration_id: string
  current_phase: SF100Phase
  phase_entered_at: string
  status: SF100EnrollmentStatus
  status_changed_at: string
  status_reason: string | null
  cumulative_paid_users: number
  active_paid_users: number
  internal_paid_users: number
  total_revenue: number
  problem_domain: string | null
  target_segment: string | null
  pricing_model: SF100PricingModel | null
  last_check_in_at: string | null
  warning_sent_at: string | null
  probation_sent_at: string | null
  seed_paying_users: number
  seed_mrr: number
  seed_active_users: number
  enrolled_at: string
  enrolled_by: string
  removed_at: string | null
  removed_by: string | null
  graduated_at: string | null
  created_at: string
  updated_at: string
  // Joined relations
  registration?: {
    team_name: string
    team_code: string | null
    institution_id: string
    owner_id: string
    institution?: { name: string }
    team_members?: Array<{
      profile_id: string
      full_name: string | null
      email: string
      is_leader: boolean
      status: string
    }>
    submission?: {
      app_name: string | null
      live_app_url: string | null
      paying_users_count: number
      mrr_amount: number
      active_users_count: number
    }
  }
}

export interface SF100CheckIn {
  id: string
  enrollment_id: string
  submitted_by: string
  type: SF100CheckInType
  what_did_you_do: string | null
  blockers: string | null
  next_steps: string | null
  wins: string | null
  micro_update: string | null
  metric_snapshot: Record<string, unknown>
  mentor_feedback: string | null
  mentor_feedback_by: string | null
  mentor_feedback_at: string | null
  submitted_at: string
  created_at: string
  updated_at: string
}

export interface SF100PaidUser {
  id: string
  enrollment_id: string
  user_identifier: string
  user_name: string | null
  is_internal: boolean
  amount: number
  currency: string
  payment_gateway: string | null
  transaction_id: string | null
  transaction_date: string
  is_recurring: boolean
  subscription_id: string | null
  status: SF100PaymentStatus
  proof_url: string | null
  proof_description: string | null
  verified_by: string | null
  verified_at: string | null
  rejection_reason: string | null
  is_active: boolean
  churned_at: string | null
  churn_reason: string | null
  refund_amount: number | null
  refund_date: string | null
  reported_by: string
  created_at: string
  updated_at: string
}

export interface SF100Notification {
  id: string
  enrollment_id: string | null
  recipient_id: string
  type: SF100NotificationType
  title: string
  body: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface SF100PhaseHistory {
  id: string
  enrollment_id: string
  from_phase: SF100Phase | null
  to_phase: SF100Phase
  triggered_by: 'system' | 'admin' | 'auto_advance'
  triggered_by_user: string | null
  evidence: Record<string, unknown>
  notes: string | null
  created_at: string
}

export interface SF100CustomerInterview {
  id: string
  enrollment_id: string
  customer_name: string
  customer_role: string | null
  customer_segment: string | null
  key_quote: string | null
  pain_level: number | null
  willingness_to_pay: boolean | null
  follow_up_needed: boolean
  follow_up_notes: string | null
  interview_date: string
  conducted_by: string
  created_at: string
}

export interface SF100Pivot {
  id: string
  enrollment_id: string
  pivot_type: SF100PivotType
  before_description: string
  after_description: string
  reasoning: string
  evidence: string | null
  pivot_date: string
  logged_by: string
  created_at: string
}

export interface SF100RosterChange {
  id: string
  enrollment_id: string
  action: SF100RosterAction
  profile_id: string | null
  learner_id: string | null
  email: string
  full_name: string | null
  is_original_member: boolean
  status: SF100RosterStatus
  reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  requested_by: string
  created_at: string
}

// --- DTOs ---

export interface CreateProgramDto {
  name: string
  description?: string
  source_event_id?: string
  institution_id: string
  enrollment_start?: string
  enrollment_deadline?: string
  hard_deadline: string
}

export interface UpdateProgramDto {
  name?: string
  description?: string
  status?: 'draft' | 'enrollment_open' | 'active' | 'completed' | 'archived'
  enrollment_start?: string
  enrollment_deadline?: string
  hard_deadline?: string
  paid_user_target?: number
  min_transaction_amount?: number
  max_internal_user_pct?: number
  stall_warning_days?: number
  stall_probation_days?: number
  stall_removal_days?: number
}

export interface CreateCheckInDto {
  type: SF100CheckInType
  what_did_you_do?: string
  blockers?: string
  next_steps?: string
  wins?: string
  micro_update?: string
  metric_snapshot?: Record<string, unknown>
}

export interface CreatePaidUserDto {
  user_identifier: string
  user_name?: string
  is_internal: boolean
  amount: number
  currency?: string
  payment_gateway?: string
  transaction_id?: string
  transaction_date: string
  is_recurring?: boolean
  subscription_id?: string
  proof_url?: string
  proof_description?: string
}

export interface VerifyPaidUserDto {
  status: 'verified' | 'rejected'
  rejection_reason?: string
}

export interface ChurnDto {
  churn_reason?: string
  refund_amount?: number
  refund_date?: string
}

export interface CreateInterviewDto {
  customer_name: string
  customer_role?: string
  customer_segment?: string
  key_quote?: string
  pain_level?: number
  willingness_to_pay?: boolean
  follow_up_needed?: boolean
  follow_up_notes?: string
  interview_date?: string
}

export interface CreatePivotDto {
  pivot_type: SF100PivotType
  before_description: string
  after_description: string
  reasoning: string
  evidence?: string
  pivot_date?: string
}

export interface CreateRosterChangeDto {
  action: SF100RosterAction
  profile_id?: string
  learner_id?: string
  email: string
  full_name?: string
  reason?: string
}

// --- Response types ---

export interface PhaseAdvanceResult {
  advanced: boolean
  from_phase: SF100Phase | null
  to_phase: SF100Phase
  reason: string
}

export interface BulkAdvanceResult {
  total_checked: number
  advanced: number
  details: Array<{
    enrollment_id: string
    team_name: string
    from_phase: SF100Phase
    to_phase: SF100Phase
  }>
}

export interface StallCheckResult {
  total_checked: number
  newly_warned: number
  newly_on_probation: number
  newly_removed: number
  details: Array<{
    enrollment_id: string
    team_name: string
    previous_status: SF100EnrollmentStatus
    new_status: SF100EnrollmentStatus
    days_since_checkin: number
  }>
}

export interface LeaderboardEntry {
  enrollment_id: string
  team_name: string
  institution_name: string
  current_phase: SF100Phase
  cumulative_paid_users: number
  phase_rank: number
}

export interface LeaderboardData {
  phases: Array<{
    phase: SF100Phase
    phase_label: string
    teams: LeaderboardEntry[]
  }>
  total_teams: number
  total_paid_users: number
  total_graduated: number
}

export interface PublicStats {
  total_teams: number
  total_paid_users: number
  total_graduated: number
  avg_days_to_first_sale: number | null
}

export interface GraduationResult {
  enrollment_id: string
  nif_candidate_id: string
  message: string
}
