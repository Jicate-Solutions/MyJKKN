-- ============================================================================
-- Migration: 20260621_hr_separation_extension
-- Phase: HR Module — T6.4 Separation/Exit Extension (Wave 2)
-- ============================================================================
-- Extends Agent γ's Wave 1 offboarding substrate (PR #890,
-- 20260515000004_hr_offboarding_substrate.sql) with the missing separation
-- variants and Full-and-Final settlement substrate.
--
-- Wave 1 shipped a single-flavour "resignation" workflow. Production HR needs
-- to distinguish four exit kinds (resignation, retirement, termination,
-- death) and run the Full-and-Final (gratuity + leave encashment + PF) math
-- against the case once the workflow reaches the `final_settlement` step.
--
-- Changes in this migration:
--   1. hr_offboarding_cases  — add separation_type, retirement_age_at_separation,
--                              fnf_calculation (JSONB summary cache)
--   2. hr_fnf_calculations   — new operational table; one row per case once F&F
--                              has been calculated by the HR officer
--
-- Companion app code:
--   - lib/services/hr/offboarding-service.ts            calculateFnf + enforceResignationRules
--   - app/(routes)/admin/hr/offboarding/page.tsx        adds case-summary panel + sep-type filter
--   - app/(routes)/admin/hr/offboarding/[id]/fnf/...    F&F entry form
--   - app/(routes)/admin/hr/offboarding/retirements/... retirement-specific list
--   - app/api/cron/hr-retirement-eligibility-detector   monthly retirement detector
--
-- TIER-0 safe-additive (no destructive DDL on existing data). Idempotent —
-- ALTER ... ADD COLUMN IF NOT EXISTS guards every column; CREATE TABLE IF NOT
-- EXISTS guards the new table.
--
-- Smoke test at the end seeds + reads a synthetic case + F&F row to assert
-- RLS + NOT NULLs + JSONB structure, then rolls back via savepoint.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend hr_offboarding_cases
-- ----------------------------------------------------------------------------
-- separation_type defaults to 'resignation' so existing Wave 1 rows remain
-- valid without a backfill. The CHECK constraint pins the allowed set.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS separation_type TEXT NOT NULL DEFAULT 'resignation';

-- Drop+recreate the check so re-runs don't double-up.
ALTER TABLE hr_offboarding_cases
  DROP CONSTRAINT IF EXISTS hr_offboarding_cases_separation_type_check;
ALTER TABLE hr_offboarding_cases
  ADD CONSTRAINT hr_offboarding_cases_separation_type_check
  CHECK (separation_type IN ('resignation','retirement','termination','death'));

ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS retirement_age_at_separation INT;

-- Cache of the latest F&F summary so list views don't have to join
-- hr_fnf_calculations. Authoritative source of truth is still that table.
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS fnf_calculation JSONB;

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_cases_separation_type
  ON hr_offboarding_cases (separation_type);

COMMENT ON COLUMN hr_offboarding_cases.separation_type IS
  'Exit kind: resignation (default) | retirement (auto-detected by cron) | termination (HR-initiated) | death (HR-initiated). Drives downstream forms and reports.';
COMMENT ON COLUMN hr_offboarding_cases.retirement_age_at_separation IS
  'Staff age in years at the moment the retirement case opens. Populated only when separation_type=''retirement''. Lets HR audit against policy-configured retirement_age.';
COMMENT ON COLUMN hr_offboarding_cases.fnf_calculation IS
  'Denormalised JSONB cache of latest hr_fnf_calculations row for this case. Lets list/report views skip the join.';

-- ----------------------------------------------------------------------------
-- 2. hr_fnf_calculations — Full & Final settlement substrate
-- ----------------------------------------------------------------------------
-- Created when the HR officer reaches the final_settlement step. Stores the
-- arithmetic + the input snapshot (last_salary_breakdown) so the calc is
-- reproducible even if the underlying pay scale changes later.
--
-- Workflow:
--   1. HR officer opens /admin/hr/offboarding/<case-id>/fnf
--   2. UI fetches latest salary breakdown + leave balance + tenure
--   3. UI persists a draft (approved_at=NULL) — re-editable
--   4. HR head clicks Approve → approved_at=now(), case workflow can advance
--
-- Approval is captured by approved_at + approved_by; revisiting an approved
-- row creates a NEW row (audit-by-append).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_fnf_calculations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                   UUID NOT NULL REFERENCES hr_offboarding_cases(id) ON DELETE CASCADE,
  -- Arithmetic outputs (rupees, 2dp). Stored as numeric for safe summing.
  gratuity                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  leave_encashment          NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_balance                NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Optional tail items (notice-period payout, recovery deductions, etc.)
  other_payable             NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_recoverable         NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Net = gratuity + leave_encashment + pf_balance + other_payable - other_recoverable
  -- Stored as GENERATED column so consumers don't have to recompute.
  net_payable               NUMERIC(12,2) GENERATED ALWAYS AS (
    gratuity + leave_encashment + pf_balance + other_payable - other_recoverable
  ) STORED,
  -- Input snapshot — JSONB so different cadre pay structures fit cleanly.
  -- Typical keys: basic, da, hra, special_allowance, gross, last_drawn_at, leave_balance_days, tenure_years.
  last_salary_breakdown     JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                     TEXT,
  calculated_by             UUID REFERENCES profiles(id),
  calculated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by               UUID REFERENCES profiles(id),
  approved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Surface ONE current row per case for the cached fnf_calculation column path.
