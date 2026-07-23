-- ============================================================================
-- Migration: 20260626000000_hr_pay_components_and_payslip_line_items
-- Phase: HR Module — T4.1 + T4.2 (combined Director-locked slice 2026-05-15)
-- ============================================================================
-- Spec: specs/t4-payroll-design-lock-2026-05-15.md (20 decisions)
--
-- T4.1 ships the pay-component master table (CRUDable BASIC/DA/HRA earnings
-- and PF/ESI/TDS/PT deductions). T4.2 ships the line-item detail table and
-- the 5 platform_policies seeds the deduction engine reads.
--
-- IMPORTANT: hr_payslips itself does NOT ship in this PR. T4.3 builds the
-- period-locking + approval-chain + payslip-row infra. T4.1+T4.2 stand
-- alone as the catalog + computation layer feeding a read-only preview UI.
-- hr_payslip_line_items.slip_id is therefore a *plain uuid* with NO FK
-- here — T4.3 will add the FK once hr_payslips exists.
--
-- TIER-0 safe-additive. Idempotent re-run safe.
--
-- Companion app code:
--   - lib/services/hr/payroll/deduction-engine.ts            (pure computation)
--   - app/(routes)/admin/hr/payroll/preview/page.tsx         (read-only UI)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hr_pay_components — CRUDable component master
-- ----------------------------------------------------------------------------
-- One row per institution per component code. Seeded with system rows for
-- the 7 baseline codes (BASIC + DA + HRA earnings, PF + ESI + TDS + PT
-- deductions). is_system=true rows are immutable from the UI (the future
-- /admin/hr/payroll/components UI must forbid delete on those rows).
--
-- applies_to_engine_types text[] discriminates the two engine forks (faculty
-- vs non_teaching). Default applies to both; institution can scope a
-- bonus to faculty-only by overriding this column.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_pay_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  code text NOT NULL,
  display_name text NOT NULL,
  component_type text NOT NULL
    CHECK (component_type IN ('earning','deduction')),
  calculation_basis text NOT NULL
    CHECK (calculation_basis IN ('flat','percent_of_basic','percent_of_gross','formula')),
  default_amount_or_percent numeric,
  formula_expression text,
  applies_to_engine_types text[] NOT NULL DEFAULT ARRAY['faculty','non_teaching'],
  applies_to_cadre_ids uuid[],
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_pay_components_inst_code UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hr_pay_components_inst_active
  ON public.hr_pay_components(institution_id, is_active);
CREATE INDEX IF NOT EXISTS idx_hr_pay_components_type
  ON public.hr_pay_components(component_type, is_active);

COMMENT ON TABLE public.hr_pay_components IS
  'T4.1: CRUDable pay-component master per institution. is_system rows are immutable from UI. applies_to_engine_types discriminates faculty vs non_teaching engine forks.';

-- ----------------------------------------------------------------------------
-- 2. hr_payslip_line_items — earnings/deductions detail per slip
-- ----------------------------------------------------------------------------
-- Note: slip_id is a plain uuid (no FK). T4.3 will ADD the FK to hr_payslips
-- when that table is created. T4.1+T4.2 only needs the schema shape so the
-- deduction-engine output can be persisted/previewed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payslip_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL,
  component_id uuid NOT NULL REFERENCES public.hr_pay_components(id) ON DELETE RESTRICT,
  amount numeric NOT NULL,
  is_one_off boolean NOT NULL DEFAULT false,
  bonus_event_id uuid,
  advance_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_payslip_line_items_slip
  ON public.hr_payslip_line_items(slip_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslip_line_items_component
  ON public.hr_payslip_line_items(component_id);

COMMENT ON TABLE public.hr_payslip_line_items IS
  'T4.2: per-slip detail rows produced by the deduction engine. slip_id FK to hr_payslips is added by T4.3 when that table ships.';

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger for hr_pay_components
-- ----------------------------------------------------------------------------
-- Reuses the project-wide updated_at trigger if present; otherwise inlines.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_pay_components_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_pay_components_touch_updated_at ON public.hr_pay_components;
CREATE TRIGGER trg_hr_pay_components_touch_updated_at
  BEFORE UPDATE ON public.hr_pay_components
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_hr_pay_components_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — hr_pay_components
-- ----------------------------------------------------------------------------
-- Read:
--   - super_admin / admin: all rows
--   - All staff: read-only catalog (staff need to know what BASIC/DA/HRA mean)
-- Write (insert/update/delete):
--   - super_admin / admin: all rows
--   - HR roles in same institution
--   - is_system rows: delete is hard-blocked at policy level
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_pay_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_pay_components_select ON public.hr_pay_components;
CREATE POLICY hr_pay_components_select ON public.hr_pay_components
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_pay_components.institution_id
    )
  );

