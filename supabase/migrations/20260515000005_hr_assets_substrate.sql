-- ============================================================================
-- Migration: 20260515000005_hr_assets_substrate
-- Wave 1 — HR Assets (Workisy gap #6) — Agent δ substrate
-- ============================================================================
-- Created: 2026-05-15
-- Risk Tier: TIER-0 (safe-additive — two new tables + indexes + RLS, no
--            DDL touching existing tables, no data backfill, no destructive ops).
--
-- Purpose
-- -------
-- Two operational tables for the HR Assets cluster:
--   1) `hr_assets`              — institution-scoped asset inventory rows
--   2) `hr_asset_assignments`   — staff-asset request/approval/return lifecycle
--
-- Companion policy (seeded by Agent α in a sister PR):
--   policy_key: `hr.assets.category_definitions` (JSONB)
--   shape: { categories: [{ key, label, default_purchase_value, depreciation_months, active }] }
--
-- Agent δ references the policy as a string-literal key — the substrate does
-- NOT depend on the policy row existing at migration time. UI falls back to a
-- built-in default list if the policy row is missing.
--
-- RLS pattern
-- -----------
-- Mirrors hr_employee_documents (PR #809 substrate):
--   * super_admin / admin always
--   * HR officer with hr.employees.view + institution access (read/list)
--   * HR officer with hr.employees.edit + institution access (write)
--   * Staff sees own assignments (assignments table only)
--
-- Status values
-- -------------
-- `hr_assets.current_status`        : available | requested | assigned |
--                                      in_use | maintenance | retired
-- `hr_asset_assignments.status`     : requested | approved | assigned |
--                                      returned | rejected
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table: hr_assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_assets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  asset_code          text NOT NULL UNIQUE,    -- e.g. 'MacOs-A12', 'LAP-001'
  asset_name          text NOT NULL,           -- e.g. 'MacBook Pro 14"'
  category            text NOT NULL,           -- key into hr.assets.category_definitions

  -- Procurement
  purchase_date       date,
  purchase_value      numeric(12, 2),
  vendor              text,
  warranty_until      date,
  depreciation_method text,                    -- 'straight_line' | 'declining_balance' | null

  -- Ops state
  current_status      text NOT NULL DEFAULT 'available'
    CHECK (current_status IN (
      'available', 'requested', 'assigned',
      'in_use', 'maintenance', 'retired'
    )),

  -- Scope
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),

  -- Extensible bag (specs, serial, model, etc.)
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.hr_assets IS
  'HR — Asset Inventory (Workisy gap #6). One row per physical/digital asset (laptop, mouse, vehicle, lab equipment). category column references hr.assets.category_definitions policy key. RLS: HR officer institution-scoped; super_admin/admin global.';

COMMENT ON COLUMN public.hr_assets.category IS
  'Category key. Lookup against policy hr.assets.category_definitions for label + defaults. Free-text NOT FK so director can add categories without migrations.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_assets_institution_status
  ON public.hr_assets(institution_id, current_status);

CREATE INDEX IF NOT EXISTS idx_hr_assets_category
  ON public.hr_assets(category);

CREATE INDEX IF NOT EXISTS idx_hr_assets_asset_code
  ON public.hr_assets(asset_code);

-- updated_at trigger (reuses public.set_updated_at — already defined globally)
DROP TRIGGER IF EXISTS hr_assets_updated_at ON public.hr_assets;
CREATE TRIGGER hr_assets_updated_at
  BEFORE UPDATE ON public.hr_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Table: hr_asset_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_asset_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject
  asset_id            uuid NOT NULL REFERENCES public.hr_assets(id) ON DELETE CASCADE,
  staff_id            uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- Lifecycle timestamps
  requested_at        timestamptz NOT NULL DEFAULT now(),
  requested_by        uuid REFERENCES public.profiles(id),
  approved_at         timestamptz,
  approved_by         uuid REFERENCES public.profiles(id),
  assigned_at         timestamptz,
  returned_at         timestamptz,

  -- Notes / condition
  return_condition    text,                    -- 'good' | 'damaged' | 'lost' | free-text
  notes               text,

  -- State machine
  status              text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'approved', 'assigned',
      'returned', 'rejected'
    )),

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_asset_assignments IS
  'HR — Asset Assignment lifecycle. One row per staff request → approve → assign → return cycle. Multiple historical rows per (asset_id, staff_id) allowed. Active assignment = status=assigned AND returned_at IS NULL.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_asset_assignments_staff_status
  ON public.hr_asset_assignments(staff_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_asset_assignments_asset_status
  ON public.hr_asset_assignments(asset_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_asset_assignments_requested_at
  ON public.hr_asset_assignments(requested_at DESC);

-- ---------------------------------------------------------------------------
-- 3) RLS — hr_assets
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_assets ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin/admin always; HR officer institution-scoped; staff can
-- see assets in their institution (they need this to view the catalog when
-- requesting).
DROP POLICY IF EXISTS "hr_assets_select" ON public.hr_assets;
CREATE POLICY "hr_assets_select"
  ON public.hr_assets FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.view')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_assets.institution_id
    )
  );

DROP POLICY IF EXISTS "hr_assets_insert" ON public.hr_assets;
CREATE POLICY "hr_assets_insert"
  ON public.hr_assets FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "hr_assets_update" ON public.hr_assets;
CREATE POLICY "hr_assets_update"
  ON public.hr_assets FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "hr_assets_delete" ON public.hr_assets;
CREATE POLICY "hr_assets_delete"
  ON public.hr_assets FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4) RLS — hr_asset_assignments
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_asset_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin/admin always; HR officer scoped via asset's institution;
-- staff sees own assignments.
DROP POLICY IF EXISTS "hr_asset_assignments_select" ON public.hr_asset_assignments;
CREATE POLICY "hr_asset_assignments_select"
  ON public.hr_asset_assignments FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_assets a
      WHERE a.id = hr_asset_assignments.asset_id
        AND user_has_permission('hr.employees.view')
        AND role_has_institution_access(a.institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_asset_assignments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- INSERT: super_admin/admin always; HR officer with edit; staff can insert
-- their own request rows (status='requested' only — enforced in UI).
DROP POLICY IF EXISTS "hr_asset_assignments_insert" ON public.hr_asset_assignments;
CREATE POLICY "hr_asset_assignments_insert"
  ON public.hr_asset_assignments FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_assets a
      WHERE a.id = hr_asset_assignments.asset_id
        AND user_has_permission('hr.employees.edit')
        AND role_has_institution_access(a.institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_asset_assignments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- UPDATE: HR officer approves/assigns/rejects/returns. Staff cannot mutate
-- assignment rows after insert.
DROP POLICY IF EXISTS "hr_asset_assignments_update" ON public.hr_asset_assignments;
CREATE POLICY "hr_asset_assignments_update"
  ON public.hr_asset_assignments FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_assets a
      WHERE a.id = hr_asset_assignments.asset_id
        AND user_has_permission('hr.employees.edit')
        AND role_has_institution_access(a.institution_id)
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_assets a
      WHERE a.id = hr_asset_assignments.asset_id
        AND user_has_permission('hr.employees.edit')
        AND role_has_institution_access(a.institution_id)
    )
  );

DROP POLICY IF EXISTS "hr_asset_assignments_delete" ON public.hr_asset_assignments;
CREATE POLICY "hr_asset_assignments_delete"
  ON public.hr_asset_assignments FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- End of migration. TIER-0 safe-additive — no data backfill.
-- Policy seed for hr.assets.category_definitions is owned by Agent α.
-- ---------------------------------------------------------------------------
