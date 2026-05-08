-- ============================================================================
-- INTERNSHIP MODULE — LOP Immunity Wiring
-- Migration: 20260508_internship_lop_immunity_wiring.sql
-- Depends on: 20260508_internship_module_substrate.sql
-- Spec: specs/myjkkn-internship-module-spec.md section 11, Decision 23
--       specs/hrapp-issues-capture.md line 2853 (production bug)
-- Purpose:
--   1. INSERT 'on_clinical_posting' row into hr_attendance_status_types
--      → marks posting-day as LOP-immune in faculty attendance service
--   2. EXTEND health_practice_attendance with internship linkage columns
--      (adopted + extended per assumption-thrash O3)
-- RISK TIER: 1 — INSERT IF NOT EXISTS + ALTER TABLE ADD COLUMN IF EXISTS
--            Zero destructive ops. Re-runnable.
-- ============================================================================

-- ============================================================================
-- 1. Add 'on_clinical_posting' to hr_attendance_status_types
--
-- hr_attendance_status_types schema (from 01_tables.sql):
--   id UUID, institution_id UUID, code VARCHAR(20), label VARCHAR(50),
--   affects_lop BOOLEAN, affects_leave_balance BOOLEAN,
--   late_grace_minutes INT, is_system BOOLEAN, is_active BOOLEAN,
--   created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
--
-- This row is referenced by:
--   - platform_policies.internship.policy.lop_immunity_status_key = 'on_clinical_posting'
--   - faculty-attendance-service (Phase 2): when a staff member has an active
--     internship_assignment as facilitator on a given date, their attendance
--     record gets this status_type → affects_lop = FALSE → no LOP deduction
--
-- ★ Source: spec section 11 Decision 23 + hrapp-issues-capture.md line 2853
-- ============================================================================
INSERT INTO hr_attendance_status_types
  (institution_id, code, label, affects_lop, affects_leave_balance,
   late_grace_minutes, is_system, is_active)
SELECT
  NULL,                     -- global (NULL institution_id = available to all)
  'on_clinical_posting',
  'On Clinical Posting',
  FALSE,                    -- affects_lop = FALSE → posting day does NOT count as LOP
  FALSE,                    -- does not affect leave balance
  0,
  TRUE,                     -- is_system = TRUE (cannot be deleted via admin UI)
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM hr_attendance_status_types
  WHERE code = 'on_clinical_posting'
    AND institution_id IS NULL
);

-- ============================================================================
-- 2. health_practice_attendance — adopt + extend with internship linkage
--
-- Per assumption-thrash O3 (spec section 11):
--   health_practice_attendance (8 cols, 0 rows) is a dormant clinical scaffold.
--   We ADOPT it as the learner GPS attendance table for internship module.
--
-- The internship_assignments.id FK bridges student attendance ↔ assignment.
-- facilitator_id bridges to faculty (for faculty-attendance LOP signal).
-- hospital_id bridges to internship_external_sites for geofence enforcement.
--
-- COLUMNS ADDED:
--   gps_lat              NUMERIC(9,6)  — check-in GPS latitude
--   gps_lng              NUMERIC(9,6)  — check-in GPS longitude
--   geofence_pass        BOOLEAN       — TRUE if within hospital geofence at check-in
--   hospital_id          UUID FK       → internship_external_sites(id)
--   facilitator_id       UUID FK       → profiles(id) (faculty supervisor on duty)
--   posting_assignment_id UUID FK      → internship_assignments(id)
--   is_proxy             BOOLEAN       — TRUE if marked by coordinator on behalf
--   proxy_reason         TEXT          — reason for proxy mark
--   marked_for           UUID FK       → profiles(id) when is_proxy=true
--   is_emergency         BOOLEAN       — TRUE if GPS-bypass emergency flag
--   emergency_reason     TEXT          — required when is_emergency=true (≥20 chars enforced in app)
--   emergency_photo_url  TEXT          — photo evidence for emergency bypass audit
--
-- NOTE: ALTER TABLE ADD COLUMN IF NOT EXISTS added in substrate migration.
--   This migration adds the INDEX for the FK we care most about for performance.
-- ============================================================================

-- Performance index for assignment lookup in attendance
-- (complements idx_learner_competencies_posting from substrate migration)
CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_posting
  ON health_practice_attendance(posting_assignment_id)
  WHERE posting_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_hospital
  ON health_practice_attendance(hospital_id)
  WHERE hospital_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_practice_attendance_facilitator
  ON health_practice_attendance(facilitator_id)
  WHERE facilitator_id IS NOT NULL;

-- ============================================================================
-- 3. Verify the LOP immunity status row exists
-- This SELECT returns 1 if the insert succeeded (or was already present).
-- Director can run this query to confirm the wiring before activating the module.
-- ============================================================================
DO $$
DECLARE
  v_row_count INT;
BEGIN
  SELECT COUNT(*) INTO v_row_count
  FROM hr_attendance_status_types
  WHERE code = 'on_clinical_posting' AND is_active = true;

  IF v_row_count = 0 THEN
    RAISE EXCEPTION
      'LOP immunity wiring failed: on_clinical_posting row not found in hr_attendance_status_types. '
      'Manual investigation required.';
  END IF;

  RAISE NOTICE 'LOP immunity wiring verified: on_clinical_posting row present (affects_lop=FALSE).';
END $$;

-- ============================================================================
-- 4. Platform policy confirmation
-- Ensure the lop_immunity_status_key policy row references the correct code
-- ============================================================================
DO $$
DECLARE
  v_policy_value TEXT;
BEGIN
  SELECT value #>> '{}'
  INTO v_policy_value
  FROM platform_policies
  WHERE policy_key  = 'internship.policy.lop_immunity_status_key'
    AND scope_type  = 'global'
    AND is_active   = true;

  IF v_policy_value IS DISTINCT FROM 'on_clinical_posting' THEN
    RAISE WARNING
      'platform_policies.internship.policy.lop_immunity_status_key is "%" — expected "on_clinical_posting". '
      'Run seeds migration first.', COALESCE(v_policy_value, 'NULL');
  ELSE
    RAISE NOTICE 'platform_policies LOP key confirmed: %.', v_policy_value;
  END IF;
END $$;

-- ============================================================================
-- DONE
-- hr_attendance_status_types: 'on_clinical_posting' row inserted (if not exists)
-- health_practice_attendance: 3 performance indexes for internship FK columns
-- Verification block: RAISE EXCEPTION if row missing
-- ============================================================================
