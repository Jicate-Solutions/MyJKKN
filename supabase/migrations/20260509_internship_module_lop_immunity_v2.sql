-- ============================================================================
-- INTERNSHIP MODULE — LOP Immunity Wiring v2
-- Migration: 20260509_internship_module_lop_immunity_v2.sql
-- Replaces: 20260508_internship_lop_immunity_wiring.sql (deleted — superseded)
-- Purpose:
--   1. INSERT 'on_clinical_posting' row in hr_attendance_status_types
--      → faculty-attendance-service uses this to mark posting-day as LOP-immune
--   2. Performance indexes on health_practice_attendance for internship FKs
-- RISK TIER: 1 — INSERT IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. Re-runnable.
-- Applied to prod: 2026-05-09 (mcp__supabase__apply_migration as 'internship_module_lop_immunity_v2')
-- ============================================================================

INSERT INTO hr_attendance_status_types
  (institution_id, code, label, affects_lop, affects_leave_balance, late_grace_minutes, is_system, is_active)
SELECT NULL, 'on_clinical_posting', 'On Clinical Posting', FALSE, FALSE, 0, TRUE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM hr_attendance_status_types WHERE code = 'on_clinical_posting' AND institution_id IS NULL
);

CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_posting
  ON health_practice_attendance(posting_assignment_id) WHERE posting_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_hospital
  ON health_practice_attendance(hospital_id) WHERE hospital_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_facilitator
  ON health_practice_attendance(facilitator_id) WHERE facilitator_id IS NOT NULL;

DO $$
DECLARE v_row_count INT;
BEGIN
  SELECT COUNT(*) INTO v_row_count FROM hr_attendance_status_types WHERE code = 'on_clinical_posting' AND is_active = true;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'LOP immunity wiring failed: on_clinical_posting row not found.';
  END IF;
  RAISE NOTICE 'LOP immunity wiring verified: on_clinical_posting row present (affects_lop=FALSE).';
END $$;

DO $$
DECLARE v_policy_value TEXT;
BEGIN
  SELECT value #>> '{}' INTO v_policy_value
  FROM platform_policies
  WHERE policy_key = 'internship.policy.attendance_lop_immunity_status_key'
    AND scope_type = 'global' AND is_active = true;
  IF v_policy_value IS DISTINCT FROM 'on_clinical_posting' THEN
    RAISE WARNING 'platform_policies attendance_lop_immunity_status_key is "%" — expected "on_clinical_posting".', COALESCE(v_policy_value, 'NULL');
  ELSE
    RAISE NOTICE 'LOP key confirmed: %.', v_policy_value;
  END IF;
END $$;
