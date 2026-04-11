-- Migration: Solve for 100 Module
-- Description: 9 tables for the Solve for 100 learner-to-founder journey within Startup Studio
-- Tables: sf100_programs, sf100_enrollments, sf100_phase_history, sf100_check_ins,
--         sf100_paid_users, sf100_customer_interviews, sf100_pivots, sf100_notifications,
--         sf100_roster_changes
-- Date: 2026-03-31

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE sf100_phase AS ENUM (
  'setup',
  'problem_solution_fit',
  'first_users',
  'growth',
  'hundred_users',
  'graduated'
);

CREATE TYPE sf100_enrollment_status AS ENUM (
  'active',
  'warning',
  'probation',
  'removed',
  'graduated',
  'withdrawn'
);

CREATE TYPE sf100_check_in_type AS ENUM (
  'weekly',
  'micro'
);

CREATE TYPE sf100_payment_status AS ENUM (
  'pending_verification',
  'verified',
  'rejected',
  'auto_verified',
  'refunded'
);

CREATE TYPE sf100_notification_type AS ENUM (
  'weekly_reminder',
  'milestone_first_sale',
  'milestone_10_users',
  'milestone_25_users',
  'milestone_50_users',
  'milestone_100_users',
  'mentor_feedback',
  'stall_warning',
  'stall_probation',
  'stall_removal',
  'deadline_warning',
  'phase_advance',
  'roster_change_approved',
  'roster_change_rejected'
);

CREATE TYPE sf100_roster_action AS ENUM (
  'add',
  'remove'
);

CREATE TYPE sf100_roster_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- ============================================================================
-- TABLE 1: sf100_programs — Program/Cohort Registry
-- ============================================================================

CREATE TABLE sf100_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- e.g., "Solve for 100 — Batch 1 (Appathon 2026)"
  description TEXT,
  source_event_id UUID REFERENCES ss_events(id) ON DELETE SET NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Dates
  enrollment_start DATE,
  enrollment_deadline DATE,
  hard_deadline DATE NOT NULL,                 -- e.g., 2026-10-30
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Config
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'enrollment_open', 'active', 'completed', 'archived'
  )),
  paid_user_target INTEGER NOT NULL DEFAULT 100,
  min_transaction_amount NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  max_internal_user_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  stall_warning_days INTEGER NOT NULL DEFAULT 14,
  stall_probation_days INTEGER NOT NULL DEFAULT 28,
  stall_removal_days INTEGER NOT NULL DEFAULT 56,

  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_programs_institution ON sf100_programs(institution_id);
CREATE INDEX idx_sf100_programs_status ON sf100_programs(status);
CREATE INDEX idx_sf100_programs_source_event ON sf100_programs(source_event_id);

-- ============================================================================
-- TABLE 2: sf100_enrollments — Team Enrollment
-- ============================================================================

CREATE TABLE sf100_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES sf100_programs(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,

  -- Phase tracking
  current_phase sf100_phase NOT NULL DEFAULT 'setup',
  phase_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status
  status sf100_enrollment_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  status_reason TEXT,

  -- Metrics (denormalized for fast reads)
  cumulative_paid_users INTEGER NOT NULL DEFAULT 0,
  active_paid_users INTEGER NOT NULL DEFAULT 0,
  internal_paid_users INTEGER NOT NULL DEFAULT 0,     -- subset of cumulative that are JKKN
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Value declaration
  problem_domain TEXT,
  target_segment TEXT,
  pricing_model TEXT CHECK (pricing_model IS NULL OR pricing_model IN (
    'subscription', 'one_time', 'freemium', 'usage_based', 'other'
  )),

  -- Stall tracking
  last_check_in_at TIMESTAMPTZ,
  warning_sent_at TIMESTAMPTZ,
  probation_sent_at TIMESTAMPTZ,

  -- Auto-advance seed data (from Appathon)
  seed_paying_users INTEGER DEFAULT 0,
  seed_mrr NUMERIC(12,2) DEFAULT 0,
  seed_active_users INTEGER DEFAULT 0,

  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by UUID NOT NULL REFERENCES profiles(id),
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES profiles(id),
  graduated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(program_id, registration_id)
);

CREATE INDEX idx_sf100_enrollments_program ON sf100_enrollments(program_id);
CREATE INDEX idx_sf100_enrollments_registration ON sf100_enrollments(registration_id);
CREATE INDEX idx_sf100_enrollments_phase ON sf100_enrollments(current_phase);
CREATE INDEX idx_sf100_enrollments_status ON sf100_enrollments(status);
CREATE INDEX idx_sf100_enrollments_stall ON sf100_enrollments(last_check_in_at)
  WHERE status IN ('active', 'warning', 'probation');

-- ============================================================================
-- TABLE 3: sf100_phase_history — Phase Transition Log
-- ============================================================================

