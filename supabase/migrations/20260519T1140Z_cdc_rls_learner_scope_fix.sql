-- ============================================================
-- B3.1 — Fix HIGH-SEV self-referential learner-scope RLS leak
-- ============================================================
-- Discovered by B3 audit (PR #987, audit doc:
-- docs/audit/cdc-rls-coverage-2026-05-19.md).
--
-- The substrate migration `20260518_cdc_substrate_02_domain_tables_rls.sql`
-- shipped 4 policies with a tautological learner-scope predicate:
--
--   EXISTS (SELECT 1 FROM profiles p
--           WHERE p.id = auth.uid()
--             AND p.learner_id = p.learner_id)   -- ALWAYS TRUE
--
-- Effect: any authenticated learner could read every row across all
-- 8 institutions on these 4 tables (and write on 2 of them).
-- Mitigated short-term by zero CDC user_roles assignments in prod,
-- but timed exposure as soon as learner-facing CDC features go live.
--
-- Reference fix already shipped on cdc_placements
-- (`20260518T1530Z_cdc_s3_placements_triggers_rpc.sql`):
--
--   EXISTS (SELECT 1 FROM profiles pr
--           WHERE pr.id = auth.uid()
--             AND pr.learner_id = <table>.learner_id)   -- correct
--
-- All 4 affected tables (cdc_drive_attendance, cdc_drive_willingness,
-- cdc_idp_responses, cdc_training_enrollments) have learner_id as a
-- direct column. No JOIN-through needed.
-- ============================================================

-- ----- cdc_drive_attendance.read -----
DROP POLICY IF EXISTS cdc_drive_attendance_read ON cdc_drive_attendance;
CREATE POLICY cdc_drive_attendance_read ON cdc_drive_attendance
  FOR SELECT
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_drive_attendance.learner_id
    )
  );

-- ----- cdc_drive_willingness.read -----
DROP POLICY IF EXISTS cdc_drive_willingness_read ON cdc_drive_willingness;
CREATE POLICY cdc_drive_willingness_read ON cdc_drive_willingness
  FOR SELECT
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_drive_willingness.learner_id
    )
  );

-- ----- cdc_drive_willingness.write -----
DROP POLICY IF EXISTS cdc_drive_willingness_write ON cdc_drive_willingness;
CREATE POLICY cdc_drive_willingness_write ON cdc_drive_willingness
  FOR ALL
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_drive_willingness.learner_id
    )
  )
  WITH CHECK (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_drive_willingness.learner_id
    )
  );

-- ----- cdc_idp_responses.read -----
DROP POLICY IF EXISTS cdc_idp_responses_read ON cdc_idp_responses;
CREATE POLICY cdc_idp_responses_read ON cdc_idp_responses
  FOR SELECT
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
  );

-- ----- cdc_idp_responses.write -----
DROP POLICY IF EXISTS cdc_idp_responses_write ON cdc_idp_responses;
CREATE POLICY cdc_idp_responses_write ON cdc_idp_responses
  FOR ALL
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
  )
  WITH CHECK (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
  );

-- ----- cdc_training_enrollments.read -----
DROP POLICY IF EXISTS cdc_training_enrollments_read ON cdc_training_enrollments;
CREATE POLICY cdc_training_enrollments_read ON cdc_training_enrollments
  FOR SELECT
  USING (
    is_cdc_staff() OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_training_enrollments.learner_id
    )
  );
