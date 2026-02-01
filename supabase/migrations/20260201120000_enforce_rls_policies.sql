-- ============================================================================
-- CRITICAL SECURITY FIX: Enforce RLS Policies on All TQM Tables
-- Migration: 20260201120000_enforce_rls_policies.sql
-- Created: 2026-02-01
-- Purpose: Fix missing and incomplete RLS policies across all TQM modules
-- ============================================================================

-- ============================================================================
-- PART 1: VERIFY RLS IS ENABLED (Re-enable to be safe)
-- ============================================================================

-- NPS Module
ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_analytics ENABLE ROW LEVEL SECURITY;

-- Parent Portal Module
ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_learner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_otp_requests ENABLE ROW LEVEL SECURITY;

-- Grievance Module
ALTER TABLE grievance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_history ENABLE ROW LEVEL SECURITY;

-- Maturity Assessment Module
ALTER TABLE maturity_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_evidence ENABLE ROW LEVEL SECURITY;

-- Billing COPQ Module
ALTER TABLE billing_copq_incidents ENABLE ROW LEVEL SECURITY;

-- Process Excellence Module
ALTER TABLE process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_audits ENABLE ROW LEVEL SECURITY;

-- OKR Key Results (ABCD columns)
ALTER TABLE okr_key_results ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: DROP EXISTING POLICIES TO RECREATE (Prevent Duplicates)
-- ============================================================================

-- NPS Policies
DROP POLICY IF EXISTS "Users can view surveys for their institution" ON nps_surveys;
DROP POLICY IF EXISTS "Staff can create surveys for their institution" ON nps_surveys;
DROP POLICY IF EXISTS "Staff can update surveys for their institution" ON nps_surveys;
DROP POLICY IF EXISTS "Admins can delete surveys for their institution" ON nps_surveys;
DROP POLICY IF EXISTS "Anyone can submit responses to active surveys" ON nps_responses;
DROP POLICY IF EXISTS "Staff can view responses for their institution surveys" ON nps_responses;
DROP POLICY IF EXISTS "Staff can view analytics for their institution" ON nps_analytics;
DROP POLICY IF EXISTS "System can manage analytics" ON nps_analytics;

-- Parent Portal Policies
DROP POLICY IF EXISTS "Parents can view own profile" ON parent_profiles;
DROP POLICY IF EXISTS "Parents can update own profile" ON parent_profiles;
DROP POLICY IF EXISTS "Institution staff can view parent profiles" ON parent_profiles;
DROP POLICY IF EXISTS "Institution staff can manage parent profiles" ON parent_profiles;
DROP POLICY IF EXISTS "Parents can view own learner links" ON parent_learner_links;
DROP POLICY IF EXISTS "Institution staff can manage learner links" ON parent_learner_links;
DROP POLICY IF EXISTS "Parents can view own communications" ON parent_communications;
DROP POLICY IF EXISTS "Parents can update read status" ON parent_communications;
DROP POLICY IF EXISTS "Institution staff can manage communications" ON parent_communications;
DROP POLICY IF EXISTS "Parents can view own activity log" ON parent_activity_log;
DROP POLICY IF EXISTS "Parents can insert own activity" ON parent_activity_log;
DROP POLICY IF EXISTS "Institution staff can view activity logs" ON parent_activity_log;
DROP POLICY IF EXISTS "Service role can manage OTP requests" ON parent_otp_requests;

-- Grievance Policies
DROP POLICY IF EXISTS "grievance_categories_staff_select" ON grievance_categories;
DROP POLICY IF EXISTS "grievance_categories_public_select" ON grievance_categories;
DROP POLICY IF EXISTS "grievance_categories_admin_all" ON grievance_categories;
DROP POLICY IF EXISTS "grievance_tickets_staff_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_own_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_assigned_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_insert" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_staff_update" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_assigned_update" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_raiser_rate" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_comments_staff_select" ON grievance_comments;
DROP POLICY IF EXISTS "grievance_comments_public_select" ON grievance_comments;
DROP POLICY IF EXISTS "grievance_comments_insert" ON grievance_comments;
DROP POLICY IF EXISTS "grievance_history_staff_select" ON grievance_history;
DROP POLICY IF EXISTS "grievance_history_raiser_select" ON grievance_history;
DROP POLICY IF EXISTS "grievance_history_insert" ON grievance_history;