CREATE TABLE sf100_phase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  from_phase sf100_phase,
  to_phase sf100_phase NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'system' CHECK (triggered_by IN ('system', 'admin', 'auto_advance')),
  triggered_by_user UUID REFERENCES profiles(id),
  evidence JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_phase_history_enrollment ON sf100_phase_history(enrollment_id);
CREATE INDEX idx_sf100_phase_history_to_phase ON sf100_phase_history(to_phase);

-- ============================================================================
-- TABLE 4: sf100_check_ins — Weekly & Micro Check-ins
-- ============================================================================

CREATE TABLE sf100_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  type sf100_check_in_type NOT NULL DEFAULT 'weekly',

  -- Weekly check-in fields (NULL for micro)
  what_did_you_do TEXT,
  blockers TEXT,
  next_steps TEXT,
  wins TEXT,

  -- Micro check-in field (NULL for weekly)
  micro_update TEXT CHECK (micro_update IS NULL OR length(micro_update) <= 280),

  -- Metric snapshot at time of check-in
  metric_snapshot JSONB DEFAULT '{}',
  -- Expected shape: { cumulative_paid_users, active_paid_users, revenue }

  -- Mentor feedback
  mentor_feedback TEXT,
  mentor_feedback_by UUID REFERENCES profiles(id),
  mentor_feedback_at TIMESTAMPTZ,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_check_ins_enrollment ON sf100_check_ins(enrollment_id);
CREATE INDEX idx_sf100_check_ins_type ON sf100_check_ins(type);
CREATE INDEX idx_sf100_check_ins_submitted_at ON sf100_check_ins(submitted_at);
CREATE INDEX idx_sf100_check_ins_submitted_by ON sf100_check_ins(submitted_by);

-- ============================================================================
-- TABLE 5: sf100_paid_users — Individual Paid User Records
-- ============================================================================

CREATE TABLE sf100_paid_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  -- User identification
  user_identifier TEXT NOT NULL,               -- email, phone, or unique ID
  user_name TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,  -- true if JKKN learner/staff

  -- Transaction details
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_gateway TEXT,                        -- 'razorpay_jicate', 'razorpay_custom', 'upi', 'stripe', 'cash', 'other'
  transaction_id TEXT,
  transaction_date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  subscription_id TEXT,                        -- for recurring: links recurring payments

  -- Verification
  status sf100_payment_status NOT NULL DEFAULT 'pending_verification',
  proof_url TEXT,
  proof_description TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Churn tracking
  is_active BOOLEAN NOT NULL DEFAULT true,     -- false when refunded or churned
  churned_at TIMESTAMPTZ,
  churn_reason TEXT,
  refund_amount NUMERIC(10,2),
  refund_date DATE,

  reported_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_paid_users_enrollment ON sf100_paid_users(enrollment_id);
CREATE INDEX idx_sf100_paid_users_status ON sf100_paid_users(status);
CREATE INDEX idx_sf100_paid_users_active ON sf100_paid_users(enrollment_id, is_active)
  WHERE status IN ('verified', 'auto_verified');
CREATE INDEX idx_sf100_paid_users_verification_queue ON sf100_paid_users(created_at)
  WHERE status = 'pending_verification';

-- ============================================================================
-- TABLE 6: sf100_customer_interviews — Customer Discovery Log (P1)
-- ============================================================================

CREATE TABLE sf100_customer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  customer_name TEXT NOT NULL,
  customer_role TEXT,
  customer_segment TEXT,
  key_quote TEXT,
  pain_level INTEGER CHECK (pain_level BETWEEN 1 AND 10),
  willingness_to_pay BOOLEAN,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  interview_date DATE NOT NULL DEFAULT CURRENT_DATE,

  conducted_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_customer_interviews_enrollment ON sf100_customer_interviews(enrollment_id);

-- ============================================================================
-- TABLE 7: sf100_pivots — Pivot Tracker (P1)
-- ============================================================================

CREATE TABLE sf100_pivots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  pivot_type TEXT NOT NULL CHECK (pivot_type IN (
    'customer_segment', 'pricing', 'solution', 'channel', 'problem', 'full'
  )),
  before_description TEXT NOT NULL,
  after_description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence TEXT,
  pivot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  logged_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_pivots_enrollment ON sf100_pivots(enrollment_id);

-- ============================================================================
-- TABLE 8: sf100_notifications — Notification Log
-- ============================================================================

CREATE TABLE sf100_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  type sf100_notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_notifications_recipient ON sf100_notifications(recipient_id);
CREATE INDEX idx_sf100_notifications_enrollment ON sf100_notifications(enrollment_id);
CREATE INDEX idx_sf100_notifications_unread ON sf100_notifications(recipient_id, read_at)
  WHERE read_at IS NULL;

-- ============================================================================
-- TABLE 9: sf100_roster_changes — Team Roster Change Requests (P1)
-- ============================================================================