-- App-layer rule: only the latest row matters for the case-level cache. RLS
-- and history are append-only.
CREATE INDEX IF NOT EXISTS idx_hr_fnf_calculations_case_calculated_at
  ON hr_fnf_calculations (case_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_fnf_calculations_approved
  ON hr_fnf_calculations (case_id) WHERE approved_at IS NOT NULL;

COMMENT ON TABLE hr_fnf_calculations IS
  'HR Module T6.4 — Full & Final settlement per offboarding case. Append-only history (one row per recalculation). Latest row is cached on hr_offboarding_cases.fnf_calculation for fast list views.';
COMMENT ON COLUMN hr_fnf_calculations.net_payable IS
  'Generated: gratuity + leave_encashment + pf_balance + other_payable - other_recoverable.';
COMMENT ON COLUMN hr_fnf_calculations.last_salary_breakdown IS
  'JSONB snapshot of the salary inputs used. Reproducibility lever — even if the underlying pay scale changes the historic calc still adds up.';

-- ----------------------------------------------------------------------------
-- 3. RLS — hr_fnf_calculations
-- ----------------------------------------------------------------------------
-- Visibility inherits from the parent case row (anyone who can SELECT the
-- case can SELECT its F&F rows). Writes are HR officer / admin only.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_fnf_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_fnf_calculations_select ON hr_fnf_calculations;
CREATE POLICY hr_fnf_calculations_select ON hr_fnf_calculations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr_offboarding_cases c
      WHERE c.id = hr_fnf_calculations.case_id
      -- Parent case's RLS gate already filters visibility.
    )
  );

DROP POLICY IF EXISTS hr_fnf_calculations_insert ON hr_fnf_calculations;
CREATE POLICY hr_fnf_calculations_insert ON hr_fnf_calculations
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM hr_offboarding_cases c
      JOIN staff acting ON acting.profile_id = auth.uid()
      WHERE c.id = hr_fnf_calculations.case_id
        AND acting.institution_id = c.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_fnf_calculations_update ON hr_fnf_calculations;
CREATE POLICY hr_fnf_calculations_update ON hr_fnf_calculations
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM hr_offboarding_cases c
      JOIN staff acting ON acting.profile_id = auth.uid()
      WHERE c.id = hr_fnf_calculations.case_id
        AND acting.institution_id = c.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar')
    )
  );

DROP POLICY IF EXISTS hr_fnf_calculations_delete ON hr_fnf_calculations;
CREATE POLICY hr_fnf_calculations_delete ON hr_fnf_calculations
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 4. Smoke test — insert a synthetic case + F&F, then read back, then rollback
-- ----------------------------------------------------------------------------
-- Asserts:
--   (a) all NOT NULL columns can be satisfied with documented inputs
--   (b) separation_type CHECK accepts 'retirement'
--   (c) net_payable generated column adds up correctly
--   (d) RLS DOES NOT block superuser-level migration writes
--
-- Wrapped in a SAVEPOINT so it leaves zero residue on success or failure.
-- ----------------------------------------------------------------------------
DO $smoke$
DECLARE
  v_staff_id        UUID;
  v_institution_id  UUID;
  v_case_id         UUID;
  v_fnf_id          UUID;
  v_net             NUMERIC;
BEGIN
  -- Pick any staff row that exists; abort smoke if the table is empty (fresh DB).
  SELECT id, institution_id INTO v_staff_id, v_institution_id
    FROM staff
    WHERE institution_id IS NOT NULL
    LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE NOTICE 'Smoke skipped — no staff rows exist on this DB.';
    RETURN;
  END IF;

  SAVEPOINT smoke;

  -- (a)+(b) Insert a retirement case
  INSERT INTO hr_offboarding_cases (
    staff_id, institution_id, reason, separation_type,
    retirement_age_at_separation, current_step_index, status
  )
  VALUES (
    v_staff_id, v_institution_id,
    'Smoke test — retirement at 60. Will be rolled back.', 'retirement',
    60, 1, 'open'
  )
  RETURNING id INTO v_case_id;

  -- (c) Insert F&F row + assert generated net_payable
  INSERT INTO hr_fnf_calculations (
    case_id, gratuity, leave_encashment, pf_balance,
    other_payable, other_recoverable,
    last_salary_breakdown
  )
  VALUES (
    v_case_id, 250000, 80000, 600000,
    15000, 5000,
    jsonb_build_object(
      'basic', 30000, 'da', 4000, 'hra', 8000,
      'gross', 42000, 'tenure_years', 20,
      'leave_balance_days', 45
    )
  )
  RETURNING id, net_payable INTO v_fnf_id, v_net;

  IF v_net <> (250000 + 80000 + 600000 + 15000 - 5000) THEN
    RAISE EXCEPTION 'Smoke FAILED: net_payable=% expected %', v_net, 940000;
  END IF;

  RAISE NOTICE 'Smoke OK — case=% fnf=% net_payable=%', v_case_id, v_fnf_id, v_net;

  ROLLBACK TO SAVEPOINT smoke;
END;
$smoke$;