-- Maturity Assessment Policies
DROP POLICY IF EXISTS "Users can view frameworks for their institution" ON maturity_frameworks;
DROP POLICY IF EXISTS "Admins can create frameworks" ON maturity_frameworks;
DROP POLICY IF EXISTS "Admins can update frameworks" ON maturity_frameworks;
DROP POLICY IF EXISTS "Super admins can delete frameworks" ON maturity_frameworks;
DROP POLICY IF EXISTS "Users can view assessments for their institution" ON maturity_assessments;
DROP POLICY IF EXISTS "Staff can create assessments" ON maturity_assessments;
DROP POLICY IF EXISTS "Staff can update assessments" ON maturity_assessments;
DROP POLICY IF EXISTS "Admins can delete assessments" ON maturity_assessments;
DROP POLICY IF EXISTS "Users can view progress items" ON maturity_progress;
DROP POLICY IF EXISTS "Staff can create progress items" ON maturity_progress;
DROP POLICY IF EXISTS "Staff can update progress items" ON maturity_progress;
DROP POLICY IF EXISTS "Admins can delete progress items" ON maturity_progress;
DROP POLICY IF EXISTS "Users can view evidence" ON maturity_evidence;
DROP POLICY IF EXISTS "Staff can add evidence" ON maturity_evidence;
DROP POLICY IF EXISTS "Admins can delete evidence" ON maturity_evidence;

-- Billing COPQ Policies
DROP POLICY IF EXISTS "billing_copq_view_policy" ON billing_copq_incidents;
DROP POLICY IF EXISTS "billing_copq_insert_policy" ON billing_copq_incidents;
DROP POLICY IF EXISTS "billing_copq_update_policy" ON billing_copq_incidents;
DROP POLICY IF EXISTS "billing_copq_delete_policy" ON billing_copq_incidents;

-- Process Excellence Policies
DROP POLICY IF EXISTS "Users can view process definitions for their institutions" ON process_definitions;
DROP POLICY IF EXISTS "Admins can manage process definitions" ON process_definitions;
DROP POLICY IF EXISTS "Users can view process instances for their institutions" ON process_instances;
DROP POLICY IF EXISTS "Users can create process instances for their institutions" ON process_instances;
DROP POLICY IF EXISTS "Users can update process instances for their institutions" ON process_instances;
DROP POLICY IF EXISTS "Users can view waste incidents for their institutions" ON waste_incidents;
DROP POLICY IF EXISTS "Users can report waste incidents for their institutions" ON waste_incidents;
DROP POLICY IF EXISTS "Users can update waste incidents for their institutions" ON waste_incidents;
DROP POLICY IF EXISTS "Users can view audits for their institutions" ON process_audits;
DROP POLICY IF EXISTS "Admins can manage audits" ON process_audits;

-- ============================================================================
-- PART 3: CREATE COMPREHENSIVE RLS POLICIES
-- ============================================================================

-- ============================================================================
-- STAKEHOLDER NPS - RLS POLICIES
-- ============================================================================

-- SELECT: Users can view surveys in their institution
CREATE POLICY "nps_surveys_select"
  ON nps_surveys FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- INSERT: Staff can create surveys
CREATE POLICY "nps_surveys_insert"
  ON nps_surveys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod', 'principal')
        AND (
          up.institution_id = nps_surveys.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = nps_surveys.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- UPDATE: Staff can update surveys
CREATE POLICY "nps_surveys_update"
  ON nps_surveys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod', 'principal')
        AND (
          up.institution_id = nps_surveys.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = nps_surveys.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- DELETE: Only super admins can delete
CREATE POLICY "nps_surveys_delete"
  ON nps_surveys FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- NPS Responses: Anyone can submit
CREATE POLICY "nps_responses_insert"
  ON nps_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nps_surveys
      WHERE id = survey_id
        AND status = 'active'
        AND NOW() BETWEEN start_date AND end_date
    )
  );