CREATE TABLE sf100_roster_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  action sf100_roster_action NOT NULL,

  -- The member being added or removed
  profile_id UUID REFERENCES profiles(id),
  learner_id UUID REFERENCES learners_profiles(id),
  email TEXT NOT NULL,
  full_name TEXT,
  is_original_member BOOLEAN DEFAULT false,    -- Was on the Appathon team

  -- Approval
  status sf100_roster_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  requested_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_roster_changes_enrollment ON sf100_roster_changes(enrollment_id);
CREATE INDEX idx_sf100_roster_changes_pending ON sf100_roster_changes(status)
  WHERE status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE sf100_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_phase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_paid_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_customer_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_pivots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_roster_changes ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- sf100_programs RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read programs
CREATE POLICY "sf100_programs_select_authenticated"
  ON sf100_programs FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only (admin logic enforced in application layer)
CREATE POLICY "sf100_programs_insert_service_role"
  ON sf100_programs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only
CREATE POLICY "sf100_programs_update_service_role"
  ON sf100_programs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_programs_delete_service_role"
  ON sf100_programs FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_enrollments RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read (full transparency for enrolled data)
CREATE POLICY "sf100_enrollments_select_authenticated"
  ON sf100_enrollments FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_enrollments_insert_service_role"
  ON sf100_enrollments FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only
CREATE POLICY "sf100_enrollments_update_service_role"
  ON sf100_enrollments FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only (soft-delete via status, but policy exists for safety)
CREATE POLICY "sf100_enrollments_delete_service_role"
  ON sf100_enrollments FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_phase_history RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read
CREATE POLICY "sf100_phase_history_select_authenticated"
  ON sf100_phase_history FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_phase_history_insert_service_role"
  ON sf100_phase_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (append-only, but policy exists for safety)
CREATE POLICY "sf100_phase_history_update_service_role"
  ON sf100_phase_history FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_phase_history_delete_service_role"
  ON sf100_phase_history FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_check_ins RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read (transparency)
CREATE POLICY "sf100_check_ins_select_authenticated"
  ON sf100_check_ins FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_check_ins_insert_service_role"
  ON sf100_check_ins FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (mentor feedback updates go through application layer)
CREATE POLICY "sf100_check_ins_update_service_role"
  ON sf100_check_ins FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_check_ins_delete_service_role"
  ON sf100_check_ins FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_paid_users RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read
CREATE POLICY "sf100_paid_users_select_authenticated"
  ON sf100_paid_users FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_paid_users_insert_service_role"
  ON sf100_paid_users FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (verification and churn updates go through application layer)
CREATE POLICY "sf100_paid_users_update_service_role"
  ON sf100_paid_users FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_paid_users_delete_service_role"
  ON sf100_paid_users FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_customer_interviews RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read (transparency)
CREATE POLICY "sf100_customer_interviews_select_authenticated"
  ON sf100_customer_interviews FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_customer_interviews_insert_service_role"
  ON sf100_customer_interviews FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only
CREATE POLICY "sf100_customer_interviews_update_service_role"
  ON sf100_customer_interviews FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_customer_interviews_delete_service_role"
  ON sf100_customer_interviews FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_pivots RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read (transparency)
CREATE POLICY "sf100_pivots_select_authenticated"
  ON sf100_pivots FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_pivots_insert_service_role"
  ON sf100_pivots FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (append-only, but policy exists for safety)
CREATE POLICY "sf100_pivots_update_service_role"
  ON sf100_pivots FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_pivots_delete_service_role"
  ON sf100_pivots FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_notifications RLS (EXCEPTION: recipient can only read their own)
-- --------------------------------------------------------

-- SELECT: Recipient can only read their own notifications
CREATE POLICY "sf100_notifications_select_own"
  ON sf100_notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- INSERT: service_role only
CREATE POLICY "sf100_notifications_insert_service_role"
  ON sf100_notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (mark-read goes through application layer)
-- Also allow recipient to mark their own as read
CREATE POLICY "sf100_notifications_update_service_role"
  ON sf100_notifications FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sf100_notifications_update_own_read"
  ON sf100_notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- DELETE: service_role only
CREATE POLICY "sf100_notifications_delete_service_role"
  ON sf100_notifications FOR DELETE
  TO service_role
  USING (true);

-- --------------------------------------------------------
-- sf100_roster_changes RLS
-- --------------------------------------------------------

-- SELECT: Any authenticated user can read
CREATE POLICY "sf100_roster_changes_select_authenticated"
  ON sf100_roster_changes FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: service_role only
CREATE POLICY "sf100_roster_changes_insert_service_role"
  ON sf100_roster_changes FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (approval goes through application layer)
CREATE POLICY "sf100_roster_changes_update_service_role"
  ON sf100_roster_changes FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: service_role only
CREATE POLICY "sf100_roster_changes_delete_service_role"
  ON sf100_roster_changes FOR DELETE
  TO service_role
  USING (true);
