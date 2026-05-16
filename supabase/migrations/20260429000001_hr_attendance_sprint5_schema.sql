-- =====================================================================
-- HR Sprint 5 — Attendance Schema (Phase 1 of 7)
-- Spec: specs/hrapp-sprint-5-attendance-spec.md
-- Decisions: Section 17a (Round 1.1 — 4.4, 16 locked answers)
-- Date: 2026-04-29
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
--             FUNCTION, DROP TRIGGER IF EXISTS / CREATE TRIGGER, ON CONFLICT)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Forward-compatible additive column on hr_employees for self-RLS.
-- Reality probe (2026-04-29): hr_employees table on prod has NO user_id
-- column — Sprint 1 schema linked employees to learners_profiles via
-- learner_profile_id only. For hr.attendance.view_self / mark_self /
-- regularize_self self-RLS we need a deterministic auth.uid() ↔
-- employee linkage. Add a forward-compatible additive column.
-- hr_employees has 0 rows on prod, so no backfill needed.
-- ---------------------------------------------------------------------
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS hr_employees_user_id_idx
  ON hr_employees(user_id);

-- ---------------------------------------------------------------------
-- 1. Master: hr_attendance_status_types
-- (Round 1.1 reuse-existing-master pattern; Round 1.2 late_grace_minutes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_status_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  code VARCHAR(20) NOT NULL,
  label VARCHAR(50) NOT NULL,
  affects_lop BOOLEAN DEFAULT FALSE,
  affects_leave_balance BOOLEAN DEFAULT FALSE,
  late_grace_minutes INT DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique per (institution, code) — institution_id NULL = system-wide row
CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_status_types_inst_code_uidx
  ON hr_attendance_status_types (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    code
  );

ALTER TABLE hr_attendance_status_types ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Master: hr_regularization_reasons
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_regularization_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  code VARCHAR(30) NOT NULL,
  label VARCHAR(100) NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_regularization_reasons_inst_code_uidx
  ON hr_regularization_reasons (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    code
  );

ALTER TABLE hr_regularization_reasons ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. hr_attendance_records — daily records per employee
-- (Round 1.3 single-record-per-day; Round 3.1+3.2+3 GPS + recompute event)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  hr_organization_id UUID NOT NULL REFERENCES hr_organizations(id),
  institution_id UUID REFERENCES institutions(id),
  work_date DATE NOT NULL,
  status_type_id UUID NOT NULL REFERENCES hr_attendance_status_types(id),
  in_at TIMESTAMPTZ,
  out_at TIMESTAMPTZ,
  source VARCHAR(20) NOT NULL,            -- BIOMETRIC|MANUAL|SELF_MARK|HR_OVERRIDE|CLASS_PROXY|WHATSAPP_CONFIRM
  day_calc VARCHAR(15) DEFAULT 'FULL',    -- FULL|HALF_AM|HALF_PM|HOURLY|NONE
  hours_worked NUMERIC(4, 2),
  gps_lat NUMERIC(9, 6),
  gps_lng NUMERIC(9, 6),
  gps_accuracy_m INT,
  recomputed_from_event_id UUID,
  reconciled_by UUID REFERENCES profiles(id),
  reconciled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT hr_attendance_records_employee_date_uniq UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS hr_attendance_records_emp_date_idx
  ON hr_attendance_records(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS hr_attendance_records_org_date_idx
  ON hr_attendance_records(hr_organization_id, work_date DESC);
CREATE INDEX IF NOT EXISTS hr_attendance_records_inst_date_idx
  ON hr_attendance_records(institution_id, work_date DESC);

ALTER TABLE hr_attendance_records ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. hr_attendance_regularizations — workflow table
-- (Round 2.4 always-HR-review; never auto-approve)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_regularizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  attendance_record_id UUID REFERENCES hr_attendance_records(id),
  for_date DATE NOT NULL,
  reason_code_id UUID REFERENCES hr_regularization_reasons(id),
  reason_text TEXT,
  proposed_status_type_id UUID REFERENCES hr_attendance_status_types(id),
  proposed_in_at TIMESTAMPTZ,
  proposed_out_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',   -- pending|approved|rejected|auto_resolved
  approver_id UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_attendance_regs_emp_date_idx
  ON hr_attendance_regularizations(employee_id, for_date DESC);
CREATE INDEX IF NOT EXISTS hr_attendance_regs_status_idx
  ON hr_attendance_regularizations(status) WHERE status='pending';

ALTER TABLE hr_attendance_regularizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. hr_attendance_exceptions — queue for unresolved
-- (Round 3.1 GPS-flagged out-of-radius records land here)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES hr_employees(id),
  hr_organization_id UUID REFERENCES hr_organizations(id),
  institution_id UUID REFERENCES institutions(id),
  exception_date DATE NOT NULL,
  exception_type VARCHAR(30) NOT NULL,    -- single_punch_day|device_offline|duplicate_punch|mismatched_proxy|unmatched_biometric|gps_out_of_radius
  raw_payload JSONB,
  resolution_status VARCHAR(20) DEFAULT 'open',   -- open|resolved|ignored
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_attendance_excs_emp_date_idx
  ON hr_attendance_exceptions(employee_id, exception_date DESC);
CREATE INDEX IF NOT EXISTS hr_attendance_excs_status_idx
  ON hr_attendance_exceptions(resolution_status) WHERE resolution_status='open';

ALTER TABLE hr_attendance_exceptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 6. hr_attendance_audit_log — parallel to existing student-coupled
-- attendance_audit_log (different FK shape; per Layer 2 finding in
-- spec Section 3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID REFERENCES hr_attendance_records(id),
  employee_id UUID REFERENCES hr_employees(id),
  institution_id UUID REFERENCES institutions(id),
  actor_id UUID REFERENCES profiles(id),
  action VARCHAR(30) NOT NULL,            -- create|update|override|delete|regularize_approve|regularize_reject|recompute
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_attendance_audit_record_idx
  ON hr_attendance_audit_log(attendance_record_id);
CREATE INDEX IF NOT EXISTS hr_attendance_audit_inst_created_idx
  ON hr_attendance_audit_log(institution_id, created_at DESC);

ALTER TABLE hr_attendance_audit_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7. hr_biometric_devices — vendor-agnostic master (Round 2.1)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE hr_biometric_vendor AS ENUM ('eSSL', 'ZKTeco', 'Suprema', 'Anviz', 'Other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hr_biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id UUID REFERENCES hr_organizations(id),
  institution_id UUID REFERENCES institutions(id),
  device_name VARCHAR(100) NOT NULL,
  vendor hr_biometric_vendor NOT NULL,
  device_serial VARCHAR(100),
  device_token VARCHAR(255),              -- shared-secret for webhook auth (Sprint 4)
  location_label VARCHAR(150),
  gps_lat NUMERIC(9, 6),
  gps_lng NUMERIC(9, 6),
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_biometric_devices_org_idx
  ON hr_biometric_devices(hr_organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS hr_biometric_devices_serial_uidx
  ON hr_biometric_devices(device_serial) WHERE device_serial IS NOT NULL;

ALTER TABLE hr_biometric_devices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 8. hr_biometric_punches — append-only with raw_payload
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES hr_biometric_devices(id),
  employee_id UUID REFERENCES hr_employees(id),
  biometric_id VARCHAR(100),              -- raw biometric/employee code from device
  punch_at TIMESTAMPTZ NOT NULL,
  punch_kind VARCHAR(10),                 -- IN|OUT|UNKNOWN
  raw_payload JSONB,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  reconciled_to_record_id UUID REFERENCES hr_attendance_records(id)
);

CREATE INDEX IF NOT EXISTS hr_biometric_punches_emp_punch_idx
  ON hr_biometric_punches(employee_id, punch_at DESC);
CREATE INDEX IF NOT EXISTS hr_biometric_punches_device_punch_idx
  ON hr_biometric_punches(device_id, punch_at DESC);
CREATE INDEX IF NOT EXISTS hr_biometric_punches_ingested_idx
  ON hr_biometric_punches(ingested_at DESC);

ALTER TABLE hr_biometric_punches ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 9. ALTER hr_organizations — geofence + audit retention (Round 3.1+3.4)
-- ---------------------------------------------------------------------
ALTER TABLE hr_organizations
  ADD COLUMN IF NOT EXISTS gps_geofence_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS gps_geofence_lng NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS gps_geofence_radius_m INT,
  ADD COLUMN IF NOT EXISTS audit_retention_years INT DEFAULT 7;

-- =====================================================================
-- 10. RLS POLICIES — canonical pattern
-- =====================================================================

-- ---------- hr_attendance_status_types ----------
DROP POLICY IF EXISTS hr_status_types_select ON hr_attendance_status_types;
CREATE POLICY hr_status_types_select ON hr_attendance_status_types
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR is_system = TRUE
    OR (
      user_has_permission('hr.attendance.view_all')
      AND (institution_id IS NULL OR role_has_institution_access(institution_id))
    )
    OR (
      user_has_permission('hr.attendance.view_self')
      AND (institution_id IS NULL OR role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_status_types_insert ON hr_attendance_status_types;
CREATE POLICY hr_status_types_insert ON hr_attendance_status_types
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_status_types_update ON hr_attendance_status_types;
CREATE POLICY hr_status_types_update ON hr_attendance_status_types
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_status_types_delete ON hr_attendance_status_types;
CREATE POLICY hr_status_types_delete ON hr_attendance_status_types
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND is_system = FALSE)
  );

-- ---------- hr_regularization_reasons ----------
DROP POLICY IF EXISTS hr_reg_reasons_select ON hr_regularization_reasons;
CREATE POLICY hr_reg_reasons_select ON hr_regularization_reasons
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR is_system = TRUE
    OR (
      (user_has_permission('hr.attendance.view_self') OR user_has_permission('hr.attendance.view_all'))
      AND (institution_id IS NULL OR role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_reg_reasons_insert ON hr_regularization_reasons;
CREATE POLICY hr_reg_reasons_insert ON hr_regularization_reasons
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_reg_reasons_update ON hr_regularization_reasons;
CREATE POLICY hr_reg_reasons_update ON hr_regularization_reasons
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_reg_reasons_delete ON hr_regularization_reasons;
CREATE POLICY hr_reg_reasons_delete ON hr_regularization_reasons
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND is_system = FALSE)
  );

-- ---------- hr_attendance_records ----------
DROP POLICY IF EXISTS hr_attendance_records_select ON hr_attendance_records;
CREATE POLICY hr_attendance_records_select ON hr_attendance_records
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.view_all')
      AND role_has_institution_access(institution_id)
    )
    OR (
      user_has_permission('hr.attendance.view_self')
      AND auth.uid() = (SELECT user_id FROM hr_employees WHERE id = employee_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_records_insert ON hr_attendance_records;
CREATE POLICY hr_attendance_records_insert ON hr_attendance_records
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.override')
      AND role_has_institution_access(institution_id)
    )
    OR (
      user_has_permission('hr.attendance.mark_self')
      AND auth.uid() = (SELECT user_id FROM hr_employees WHERE id = employee_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_records_update ON hr_attendance_records;
CREATE POLICY hr_attendance_records_update ON hr_attendance_records
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.override')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_records_delete ON hr_attendance_records;
CREATE POLICY hr_attendance_records_delete ON hr_attendance_records
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND user_has_permission('hr.attendance.override'))
  );

-- ---------- hr_attendance_regularizations ----------
DROP POLICY IF EXISTS hr_attendance_regs_select ON hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_select ON hr_attendance_regularizations
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.view_all')
    OR user_has_permission('hr.attendance.regularize_approve')
    OR user_has_permission('hr.attendance.approve_team')
    OR (
      user_has_permission('hr.attendance.regularize_self')
      AND auth.uid() = (SELECT user_id FROM hr_employees WHERE id = employee_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_regs_insert ON hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_insert ON hr_attendance_regularizations
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.override')
    OR (
      user_has_permission('hr.attendance.regularize_self')
      AND auth.uid() = (SELECT user_id FROM hr_employees WHERE id = employee_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_regs_update ON hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_update ON hr_attendance_regularizations
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.regularize_approve')
    OR user_has_permission('hr.attendance.approve_team')
    OR user_has_permission('hr.attendance.override')
  );

DROP POLICY IF EXISTS hr_attendance_regs_delete ON hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_delete ON hr_attendance_regularizations
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND user_has_permission('hr.attendance.override'))
  );

-- ---------- hr_attendance_exceptions ----------
DROP POLICY IF EXISTS hr_attendance_excs_select ON hr_attendance_exceptions;
CREATE POLICY hr_attendance_excs_select ON hr_attendance_exceptions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.view_all')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_excs_insert ON hr_attendance_exceptions;
CREATE POLICY hr_attendance_excs_insert ON hr_attendance_exceptions
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.override')
  );

DROP POLICY IF EXISTS hr_attendance_excs_update ON hr_attendance_exceptions;
CREATE POLICY hr_attendance_excs_update ON hr_attendance_exceptions
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.override')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS hr_attendance_excs_delete ON hr_attendance_exceptions;
CREATE POLICY hr_attendance_excs_delete ON hr_attendance_exceptions
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND user_has_permission('hr.attendance.override'))
  );

-- ---------- hr_attendance_audit_log ----------
DROP POLICY IF EXISTS hr_attendance_audit_select ON hr_attendance_audit_log;
CREATE POLICY hr_attendance_audit_select ON hr_attendance_audit_log
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      (user_has_permission('hr.attendance.view_all') OR user_has_permission('hr.attendance.audit_export'))
      AND (institution_id IS NULL OR role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS hr_attendance_audit_insert ON hr_attendance_audit_log;
CREATE POLICY hr_attendance_audit_insert ON hr_attendance_audit_log
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.override')
    OR user_has_permission('hr.attendance.mark_self')
    OR user_has_permission('hr.attendance.regularize_approve')
    OR user_has_permission('hr.attendance.approve_team')
  );

-- audit log is append-only — no UPDATE / DELETE policies (super admin only)
DROP POLICY IF EXISTS hr_attendance_audit_delete ON hr_attendance_audit_log;
CREATE POLICY hr_attendance_audit_delete ON hr_attendance_audit_log
  FOR DELETE USING (is_super_admin());

-- ---------- hr_biometric_devices ----------
DROP POLICY IF EXISTS hr_biometric_devices_select ON hr_biometric_devices;
CREATE POLICY hr_biometric_devices_select ON hr_biometric_devices
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.attendance.view_all')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS hr_biometric_devices_insert ON hr_biometric_devices;
CREATE POLICY hr_biometric_devices_insert ON hr_biometric_devices
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_biometric_devices_update ON hr_biometric_devices;
CREATE POLICY hr_biometric_devices_update ON hr_biometric_devices
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.attendance.override') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_biometric_devices_delete ON hr_biometric_devices;
CREATE POLICY hr_biometric_devices_delete ON hr_biometric_devices
  FOR DELETE USING (
    is_super_admin()
    OR (is_admin() AND user_has_permission('hr.attendance.override'))
  );

-- ---------- hr_biometric_punches ----------
DROP POLICY IF EXISTS hr_biometric_punches_select ON hr_biometric_punches;
CREATE POLICY hr_biometric_punches_select ON hr_biometric_punches
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.view_all')
    OR (
      user_has_permission('hr.attendance.view_self')
      AND auth.uid() = (SELECT user_id FROM hr_employees WHERE id = employee_id)
    )
  );

-- punches are written by webhook (service role) and reconciliation cron
DROP POLICY IF EXISTS hr_biometric_punches_insert ON hr_biometric_punches;
CREATE POLICY hr_biometric_punches_insert ON hr_biometric_punches
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.override')
  );