-- NPS Responses: Staff can view all
CREATE POLICY "nps_responses_select"
  ON nps_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nps_surveys s
      JOIN public.profiles up ON (
        up.institution_id = s.institution_id
        OR EXISTS (
          SELECT 1 FROM user_institution_access uia
          WHERE uia.user_id = up.id
            AND uia.institution_id = s.institution_id
            AND uia.is_active = true
        )
      )
      WHERE s.id = survey_id
        AND up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod', 'principal')
    )
  );

-- NPS Analytics: Staff can view
CREATE POLICY "nps_analytics_select"
  ON nps_analytics FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- NPS Analytics: System can manage (for triggers)
CREATE POLICY "nps_analytics_all"
  ON nps_analytics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PARENT PORTAL - RLS POLICIES
-- ============================================================================

-- Parents can view and update their own profile
CREATE POLICY "parent_profiles_own_select"
  ON parent_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "parent_profiles_own_update"
  ON parent_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Staff can view all parent profiles in their institution
CREATE POLICY "parent_profiles_staff_select"
  ON parent_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = parent_profiles.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = parent_profiles.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Staff can manage parent profiles (INSERT, UPDATE, DELETE)
CREATE POLICY "parent_profiles_staff_all"
  ON parent_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = parent_profiles.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = parent_profiles.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Parent-Learner Links: Parents view own
CREATE POLICY "parent_learner_links_own_select"
  ON parent_learner_links FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Parent-Learner Links: Staff manage
CREATE POLICY "parent_learner_links_staff_all"
  ON parent_learner_links FOR ALL
  TO authenticated
  USING (
    parent_id IN (
      SELECT pp.id FROM parent_profiles pp
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = pp.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = pp.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Parent Communications: Parents view own
CREATE POLICY "parent_communications_own_select"
  ON parent_communications FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Parent Communications: Parents can update read status
CREATE POLICY "parent_communications_own_update"
  ON parent_communications FOR UPDATE
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Parent Communications: Staff manage
CREATE POLICY "parent_communications_staff_all"
  ON parent_communications FOR ALL
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Parent Activity Log: Parents view and insert own
CREATE POLICY "parent_activity_log_own_select"
  ON parent_activity_log FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "parent_activity_log_own_insert"
  ON parent_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    parent_id IN (
      SELECT id FROM parent_profiles WHERE user_id = auth.uid()
    )
  );

-- Parent Activity Log: Staff view
CREATE POLICY "parent_activity_log_staff_select"
  ON parent_activity_log FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT pp.id FROM parent_profiles pp
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = pp.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = pp.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Parent OTP: Service role only (no user access)
CREATE POLICY "parent_otp_service_only"
  ON parent_otp_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- GRIEVANCE SYSTEM - RLS POLICIES
-- ============================================================================

-- Grievance Categories: Staff can view all
CREATE POLICY "grievance_categories_staff_select"
  ON grievance_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_categories.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_categories.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Grievance Categories: Students/Parents view active only
CREATE POLICY "grievance_categories_public_select"
  ON grievance_categories FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Grievance Categories: Admins manage
CREATE POLICY "grievance_categories_admin_all"
  ON grievance_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin')
        AND (
          up.institution_id = grievance_categories.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_categories.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Grievance Tickets: Multiple select policies
CREATE POLICY "grievance_tickets_staff_select"
  ON grievance_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_tickets.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_tickets.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

CREATE POLICY "grievance_tickets_own_select"
  ON grievance_tickets FOR SELECT
  TO authenticated
  USING (raised_by_id = auth.uid());

CREATE POLICY "grievance_tickets_assigned_select"
  ON grievance_tickets FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

-- Grievance Tickets: Anyone can insert
CREATE POLICY "grievance_tickets_insert"
  ON grievance_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Grievance Tickets: Staff and assigned can update
CREATE POLICY "grievance_tickets_update"
  ON grievance_tickets FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = grievance_tickets.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = grievance_tickets.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Grievance Comments: Staff view all
CREATE POLICY "grievance_comments_staff_select"
  ON grievance_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE gt.id = grievance_comments.ticket_id
        AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
        AND (
          up.institution_id = gt.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = gt.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Grievance Comments: Users view non-internal on their tickets
CREATE POLICY "grievance_comments_public_select"
  ON grievance_comments FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_comments.ticket_id
        AND gt.raised_by_id = auth.uid()
    )
  );

-- Grievance Comments: Insert
CREATE POLICY "grievance_comments_insert"
  ON grievance_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_comments.ticket_id
        AND (
          gt.raised_by_id = auth.uid()
          OR gt.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles up
            WHERE up.id = auth.uid()
              AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
              AND (
                up.institution_id = gt.institution_id
                OR EXISTS (
                  SELECT 1 FROM user_institution_access uia
                  WHERE uia.user_id = up.id
                    AND uia.institution_id = gt.institution_id
                    AND uia.is_active = true
                )
              )
          )
        )
    )
  );

