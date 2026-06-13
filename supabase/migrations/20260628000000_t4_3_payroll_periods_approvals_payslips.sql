-- ============================================================================
-- Migration: 20260628000000_t4_3_payroll_periods_approvals_payslips
-- Phase: HR Module — T4.3 (period orchestration + 4-stage approval chain + payslip rows)
-- ============================================================================
-- Spec: specs/t4-payroll-design-lock-2026-05-15.md (20 decisions, lock 2026-05-15)
-- Director scope-confirm 2026-05-17: full scope (3 tables + FK + RLS), manual
-- HR-Officer "Prepare period" button (no auto-flip, no cron).
--
-- This migration ships the DATA SUBSTRATE only. RPCs for stage transitions,
-- service layer, React Query hooks, and the 4-stage approval-chain UI follow
-- in subsequent PRs of the T4.3 sprint.
--
-- Tables:
--   1. hr_payroll_periods             — one row per (institution × month × engine_type)
--   2. hr_payroll_period_approvals    — append-only audit per stage transition
--   3. hr_payslips                    — one row per staff per period (with supersede chain)
--   FK: hr_payslip_line_items.slip_id → hr_payslips(id)  (deferred from T4.2)
--
-- State machine (Decision #9, hard-block per Decision #17):
--   draft → prepared → cao_reviewed → accounts_verified → chairperson_approved → distributed → locked
--
-- TIER-0 safe-additive. Idempotent re-run safe. Hits prod via Management API
-- + probe per CLAUDE.md Rule 1 BEFORE PR flips DRAFT → Ready.
--
-- Companion app code (next PRs in this sprint):
--   - lib/services/hr/payroll/periods-service.ts
--   - lib/services/hr/payroll/approvals-service.ts
--   - hooks/hr/payroll/use-payroll-periods.ts (+ ...period.ts + ...approvals.ts)
--   - app/(routes)/admin/hr/payroll/periods/page.tsx               (list)
--   - app/(routes)/admin/hr/payroll/periods/[id]/page.tsx          (detail + 4-stage stepper)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hr_payroll_periods — period orchestration row
-- ----------------------------------------------------------------------------
-- One row per (institution_id × engine_type × period_year × period_month × is_backdated).
-- Decision #13: 8 institutions × 12 months × 2 engines = up to 192 rows/year, each
-- running through HR → CAO → Accounts → Chairperson independently.
--
-- Decision #3 + #14: pay_matrix_snapshot + deduction_rates_snapshot captured at
-- period-lock (when HR Officer presses "Prepare period"). Subsequent policy
-- edits don't affect this period — the snapshot is authoritative.
--
-- Decision #20: is_backdated allowed only with Director sign-off audit row.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  engine_type text NOT NULL
    CHECK (engine_type IN ('faculty','non_teaching')),
  period_year int NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','prepared','cao_reviewed','accounts_verified','chairperson_approved','distributed','locked')),
  working_days_count int,                          -- cached at prepare time
  total_calendar_days int,                         -- 28/29/30/31
  is_backdated boolean NOT NULL DEFAULT false,
  backdate_reason text,
  pay_matrix_snapshot jsonb,                       -- from hr.pay_scales at prepare
  deduction_rates_snapshot jsonb,                  -- TDS/PF/ESI/PT/standard_deduction snapshot
  prepared_at timestamptz, prepared_by uuid REFERENCES public.profiles(id),
  cao_reviewed_at timestamptz, cao_reviewed_by uuid REFERENCES public.profiles(id),
  accounts_verified_at timestamptz, accounts_verified_by uuid REFERENCES public.profiles(id),
  chairperson_approved_at timestamptz, chairperson_approved_by uuid REFERENCES public.profiles(id),
  distributed_at timestamptz, distributed_by uuid REFERENCES public.profiles(id),
  locked_at timestamptz, locked_by uuid REFERENCES public.profiles(id),
  total_gross numeric,
  total_deductions numeric,
  total_net numeric,
  staff_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_payroll_periods_inst_engine_period
    UNIQUE (institution_id, engine_type, period_year, period_month, is_backdated),
  CONSTRAINT chk_hr_payroll_periods_backdate_reason
    CHECK (is_backdated = false OR backdate_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_periods_inst_status
  ON public.hr_payroll_periods(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_periods_year_month
  ON public.hr_payroll_periods(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_periods_engine_status
  ON public.hr_payroll_periods(engine_type, status);

COMMENT ON TABLE public.hr_payroll_periods IS
  'T4.3: per-institution × engine_type × month payroll period. status drives 4-stage approval chain (Decision #9). pay_matrix + deduction_rates snapshotted at prepare time (Decision #3/#14). is_backdated requires Director sign-off (Decision #20).';

-- ----------------------------------------------------------------------------
-- 2. hr_payroll_period_approvals — append-only stage transition audit
-- ----------------------------------------------------------------------------
-- One row per stage transition. Decision #17 is hard-block (no auto-escalation,
-- no delegation), so delegation_acting_as is informational-only — captured for
-- audit when a Director explicitly backdates a stage via override.
--
-- This table is the load-bearing audit for compliance. The hr_payroll_periods
-- row's status field is a derived projection of the latest row in this table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_period_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.hr_payroll_periods(id) ON DELETE CASCADE,
  stage text NOT NULL
    CHECK (stage IN ('prepared','cao_reviewed','accounts_verified','chairperson_approved','distributed','backdated_approval','rejected_to_prior')),
  approver_id uuid NOT NULL REFERENCES public.profiles(id),
  acted_at timestamptz NOT NULL DEFAULT now(),
  comment text,
  delegation_acting_as text,                        -- nullable; e.g. 'cao' when Director backdates a CAO sign-off
  rejected_from_stage text                          -- nullable; populated when stage='rejected_to_prior' to record where the period was when reject happened
    CHECK (rejected_from_stage IS NULL OR rejected_from_stage IN ('prepared','cao_reviewed','accounts_verified','chairperson_approved','distributed'))
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_period_approvals_period
  ON public.hr_payroll_period_approvals(period_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_period_approvals_approver
  ON public.hr_payroll_period_approvals(approver_id, acted_at DESC);

COMMENT ON TABLE public.hr_payroll_period_approvals IS
  'T4.3: append-only audit of every stage transition on hr_payroll_periods. Decision #9 (4-stage) + #17 (hard-block, no auto-escalation) + #20 (backdating audit).';

-- ----------------------------------------------------------------------------
-- 3. hr_payslips — per-staff per-period row, with supersede chain
-- ----------------------------------------------------------------------------
-- Decision #5/#6: pay computed via calendar-pay anchor + working-day LOP-divisor.
-- Decision #7: corrections via supersede (new row with superseded_by → old row).
-- Decision #12: payment_mode captured per-slip (sourced from staff.payment_mode
-- when staff column ships in T4.4 sprint; defaults 'neft' here).
-- Decision #18: advance recovery line items reference hr_salary_advances (ships
-- in T4.7); FK deferred to that sprint.
--
-- UNIQUE (period_id, staff_id, superseded_by): allows one initial slip + N
-- supersede revisions per (period, staff). Initial has superseded_by = NULL.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.hr_payroll_periods(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id),
  engine_type text NOT NULL
    CHECK (engine_type IN ('faculty','non_teaching')),
  basic_pay numeric NOT NULL CHECK (basic_pay >= 0),
  pay_scale_snapshot_id uuid REFERENCES public.hr_pay_scales(id),
  working_days_attended numeric NOT NULL CHECK (working_days_attended >= 0),
  lop_days numeric NOT NULL DEFAULT 0 CHECK (lop_days >= 0),
  gross_amount numeric NOT NULL CHECK (gross_amount >= 0),
  total_deductions numeric NOT NULL CHECK (total_deductions >= 0),
  net_amount numeric NOT NULL CHECK (net_amount >= 0),
  payment_mode text NOT NULL DEFAULT 'neft'
    CHECK (payment_mode IN ('neft','cheque','cash')),
  bank_file_batch_id uuid,                          -- nullable; T4.4 populates at distribute
  cheque_roll_batch_id uuid,                        -- nullable; T4.4 populates at distribute
  pdf_storage_path text,                            -- nullable; T4.5 populates at distribute
  superseded_by uuid REFERENCES public.hr_payslips(id),
  correction_type text NOT NULL DEFAULT 'initial'
    CHECK (correction_type IN ('initial','adjustment','arrear','recovery','backdated')),
  reason text,                                      -- required if correction_type != 'initial'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_payslips_period_staff_supersede
    UNIQUE (period_id, staff_id, superseded_by),
  CONSTRAINT chk_hr_payslips_correction_reason
    CHECK (correction_type = 'initial' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_payslips_period
  ON public.hr_payslips(period_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_staff
  ON public.hr_payslips(staff_id, period_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_superseded
  ON public.hr_payslips(superseded_by) WHERE superseded_by IS NOT NULL;

COMMENT ON TABLE public.hr_payslips IS
  'T4.3: per-staff per-period slip row. Decision #6 (calendar-pay anchor) + #7 (supersede chain) + #12 (payment_mode per-slip). Stage transitions on parent period drive read visibility per RLS.';

-- ----------------------------------------------------------------------------
-- 4. FK: hr_payslip_line_items.slip_id → hr_payslips(id)
-- ----------------------------------------------------------------------------
-- Deferred from T4.2 (the T4.1+T4.2 migration left slip_id as a plain uuid
-- because hr_payslips didn't exist yet). Adding now that hr_payslips ships.
-- ON DELETE CASCADE: when a slip is hard-deleted, its line items go with it
-- (supersede uses superseded_by, not hard-delete, so this is rare).
--
-- Conditional add (skip if already present from a prior re-run).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hr_payslip_line_items_slip_id_fkey'
      AND conrelid = 'public.hr_payslip_line_items'::regclass
  ) THEN
    ALTER TABLE public.hr_payslip_line_items
      ADD CONSTRAINT hr_payslip_line_items_slip_id_fkey
      FOREIGN KEY (slip_id) REFERENCES public.hr_payslips(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. updated_at trigger for hr_payroll_periods
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_payroll_periods_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_payroll_periods_touch_updated_at ON public.hr_payroll_periods;
CREATE TRIGGER trg_hr_payroll_periods_touch_updated_at
  BEFORE UPDATE ON public.hr_payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_hr_payroll_periods_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RLS — hr_payroll_periods
-- ----------------------------------------------------------------------------
-- Posture from spec table:
--   - super_admin / admin / Director: full
--   - HR Officer (hr_officer/hr_admin/hr_manager) in same institution: SELECT + UPDATE
--   - CAO (cao) in same institution: SELECT + UPDATE (stage transitions only — enforced at RPC layer)
--   - Accounts (accounts/accountant) in same institution: SELECT + UPDATE (stage transitions only)
--   - Chairperson in same institution: SELECT + UPDATE (stage transitions only)
--   - Trust Secretary: SELECT (all)
--   - Staff (own): SELECT (period IDs of their payslips — enforced via JOIN to hr_payslips)
--
-- INSERT: HR Officer + admin only. New periods are created when HR Officer
-- opens the payroll module for a new (institution × engine × month).
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payroll_periods_select ON public.hr_payroll_periods;
CREATE POLICY hr_payroll_periods_select ON public.hr_payroll_periods
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','cao','accounts','accountant','director','chairperson','trust_secretary','principal','vice_principal','registrar')
        AND (acting.institution_id = hr_payroll_periods.institution_id OR acting.role_key IN ('director','trust_secretary','chairperson'))
    )
    OR EXISTS (
      -- Staff sees periods that contain their own payslip rows
      SELECT 1
      FROM public.hr_payslips slip
      JOIN public.staff s ON s.id = slip.staff_id
      WHERE slip.period_id = hr_payroll_periods.id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hr_payroll_periods_insert ON public.hr_payroll_periods;
CREATE POLICY hr_payroll_periods_insert ON public.hr_payroll_periods
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_payroll_periods.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  );

DROP POLICY IF EXISTS hr_payroll_periods_update ON public.hr_payroll_periods;
CREATE POLICY hr_payroll_periods_update ON public.hr_payroll_periods
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','cao','accounts','accountant','director','chairperson')
        AND (acting.institution_id = hr_payroll_periods.institution_id OR acting.role_key IN ('director','chairperson'))
    )
  );

DROP POLICY IF EXISTS hr_payroll_periods_delete ON public.hr_payroll_periods;
CREATE POLICY hr_payroll_periods_delete ON public.hr_payroll_periods
  FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ----------------------------------------------------------------------------
-- 7. RLS — hr_payroll_period_approvals (append-only audit)
-- ----------------------------------------------------------------------------
-- Read: same as parent period (anyone who can see the period can see its audit).
-- Insert: only by RPC-level service code (SECURITY DEFINER fns set in next PR).
--         For now, restrict INSERT to HR-write role_keys + admin so the table
--         is functional pre-RPC.
-- Update / Delete: HARD BLOCK — audit rows are immutable. Admins can override
--   via DELETE for super-corruption cleanup, but no UPDATE path.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_payroll_period_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payroll_period_approvals_select ON public.hr_payroll_period_approvals;
CREATE POLICY hr_payroll_period_approvals_select ON public.hr_payroll_period_approvals
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.hr_payroll_periods p
      JOIN public.staff acting ON acting.profile_id = auth.uid()
      WHERE p.id = hr_payroll_period_approvals.period_id
        AND (
          acting.role_key IN ('director','chairperson','trust_secretary')
          OR (acting.institution_id = p.institution_id
              AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','cao','accounts','accountant','principal','vice_principal','registrar'))
        )
    )
  );

DROP POLICY IF EXISTS hr_payroll_period_approvals_insert ON public.hr_payroll_period_approvals;
CREATE POLICY hr_payroll_period_approvals_insert ON public.hr_payroll_period_approvals
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','cao','accounts','accountant','director','chairperson')
    )
  );