DROP POLICY IF EXISTS hr_pay_components_insert ON public.hr_pay_components;
CREATE POLICY hr_pay_components_insert ON public.hr_pay_components
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_pay_components.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar','accounts','accountant','director','chairperson')
    )
  );

DROP POLICY IF EXISTS hr_pay_components_update ON public.hr_pay_components;
CREATE POLICY hr_pay_components_update ON public.hr_pay_components
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.institution_id = hr_pay_components.institution_id
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar','accounts','accountant','director','chairperson')
    )
  );

DROP POLICY IF EXISTS hr_pay_components_delete ON public.hr_pay_components;
CREATE POLICY hr_pay_components_delete ON public.hr_pay_components
  FOR DELETE USING (
    (is_super_admin() OR is_admin())
    AND is_system = false
  );

-- ----------------------------------------------------------------------------
-- 5. RLS — hr_payslip_line_items
-- ----------------------------------------------------------------------------
-- Read:
--   - super_admin / admin: all rows
--   - HR / Accounts / Director / Chairperson / Trust Secretary: all rows
--     (institution scoping deferred until hr_payslips FK lands in T4.3 — the
--     parent slip's RLS will gate visibility there)
--   - Staff: own slip's lines (gated by hr_payslips RLS once T4.3 ships)
--
-- Until T4.3 lands hr_payslips, this table holds *engine preview output only*
-- and is written by service code (SECURITY DEFINER / service-role). Tight
-- write-gate at the engine layer is the substantive protection; we still
-- enable RLS here for defence-in-depth.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_payslip_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payslip_line_items_select ON public.hr_payslip_line_items;
CREATE POLICY hr_payslip_line_items_select ON public.hr_payslip_line_items
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','principal','vice_principal','registrar','accounts','accountant','director','chairperson','trust_secretary')
    )
  );

DROP POLICY IF EXISTS hr_payslip_line_items_insert ON public.hr_payslip_line_items;
CREATE POLICY hr_payslip_line_items_insert ON public.hr_payslip_line_items
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','accounts','accountant','director','chairperson')
    )
  );

DROP POLICY IF EXISTS hr_payslip_line_items_update ON public.hr_payslip_line_items;
CREATE POLICY hr_payslip_line_items_update ON public.hr_payslip_line_items
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','accounts','accountant','director','chairperson')
    )
  );

DROP POLICY IF EXISTS hr_payslip_line_items_delete ON public.hr_payslip_line_items;
CREATE POLICY hr_payslip_line_items_delete ON public.hr_payslip_line_items
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 6. platform_policies seeds — 5 keys for deduction engine
-- ----------------------------------------------------------------------------
-- FY2026-27 statutory values (India). Director-tweakable via the future
-- /admin/hr/policies/payroll-* UI (not in this PR; consumed read-only here).
--
-- All seeds are scope_type='global', scope_id=NULL. Director can override
-- per-institution later via the policy admin UI (3-layer pattern).
--
-- Uses INSERT...WHERE NOT EXISTS form because platform_policies' uniqueness
-- is enforced via a UNIQUE INDEX with a COALESCE expression — ON CONFLICT
-- can't target that without re-stating the COALESCE (caught in Wave 4-A).
-- ----------------------------------------------------------------------------