-- Grievance History: View
CREATE POLICY "grievance_history_select"
  ON grievance_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grievance_tickets gt
      WHERE gt.id = grievance_history.ticket_id
        AND (
          gt.raised_by_id = auth.uid()
          OR gt.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles up
            WHERE up.id = auth.uid()
              AND up.role IN ('admin', 'super_admin', 'staff', 'hod', 'principal')
              AND (
                up.institution_id = gt.institution_id
                OR EXISTS (
                  SELECT 1 FROM user_institution_access uia
                  WHERE uia.user_id = up.id
                    AND uia.institution_id = gt.institution_id
                    AND uia.is_active = true
                )
              )
          )
        )
    )
  );

-- Grievance History: Insert (system)
CREATE POLICY "grievance_history_insert"
  ON grievance_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- MATURITY ASSESSMENT - RLS POLICIES
-- ============================================================================

-- Maturity Frameworks: Select
CREATE POLICY "maturity_frameworks_select"
  ON maturity_frameworks FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Maturity Frameworks: Admins manage
CREATE POLICY "maturity_frameworks_admin_all"
  ON maturity_frameworks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'principal')
        AND (
          up.institution_id = maturity_frameworks.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = maturity_frameworks.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Maturity Assessments: Select
CREATE POLICY "maturity_assessments_select"
  ON maturity_assessments FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Maturity Assessments: Staff insert
CREATE POLICY "maturity_assessments_insert"
  ON maturity_assessments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = maturity_assessments.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = maturity_assessments.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Maturity Assessments: Staff update
CREATE POLICY "maturity_assessments_update"
  ON maturity_assessments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = maturity_assessments.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = maturity_assessments.institution_id
              AND uia.is_active = true
          )
        )
        AND (
          (assessor_id = auth.uid() AND status = 'draft')
          OR up.role IN ('super_admin', 'admin', 'principal')
        )
    )
  );

-- Maturity Assessments: Admins delete
CREATE POLICY "maturity_assessments_delete"
  ON maturity_assessments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'principal')
        AND (
          up.institution_id = maturity_assessments.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = maturity_assessments.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Maturity Progress: Select
CREATE POLICY "maturity_progress_select"
  ON maturity_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      WHERE ma.id = maturity_progress.assessment_id
        AND (
          ma.institution_id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
          )
          OR ma.institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
          )
        )
    )
  );

-- Maturity Progress: Staff insert and update
CREATE POLICY "maturity_progress_insert"
  ON maturity_progress FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE ma.id = maturity_progress.assessment_id
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = ma.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = ma.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

CREATE POLICY "maturity_progress_update"
  ON maturity_progress FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE ma.id = maturity_progress.assessment_id
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = ma.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = ma.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Maturity Progress: Admins delete
CREATE POLICY "maturity_progress_delete"
  ON maturity_progress FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE ma.id = maturity_progress.assessment_id
        AND up.role IN ('super_admin', 'admin', 'principal')
        AND (
          up.institution_id = ma.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = ma.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- Maturity Evidence: Similar to progress
CREATE POLICY "maturity_evidence_select"
  ON maturity_evidence FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      WHERE ma.id = maturity_evidence.assessment_id
        AND (
          ma.institution_id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
          )
          OR ma.institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
          )
        )
    )
  );

