-- Scope a leave type to an organization, a department, or named individuals —
-- and optionally give each scope its own entitlement.
--
-- WHY a table rather than more array columns on hr_leave_types: the existing
-- applicable_cadre_ids shows the limit of that approach. An array can express
-- "who", but not "how much for whom", and the requirement is explicitly both
-- ("Nursing gets 15 Casual Leave, everyone else 12"). One row per assignment
-- carries a value, an audit trail and temporal validity; an array carries none
-- of those.
--
-- WHY department and not cadre: hr_staff_details.cadre_id is NULL for all 731
-- active staff, so applicable_cadre_ids can never match anyone.
-- staff.department_id is populated for 422 of 731 across 55 departments — it is
-- the axis that actually works. Note the gap: 309 staff have no department, so
-- a department-scoped type will not reach them. hr_leave_type_coverage()
-- reports that count so it is stated at configuration time.
--
-- BACKWARD COMPATIBLE BY CONSTRUCTION: a type with NO active assignments stays
-- organization-wide. All 66 existing types keep behaving exactly as they do
-- today; nothing changes until an assignment is added.
--
-- PRECEDENCE when several assignments match one person:
--   staff (1) > department (2) > organization (3)
-- The most specific assignment wins, and its entitled_days override wins with
-- it. A NULL entitled_days means "eligible, but use the type default" — which
-- is why eligibility and amount are separate concerns on the same row.

CREATE TABLE IF NOT EXISTS public.hr_leave_type_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,

  scope_kind          varchar NOT NULL
                        CHECK (scope_kind IN ('organization','department','staff')),
  department_id       uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  staff_id            uuid REFERENCES public.staff(id) ON DELETE CASCADE,

  -- NULL = eligible at this scope but no override; fall through to the type
  -- default. 0 is a real value meaning "no entitlement", not "unset".
  entitled_days       numeric CHECK (entitled_days IS NULL OR entitled_days >= 0),

  is_active           boolean NOT NULL DEFAULT true,
  notes               text,

  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- The target column must match the scope. Without this a 'department' row
  -- could carry a staff_id and silently never match anyone.
  CONSTRAINT hlta_scope_target_coherent CHECK (
       (scope_kind = 'organization' AND department_id IS NULL     AND staff_id IS NULL)
    OR (scope_kind = 'department'   AND department_id IS NOT NULL AND staff_id IS NULL)
    OR (scope_kind = 'staff'        AND staff_id     IS NOT NULL  AND department_id IS NULL)
  )
);

-- One assignment per (type, target). A second row for the same target is
-- always a duplicate, and two rows with different entitled_days would make
-- precedence non-deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hlta_org
  ON public.hr_leave_type_assignments(leave_type_id)
  WHERE scope_kind = 'organization';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hlta_department
  ON public.hr_leave_type_assignments(leave_type_id, department_id)
  WHERE scope_kind = 'department';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hlta_staff
  ON public.hr_leave_type_assignments(leave_type_id, staff_id)
  WHERE scope_kind = 'staff';

CREATE INDEX IF NOT EXISTS idx_hlta_type_active
  ON public.hr_leave_type_assignments(leave_type_id, is_active);
CREATE INDEX IF NOT EXISTS idx_hlta_org
  ON public.hr_leave_type_assignments(hr_organization_id);

COMMENT ON TABLE public.hr_leave_type_assignments IS
  'Scopes a leave type to an organization, department or individuals, with an optional per-scope entitlement override. No rows for a type = organization-wide. Precedence: staff > department > organization.';

CREATE OR REPLACE FUNCTION public.hr_lta_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_hlta_touch ON public.hr_leave_type_assignments;
CREATE TRIGGER trg_hlta_touch
  BEFORE UPDATE ON public.hr_leave_type_assignments
  FOR EACH ROW EXECUTE FUNCTION public.hr_lta_touch();

-- RLS: readable by anyone who can see the catalog (staff need to know what
-- applies to them); writable only with the catalog-management permission,
-- scoped to the caller's own organizations.
ALTER TABLE public.hr_leave_type_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlta_select ON public.hr_leave_type_assignments;
CREATE POLICY hlta_select ON public.hr_leave_type_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR hr_organization_id IN (SELECT unnest(public.hr_staff_visible_org_ids()))
    OR public.user_has_permission('hr.leave.types.manage')
  );

DROP POLICY IF EXISTS hlta_write ON public.hr_leave_type_assignments;
CREATE POLICY hlta_write ON public.hr_leave_type_assignments
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_has_permission('hr.leave.types.manage')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_has_permission('hr.leave.types.manage')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  );