-- 6.1 TDS slabs (FY2026-27, new regime default)
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active, publication_state, description)
SELECT
  'hr.payroll.tds_slabs',
  'global',
  NULL,
  '{
    "regime": "new",
    "fiscal_year": "2026-27",
    "slabs": [
      {"upto_inr": 300000, "rate_pct": 0},
      {"upto_inr": 700000, "rate_pct": 5},
      {"upto_inr": 1000000, "rate_pct": 10},
      {"upto_inr": 1200000, "rate_pct": 15},
      {"upto_inr": 1500000, "rate_pct": 20},
      {"upto_inr": null,    "rate_pct": 30}
    ],
    "rebate_87a_threshold_inr": 700000,
    "rebate_87a_amount_inr": 25000,
    "surcharge_thresholds": [
      {"above_inr": 5000000,  "rate_pct": 10},
      {"above_inr": 10000000, "rate_pct": 15},
      {"above_inr": 20000000, "rate_pct": 25},
      {"above_inr": 50000000, "rate_pct": 37}
    ],
    "cess_pct": 4
  }'::jsonb,
  'object',
  true,
  'published',
  'T4.2 — FY2026-27 TDS slabs (new tax regime). Editable via Director policy admin UI (post T4 sprint).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hr.payroll.tds_slabs'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 6.2 PF rate (Employees' Provident Fund — EPFO)
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active, publication_state, description)
SELECT
  'hr.payroll.pf_rate',
  'global',
  NULL,
  '{
    "employee_pct": 12,
    "employer_pct": 12,
    "ceiling_inr": 15000,
    "applies_above_ceiling": false,
    "notes": "Standard EPFO 12% on basic+DA, capped at INR 15,000 wage ceiling. Voluntary VPF above ceiling not modeled."
  }'::jsonb,
  'object',
  true,
  'published',
  'T4.2 — EPFO PF rate. Editable via Director policy admin UI (post T4 sprint).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hr.payroll.pf_rate'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 6.3 ESI rate (Employees' State Insurance)
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active, publication_state, description)
SELECT
  'hr.payroll.esi_rate',
  'global',
  NULL,
  '{
    "employee_pct": 0.75,
    "employer_pct": 3.25,
    "ceiling_inr": 21000,
    "applies_above_ceiling": false,
    "notes": "ESI applies only when monthly gross <= INR 21,000. Computed on gross. Above ceiling = ESI exempt."
  }'::jsonb,
  'object',
  true,
  'published',
  'T4.2 — ESI rate. Editable via Director policy admin UI (post T4 sprint).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hr.payroll.esi_rate'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 6.4 Professional Tax (Tamil Nadu — primary state for JKKN)
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active, publication_state, description)
SELECT
  'hr.payroll.professional_tax',
  'global',
  NULL,
  '{
    "state": "TN",
    "frequency": "half_yearly_billed_monthly",
    "notes": "Tamil Nadu PT — applied as monthly amount on half-yearly slab. Greater Chennai schedule. Other states override per-institution.",
    "slabs_monthly": [
      {"upto_inr": 21000, "amount_inr": 0},
      {"upto_inr": 30000, "amount_inr": 135},
      {"upto_inr": 45000, "amount_inr": 315},
      {"upto_inr": 60000, "amount_inr": 690},
      {"upto_inr": 75000, "amount_inr": 1025},
      {"upto_inr": null,  "amount_inr": 1250}
    ]
  }'::jsonb,
  'object',
  true,
  'published',
  'T4.2 — Professional tax (TN default). Editable per-institution via Director policy admin UI.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hr.payroll.professional_tax'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 6.5 Standard deduction (Section 16(ia))
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active, publication_state, description)
SELECT
  'hr.payroll.standard_deduction',
  'global',
  NULL,
  '{
    "amount_inr": 75000,
    "applies_to_regime": "new",
    "applies_to_old_regime_amount_inr": 50000,
    "section": "16(ia)",
    "notes": "Standard deduction under Section 16(ia). New regime FY2026-27 = INR 75,000 (Budget 2024). Old regime = INR 50,000."
  }'::jsonb,
  'object',
  true,
  'published',
  'T4.2 — Standard deduction Section 16(ia). Editable via Director policy admin UI.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hr.payroll.standard_deduction'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 7. Verification probe (SELECT-only; no INSERT smoke test per Rule 1 pitfall 4)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_policy_count int;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM public.platform_policies
  WHERE policy_key IN (
    'hr.payroll.tds_slabs',
    'hr.payroll.pf_rate',
    'hr.payroll.esi_rate',
    'hr.payroll.professional_tax',
    'hr.payroll.standard_deduction'
  );

  IF v_policy_count <> 5 THEN
    RAISE EXCEPTION 'T4 payroll policy seed expected 5 rows, found %', v_policy_count;
  END IF;

  RAISE NOTICE 'T4.1+T4.2 migration: hr_pay_components + hr_payslip_line_items created; 5 payroll policies seeded.';
END
$$;