CREATE POLICY "maturity_evidence_insert"
  ON maturity_evidence FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE ma.id = maturity_evidence.assessment_id
        AND up.role NOT IN ('student', 'parent')
        AND (
          up.institution_id = ma.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = ma.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

CREATE POLICY "maturity_evidence_delete"
  ON maturity_evidence FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN public.profiles up ON up.id = auth.uid()
      WHERE ma.id = maturity_evidence.assessment_id
        AND up.role IN ('super_admin', 'admin', 'principal')
        AND (
          up.institution_id = ma.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = ma.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- ============================================================================
-- BILLING COPQ - RLS POLICIES
-- ============================================================================

CREATE POLICY "billing_copq_select"
  ON billing_copq_incidents FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "billing_copq_insert"
  ON billing_copq_incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "billing_copq_update"
  ON billing_copq_incidents FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "billing_copq_delete"
  ON billing_copq_incidents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('super_admin', 'admin')
        AND (
          up.institution_id = billing_copq_incidents.institution_id
          OR EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = up.id
              AND uia.institution_id = billing_copq_incidents.institution_id
              AND uia.is_active = true
          )
        )
    )
  );

-- ============================================================================
-- PROCESS EXCELLENCE - RLS POLICIES
-- ============================================================================

-- Process Definitions: Select
CREATE POLICY "process_definitions_select"
  ON process_definitions FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Process Definitions: Admins manage
CREATE POLICY "process_definitions_admin_all"
  ON process_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN public.profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = process_definitions.institution_id
        AND uia.is_active = true
        AND up.role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- Process Instances: Select
CREATE POLICY "process_instances_select"
  ON process_instances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

-- Process Instances: Insert and Update
CREATE POLICY "process_instances_insert"
  ON process_instances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

CREATE POLICY "process_instances_update"
  ON process_instances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM process_definitions pd
      JOIN user_institution_access uia ON uia.institution_id = pd.institution_id
      WHERE pd.id = process_instances.process_id
        AND uia.user_id = auth.uid()
        AND uia.is_active = true
    )
  );

-- Waste Incidents: Select
CREATE POLICY "waste_incidents_select"
  ON waste_incidents FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Waste Incidents: Insert and Update
CREATE POLICY "waste_incidents_insert"
  ON waste_incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "waste_incidents_update"
  ON waste_incidents FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Process Audits: Select
CREATE POLICY "process_audits_select"
  ON process_audits FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Process Audits: Admins manage
CREATE POLICY "process_audits_admin_all"
  ON process_audits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN public.profiles up ON up.id = uia.user_id
      WHERE uia.user_id = auth.uid()
        AND uia.institution_id = process_audits.institution_id
        AND uia.is_active = true
        AND up.role IN ('super_admin', 'admin', 'institution_admin')
    )
  );

-- ============================================================================
-- PART 4: GRANT PERMISSIONS
-- ============================================================================

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================================
-- PART 5: VERIFICATION QUERIES
-- ============================================================================

-- To verify RLS is enabled, run:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%nps%' OR tablename LIKE '%parent%' OR tablename LIKE '%grievance%' OR tablename LIKE '%maturity%' OR tablename LIKE '%copq%' OR tablename LIKE '%process%';

-- To verify policies exist, run:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE nps_surveys IS 'SECURITY: RLS enforced - users can only access their institution data';
COMMENT ON TABLE parent_profiles IS 'SECURITY: RLS enforced - parents see own data, staff see institution data';
COMMENT ON TABLE grievance_tickets IS 'SECURITY: RLS enforced - users see own tickets, staff see all institution tickets';
COMMENT ON TABLE maturity_assessments IS 'SECURITY: RLS enforced - institution-scoped access';
COMMENT ON TABLE billing_copq_incidents IS 'SECURITY: RLS enforced - institution-scoped access';
COMMENT ON TABLE process_definitions IS 'SECURITY: RLS enforced - institution-scoped access';

-- End of migration