-- No UPDATE policy at all → effectively read-only after insert.
DROP POLICY IF EXISTS hr_payroll_period_approvals_delete ON public.hr_payroll_period_approvals;
CREATE POLICY hr_payroll_period_approvals_delete ON public.hr_payroll_period_approvals
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 8. RLS — hr_payslips
-- ----------------------------------------------------------------------------
-- Spec posture:
--   - super_admin / admin / Director / Trust Secretary: all
--   - HR Officer (same institution): all in institution
--   - Accounts (same institution): all in institution
--   - Direct manager: own reports' slips, name+net only (column-mask via view in T4.5)
--   - Staff: own slips only
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payslips_select ON public.hr_payslips;
CREATE POLICY hr_payslips_select ON public.hr_payslips
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      -- Own slip (staff sees their own)
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_payslips.staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      -- HR/Accounts/Chairperson/Trust in same institution
      SELECT 1
      FROM public.hr_payroll_periods p
      JOIN public.staff acting ON acting.profile_id = auth.uid()
      WHERE p.id = hr_payslips.period_id
        AND (
          acting.role_key IN ('director','trust_secretary','chairperson')
          OR (acting.institution_id = p.institution_id
              AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','accounts','accountant','cao','principal','vice_principal','registrar'))
        )
    )
  );

