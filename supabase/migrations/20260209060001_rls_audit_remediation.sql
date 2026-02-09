-- RLS Audit Remediation Migration
-- Date: 2026-02-09
-- Purpose: Enable RLS on 11 active tables missing it, add policies to 2 tables with RLS but no policies
-- Pattern: Matches existing okr_objectives RLS policy style

-- ============================================
-- PART 1: Enable RLS on active tables
-- ============================================

-- CRITICAL: students table has personal data
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Admission tables
ALTER TABLE admission_counselors ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;

-- OKR tables
ALTER TABLE learner_core_okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_okr_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_tasks ENABLE ROW LEVEL SECURITY;

-- Other tables
ALTER TABLE timetable_slot_continuity ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_application_sequences_by_code ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 2: RLS Policies for institution_id tables
-- ============================================

-- students (CRITICAL - personal data)
CREATE POLICY "Users can view students in their institution"
  ON students FOR SELECT
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Institution users can insert students"
  ON students FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Institution users can update students"
  ON students FOR UPDATE
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY "Admins can delete students"
  ON students FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- admission_counselors
CREATE POLICY "Users can view counselors in their institution"
  ON admission_counselors FOR SELECT
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Institution users can manage counselors"
  ON admission_counselors FOR ALL
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- admissions
CREATE POLICY "Users can view admissions in their institution"
  ON admissions FOR SELECT
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Institution users can manage admissions"
  ON admissions FOR ALL
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- learner_core_okrs
CREATE POLICY "Users can view learner OKRs in their institution"
  ON learner_core_okrs FOR SELECT
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Institution users can manage learner OKRs"
  ON learner_core_okrs FOR ALL
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ============================================
-- PART 3: RLS Policies for user-FK tables
-- ============================================

-- learner_okr_assignments (has learner_id)
CREATE POLICY "Authenticated users can view OKR assignments"
  ON learner_okr_assignments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage OKR assignments"
  ON learner_okr_assignments FOR ALL
  USING (auth.role() = 'authenticated');

-- okr_compliance_logs (has user_id)
CREATE POLICY "Users can view compliance logs"
  ON okr_compliance_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY "Authenticated users can insert compliance logs"
  ON okr_compliance_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- okr_dependencies (has objective_id FK)
CREATE POLICY "Authenticated users can view OKR dependencies"
  ON okr_dependencies FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage OKR dependencies"
  ON okr_dependencies FOR ALL
  USING (auth.role() = 'authenticated');

-- okr_risks (has objective_id, owner_id)
CREATE POLICY "Users can view OKR risks"
  ON okr_risks FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Owners and admins can manage OKR risks"
  ON okr_risks FOR ALL
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- okr_tasks (has objective_id)
CREATE POLICY "Authenticated users can view OKR tasks"
  ON okr_tasks FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage OKR tasks"
  ON okr_tasks FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================
-- PART 4: RLS Policies for system/lookup tables
-- ============================================

-- timetable_slot_continuity (no institution_id - helper table)
CREATE POLICY "Authenticated users can view slot continuity"
  ON timetable_slot_continuity FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage slot continuity"
  ON timetable_slot_continuity FOR ALL
  USING (auth.role() = 'authenticated');

-- learner_application_sequences_by_code (lookup table)
CREATE POLICY "Authenticated users can view application sequences"
  ON learner_application_sequences_by_code FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage application sequences"
  ON learner_application_sequences_by_code FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- ============================================
-- PART 5: Add policies to 2 tables with RLS but NO policies
-- ============================================

-- child_app_permissions (system-level permission definitions)
CREATE POLICY "Authenticated users can view child app permissions"
  ON child_app_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage child app permissions"
  ON child_app_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- user_child_app_permissions (has user_id)
CREATE POLICY "Users can view their own child app permissions"
  ON user_child_app_permissions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY "Admins can manage user child app permissions"
  ON user_child_app_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'administrator')
    )
  );