DROP POLICY IF EXISTS hr_biometric_punches_update ON hr_biometric_punches;
CREATE POLICY hr_biometric_punches_update ON hr_biometric_punches
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.attendance.override')
  );

DROP POLICY IF EXISTS hr_biometric_punches_delete ON hr_biometric_punches;
CREATE POLICY hr_biometric_punches_delete ON hr_biometric_punches
  FOR DELETE USING (is_super_admin());

-- =====================================================================
-- 11. SEED DEFAULT MASTER ROWS
-- =====================================================================

-- ---------- hr_attendance_status_types (system rows, institution_id=NULL) ----------
INSERT INTO hr_attendance_status_types (institution_id, code, label, affects_lop, affects_leave_balance, late_grace_minutes, is_system, is_active)
VALUES
  (NULL, 'PRESENT',     'Present',           FALSE, FALSE, 0,  TRUE, TRUE),
  (NULL, 'ABSENT',      'Absent (LOP)',      TRUE,  FALSE, 0,  TRUE, TRUE),
  (NULL, 'HALF_DAY',    'Half Day',          FALSE, FALSE, 0,  TRUE, TRUE),
  (NULL, 'ON_DUTY',     'On Duty',           FALSE, FALSE, 0,  TRUE, TRUE),
  (NULL, 'REGULARIZED', 'Regularized',       FALSE, FALSE, 0,  TRUE, TRUE),
  (NULL, 'HOLIDAY',     'Holiday',           FALSE, FALSE, 0,  TRUE, TRUE),
  (NULL, 'LEAVE',       'Leave',             FALSE, TRUE,  0,  TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- ---------- hr_regularization_reasons (system rows, institution_id=NULL) ----------
INSERT INTO hr_regularization_reasons (institution_id, code, label, is_system, is_active)
VALUES
  (NULL, 'device_offline',    'Biometric device was offline',           TRUE, TRUE),
  (NULL, 'network_failure',   'Network failure during punch',           TRUE, TRUE),
  (NULL, 'forgot',            'Forgot to punch',                        TRUE, TRUE),
  (NULL, 'leave_clash',       'Approved leave clashed with attendance', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 12. RECOMPUTE FUNCTIONS (Round 3.2 + 3.3 + 3.4)
-- =====================================================================

-- ---------- fn_recompute_attendance_on_holiday_change ----------
-- When institution_leaves changes, scan past 90 days, flip ABSENT -> HOLIDAY
-- for affected dates, and log the recompute event in hr_attendance_audit_log.
CREATE OR REPLACE FUNCTION fn_recompute_attendance_on_holiday_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holiday_status_id UUID;
  v_absent_status_id UUID;
  v_inst_id UUID;
  v_start DATE;
  v_end DATE;
  v_event_id UUID := gen_random_uuid();
  v_cutoff DATE := CURRENT_DATE - INTERVAL '90 days';
BEGIN
  -- Resolve target institution + date range from the trigger row
  IF (TG_OP = 'DELETE') THEN
    v_inst_id := OLD.institution_id;
    v_start   := GREATEST(OLD.start_date, v_cutoff);
    v_end     := OLD.end_date;
  ELSE
    v_inst_id := NEW.institution_id;
    v_start   := GREATEST(NEW.start_date, v_cutoff);
    v_end     := NEW.end_date;
  END IF;

  IF v_inst_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_start > v_end THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Look up system status type ids (institution_id IS NULL = system rows)
  SELECT id INTO v_holiday_status_id
    FROM hr_attendance_status_types
    WHERE code = 'HOLIDAY' AND institution_id IS NULL
    LIMIT 1;

  SELECT id INTO v_absent_status_id
    FROM hr_attendance_status_types
    WHERE code = 'ABSENT' AND institution_id IS NULL
    LIMIT 1;

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Audit BEFORE state for affected rows, then flip ABSENT -> HOLIDAY
  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT
    r.id, r.employee_id, r.institution_id, NULL, 'recompute',
    jsonb_build_object('status_type_id', r.status_type_id, 'status_code', 'ABSENT'),
    jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
    'Holiday added/changed in institution_leaves; ABSENT -> HOLIDAY',
    NOW()
  FROM hr_attendance_records r
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  UPDATE hr_attendance_records r
    SET status_type_id = v_holiday_status_id,
        recomputed_from_event_id = v_event_id,
        updated_at = NOW()
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------- fn_recompute_attendance_on_leave_approval ----------
-- When hr_leave_applications.status flips to 'approved', flip PRESENT/ABSENT
-- to LEAVE for the covered dates, and audit-log the change.
CREATE OR REPLACE FUNCTION fn_recompute_attendance_on_leave_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leave_status_id UUID;
  v_event_id UUID := gen_random_uuid();
BEGIN
  -- Only act on transition into 'approved'
  IF (TG_OP = 'UPDATE'
      AND NEW.status = 'approved'
      AND COALESCE(OLD.status, '') <> 'approved') THEN

    SELECT id INTO v_leave_status_id
      FROM hr_attendance_status_types
      WHERE code = 'LEAVE' AND institution_id IS NULL
      LIMIT 1;

    IF v_leave_status_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Audit BEFORE state, then flip
    INSERT INTO hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT
      r.id, r.employee_id, r.institution_id, NEW.final_approver_id, 'recompute',
      jsonb_build_object('status_type_id', r.status_type_id),
      jsonb_build_object('status_type_id', v_leave_status_id, 'status_code', 'LEAVE', 'event_id', v_event_id, 'leave_application_id', NEW.id),
      'Leave application approved; previous status -> LEAVE',
      NOW()
    FROM hr_attendance_records r
    WHERE r.employee_id = NEW.employee_id
      AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
      AND r.status_type_id <> v_leave_status_id;

    UPDATE hr_attendance_records r
      SET status_type_id = v_leave_status_id,
          recomputed_from_event_id = v_event_id,
          updated_at = NOW()
    WHERE r.employee_id = NEW.employee_id
      AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
      AND r.status_type_id <> v_leave_status_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- fn_purge_attendance_audit_log ----------
-- Delete hr_attendance_audit_log rows older than per-institution
-- audit_retention_years (default 7). Called by daily cron, NOT a trigger.
CREATE OR REPLACE FUNCTION fn_purge_attendance_audit_log()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_org RECORD;
  v_deleted INT;
BEGIN
  FOR v_org IN
    SELECT institution_id, MIN(audit_retention_years) AS years
    FROM hr_organizations
    WHERE institution_id IS NOT NULL
    GROUP BY institution_id
  LOOP
    DELETE FROM hr_attendance_audit_log
      WHERE institution_id = v_org.institution_id
        AND created_at < NOW() - (COALESCE(v_org.years, 7) || ' years')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
  END LOOP;

  -- Rows with NULL institution_id use the default 7-year retention
  DELETE FROM hr_attendance_audit_log
    WHERE institution_id IS NULL
      AND created_at < NOW() - INTERVAL '7 years';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total := v_total + v_deleted;

  RETURN v_total;
END;
$$;

-- =====================================================================
-- 13. TRIGGERS (Round 3.2 + 3.3)
-- =====================================================================

DROP TRIGGER IF EXISTS tr_recompute_attendance_on_holiday_change ON institution_leaves;
CREATE TRIGGER tr_recompute_attendance_on_holiday_change
  AFTER INSERT OR UPDATE OR DELETE ON institution_leaves
  FOR EACH ROW
  EXECUTE FUNCTION fn_recompute_attendance_on_holiday_change();

DROP TRIGGER IF EXISTS tr_recompute_attendance_on_leave_approval ON hr_leave_applications;
CREATE TRIGGER tr_recompute_attendance_on_leave_approval
  AFTER UPDATE OF status ON hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION fn_recompute_attendance_on_leave_approval();

-- =====================================================================
-- END OF MIGRATION 20260429000001_hr_attendance_sprint5_schema.sql
-- =====================================================================