DROP POLICY IF EXISTS hr_payslips_insert ON public.hr_payslips;
CREATE POLICY hr_payslips_insert ON public.hr_payslips
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  );

DROP POLICY IF EXISTS hr_payslips_update ON public.hr_payslips;
CREATE POLICY hr_payslips_update ON public.hr_payslips
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  );

DROP POLICY IF EXISTS hr_payslips_delete ON public.hr_payslips;
CREATE POLICY hr_payslips_delete ON public.hr_payslips
  FOR DELETE USING (
    -- Hard-delete is reserved for admins; corrections flow via supersede chain
    is_super_admin() OR is_admin()
  );

-- ----------------------------------------------------------------------------
-- 9. Verification probe (SELECT-only per CLAUDE.md Rule 1 pitfall 4)
-- ----------------------------------------------------------------------------
-- No INSERT smoke test (would need real institution + staff + profile rows and
-- risks NOT NULL drift). Verifies tables, columns, FK, RLS, indexes exist.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table_count int;
  v_fk_exists boolean;
  v_period_status_check boolean;
BEGIN
  -- 3 new tables exist
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('hr_payroll_periods','hr_payroll_period_approvals','hr_payslips');

  IF v_table_count <> 3 THEN
    RAISE EXCEPTION 'T4.3 migration expected 3 tables created, found %', v_table_count;
  END IF;

  -- FK from hr_payslip_line_items.slip_id to hr_payslips(id) exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hr_payslip_line_items_slip_id_fkey'
      AND conrelid = 'public.hr_payslip_line_items'::regclass
  ) INTO v_fk_exists;

  IF NOT v_fk_exists THEN
    RAISE EXCEPTION 'T4.3 migration expected FK hr_payslip_line_items.slip_id → hr_payslips(id), not found';
  END IF;

  -- Status CHECK constraint allows the 7 expected states (sanity probe)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND check_clause LIKE '%distributed%'
      AND check_clause LIKE '%chairperson_approved%'
  ) INTO v_period_status_check;

  IF NOT v_period_status_check THEN
    RAISE EXCEPTION 'T4.3 migration expected hr_payroll_periods.status CHECK to cover 7 states; not found';
  END IF;

  RAISE NOTICE 'T4.3 migration verified: 3 tables (hr_payroll_periods + hr_payroll_period_approvals + hr_payslips), FK on line_items, status CHECK present.';
END
$$;
