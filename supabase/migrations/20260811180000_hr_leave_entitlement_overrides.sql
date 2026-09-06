-- =====================================================================
-- Derived leave entitlement — schema
-- Spec: docs/superpowers/specs/2026-08-11-hr-leave-balance-derived-entitlement-design.md
-- =====================================================================
-- WHY: entitlement was copied onto every staff x type x year row by a
-- manual "Generate" run. A copy can be missing (staff created after the
-- last run could not apply at all), stale (editing a leave type did not
-- reach the 4289 rows already written), or frozen from inputs that had
-- not arrived yet. This migration makes `entitled` nullable so NULL can
-- mean "derive from the leave type", and adds the two things the derived
-- model needs: explicit exceptions, and a freeze marker per year.

BEGIN;

-- 1. NULL now means "derive from policy". A non-NULL value still wins,
--    so every already-frozen historical row keeps its number untouched.
ALTER TABLE public.hr_leave_balances
  ALTER COLUMN entitled DROP NOT NULL;

COMMENT ON COLUMN public.hr_leave_balances.entitled IS
  'NULL = derive from hr_leave_types.default_entitled_days at read time. '
  'Non-NULL = frozen historical value, set by fn_hr_freeze_leave_year when the year ended.';

-- 2. Per-person exceptions. Rare and explicit; `reason` is mandatory
--    because an unexplained exception is how this table becomes
--    unmaintainable.
CREATE TABLE public.hr_leave_entitlement_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id)             ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id)    ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  entitled_days       numeric NOT NULL CHECK (entitled_days >= 0),
  reason              text    NOT NULL CHECK (btrim(reason) <> ''),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- hr_academic_year_id is NOT NULL on purpose. A nullable "every year"
  -- value would be invisible to this constraint (Postgres treats NULLs as
  -- distinct) and duplicates would accumulate silently.
  UNIQUE (employee_id, leave_type_id, hr_academic_year_id)
);

CREATE INDEX idx_hleo_lookup
  ON public.hr_leave_entitlement_overrides (employee_id, leave_type_id, hr_academic_year_id);
CREATE INDEX idx_hleo_org
  ON public.hr_leave_entitlement_overrides (hr_organization_id);

-- 3. Freeze marker. NOT end_date: a year that has ended but has not been
--    frozen must keep deriving, so a missed cron degrades to
--    current-policy numbers rather than to a gap.
ALTER TABLE public.hr_academic_years
  ADD COLUMN frozen_at timestamptz;

COMMENT ON COLUMN public.hr_academic_years.frozen_at IS
  'Non-NULL = this year is archived; balances are served from stored rows, not derived.';

-- 4. RLS. hleo_select mirrors hlb_select on hr_leave_balances verbatim.
ALTER TABLE public.hr_leave_entitlement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY hleo_select ON public.hr_leave_entitlement_overrides
FOR SELECT USING (
  (SELECT public.is_super_admin())
  OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
  OR ((SELECT public.user_has_permission('hr.leave.approve'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

-- Write key is hr.leave.balance.manage (the key already guarding
-- /hr/admin/leave-balances), NOT hr.leave.policies.write which guards
-- hlb_write. Setting one person's exception is balance administration.
CREATE POLICY hleo_write ON public.hr_leave_entitlement_overrides
FOR ALL USING (
  (SELECT public.is_super_admin())
  OR ((SELECT public.user_has_permission('hr.leave.balance.manage'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

REVOKE ALL ON public.hr_leave_entitlement_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_entitlement_overrides TO authenticated;

COMMIT;
