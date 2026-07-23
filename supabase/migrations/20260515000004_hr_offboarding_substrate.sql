-- ============================================================================
-- Migration: 20260515000004_hr_offboarding_substrate
-- Phase: HR Module Gap Closure — Wave 1 (Workisy parity gap #4 — separation)
-- ============================================================================
-- Ships two operational tables backing the 5-step separation workflow:
--
--   1. hr_offboarding_cases             — one row per staff exit (open/withdrawn/completed)
--   2. hr_offboarding_step_completions  — per-step audit (who/when/notes/attachments)
--
-- Director's standing rule (memory: reference_platform_policies_director_view_pattern.md):
-- the workflow *step list* itself (names, required-role, auto-advance, description)
-- lives in `platform_policies` under key `hr.offboarding.workflow_steps`. Agent α
-- ships that policy substrate + seed in a parallel PR. Step keys here are stable
-- string literals; the policy maps each key → display name + required role.
--
-- TIER-0 (safe-additive). No DDL on existing tables. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: hr_offboarding_cases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_offboarding_cases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  institution_id         UUID NOT NULL,
  initiated_by           UUID REFERENCES profiles(id),
  initiated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason                 TEXT NOT NULL,
  recommended_last_day   DATE,
  current_step_index     INT NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','withdrawn','completed')),
  completed_at           TIMESTAMPTZ,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open case per staff member (a person can only be offboarding once at a time).
-- Closed cases (withdrawn/completed) are historical and allowed to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_offboarding_open_case_per_staff
  ON hr_offboarding_cases (staff_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_cases_inst_status
  ON hr_offboarding_cases (institution_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_cases_staff
  ON hr_offboarding_cases (staff_id);

-- ----------------------------------------------------------------------------
-- 2. Table: hr_offboarding_step_completions
-- ----------------------------------------------------------------------------
-- One row per (case × step) when that step is marked complete. step_key matches
-- the keys in policy `hr.offboarding.workflow_steps` (seeded by Agent α):
--   resignation_initiation, exit_call, asset_submission, noc, final_settlement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_offboarding_step_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES hr_offboarding_cases(id) ON DELETE CASCADE,
  step_key      TEXT NOT NULL,
  step_index    INT NOT NULL,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by  UUID REFERENCES profiles(id),
  notes         TEXT,
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one completion row per (case, step_key). Re-marking same step
-- updates via app-layer upsert, never duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_offboarding_step_completion_case_key
  ON hr_offboarding_step_completions (case_id, step_key);

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_step_completions_case
  ON hr_offboarding_step_completions (case_id, step_index);

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger on cases
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_hr_offboarding_cases_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_offboarding_cases_touch ON hr_offboarding_cases;
CREATE TRIGGER trg_hr_offboarding_cases_touch
  BEFORE UPDATE ON hr_offboarding_cases
  FOR EACH ROW EXECUTE FUNCTION fn_hr_offboarding_cases_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — hr_offboarding_cases
-- ----------------------------------------------------------------------------
-- Read:
--   - super_admin / admin: all rows
--   - HR officer (institution-scoped): same-institution rows
--   - Staff: own case only (via staff.profile_id = auth.uid())
-- Write (insert/update):
--   - super_admin / admin: all rows
--   - HR officer: same-institution rows
--   - Staff: may INSERT their own case (initiate); update flow stays HR/admin.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_offboarding_cases_select ON hr_offboarding_cases;
CREATE POLICY hr_offboarding_cases_select ON hr_offboarding_cases
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = hr_offboarding_cases.staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      -- Same-institution HR users — uses staff.institution_id of the acting user
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_offboarding_cases.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_offboarding_cases_insert ON hr_offboarding_cases;
CREATE POLICY hr_offboarding_cases_insert ON hr_offboarding_cases
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = hr_offboarding_cases.staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_offboarding_cases.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_offboarding_cases_update ON hr_offboarding_cases;
CREATE POLICY hr_offboarding_cases_update ON hr_offboarding_cases
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_offboarding_cases.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_offboarding_cases_delete ON hr_offboarding_cases;
CREATE POLICY hr_offboarding_cases_delete ON hr_offboarding_cases
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 5. RLS — hr_offboarding_step_completions
-- ----------------------------------------------------------------------------
-- Inherits visibility from the parent case row. A user who can SELECT the case
-- can SELECT its completions; only HR/admin can write.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_step_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_offboarding_step_completions_select ON hr_offboarding_step_completions;
CREATE POLICY hr_offboarding_step_completions_select ON hr_offboarding_step_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr_offboarding_cases c
      WHERE c.id = hr_offboarding_step_completions.case_id
      -- Parent case's RLS gate already filters visibility; no extra check here.
    )
  );

DROP POLICY IF EXISTS hr_offboarding_step_completions_insert ON hr_offboarding_step_completions;
CREATE POLICY hr_offboarding_step_completions_insert ON hr_offboarding_step_completions
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM hr_offboarding_cases c
      JOIN staff acting ON acting.profile_id = auth.uid()
      WHERE c.id = hr_offboarding_step_completions.case_id
        AND acting.institution_id = c.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_offboarding_step_completions_update ON hr_offboarding_step_completions;
CREATE POLICY hr_offboarding_step_completions_update ON hr_offboarding_step_completions
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM hr_offboarding_cases c
      JOIN staff acting ON acting.profile_id = auth.uid()
      WHERE c.id = hr_offboarding_step_completions.case_id
        AND acting.institution_id = c.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_offboarding_step_completions_delete ON hr_offboarding_step_completions;
CREATE POLICY hr_offboarding_step_completions_delete ON hr_offboarding_step_completions
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 6. Comments — surface intent on the table for future readers
-- ----------------------------------------------------------------------------
COMMENT ON TABLE hr_offboarding_cases IS
  'HR Module — Workisy parity gap #4. One row per staff separation. Workflow step list lives in platform_policies.hr.offboarding.workflow_steps (seeded by Agent alpha).';
COMMENT ON TABLE hr_offboarding_step_completions IS
  'HR Module — per-step completion audit for hr_offboarding_cases. step_key matches platform_policies.hr.offboarding.workflow_steps[].key.';
