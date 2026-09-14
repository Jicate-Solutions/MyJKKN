-- ============================================================================
-- THE TOGGLE, AND AN ANON REVOKE ON WHAT THIS CHANGE TOUCHED (2026-09-06) — D
--
-- Two RPCs behind /hr/admin/institutions, plus a hygiene fix.
--
-- SUPER-ADMIN ONLY, and stated as a decision rather than a default. A new
-- permission key (hr.institutions.manage) would have to be added to the catalog
-- AND granted to roles in this same migration, or the page renders empty for
-- everyone — the failure this codebase hits repeatedly. Switching HR off for an
-- entire institution is also at least as consequential as the leave-balance
-- levers moved to super-admin earlier today, so the same gate is consistent.
-- Widening it later is a one-line change in both functions plus the page.
--
-- WHO / WHEN / WHY LIVES ON THE ROW. There is no generic change-log table in
-- this database (the audit_* tables are accreditation, not activity), and adding
-- one for a 14-row table would be out of proportion. Three columns keep the
-- change auditable without inventing infrastructure.
--
-- THE ANON REVOKE AT THE BOTTOM IS PRE-EXISTING DRIFT, NOT CAUSED HERE.
-- 20260722100000 revoked anon from hr_leave_balance_analytics(text); then
-- 20260810121000 DROPPED that and created hr_leave_balance_analytics(uuid) —
-- a different function, EXECUTE-able by PUBLIC (which includes anon) by
-- default — and only ever GRANTed. The old REVOKE could not carry across a
-- signature change. Same story for fn_hr_orgs_for_institutions and
-- hr_staff_visible_org_ids. None is exploitable, because each checks
-- user_has_permission or auth.uid() internally and anon fails that, but
-- defence-in-depth should not depend on the inner check alone. Only the three
-- functions this change actually touched are fixed here; the wider sweep is
-- reported separately rather than done silently.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

ALTER TABLE public.hr_organizations
  ADD COLUMN IF NOT EXISTS included_in_hr_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS included_in_hr_changed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS included_in_hr_reason     text;

-- ---------------------------------------------------------------------------
-- 1. The admin list
--
-- Deliberately NOT built on fn_hr_orgs_for_institutions: that function now
-- filters excluded organizations out, so using it here would make an excluded
-- institution impossible to find and therefore impossible to switch back on.
-- This is the one place that must see all 14.
--
-- The counts exist so the consequence is visible BEFORE the toggle: pending is
-- what becomes unreachable, since excluding freezes in-flight requests rather
-- than resolving them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_organizations_admin_list()
RETURNS TABLE(
  hr_organization_id uuid,
  institution_id     uuid,
  institution_name   text,
  included_in_hr     boolean,
  total_staff        bigint,
  hr_staff           bigint,
  pending_requests   bigint,
  changed_at         timestamptz,
  changed_by_name    text,
  reason             text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.institution_id, i.name::text, o.included_in_hr,
    (SELECT count(*) FROM public.staff s
      WHERE s.institution_id = i.id AND s.is_active),
    (SELECT count(*) FROM public.staff s
       JOIN public.employment_categories ec ON ec.id = s.category_id
      WHERE s.institution_id = i.id AND s.is_active AND ec.included_in_hr),
    (SELECT count(*) FROM public.hr_leave_applications a
      WHERE a.hr_organization_id = o.id AND a.status IN ('pending','escalated')),
    o.included_in_hr_changed_at,
    p.full_name::text,
    o.included_in_hr_reason
  FROM public.hr_organizations o
  JOIN public.institutions i ON i.id = o.institution_id
  LEFT JOIN public.profiles p ON p.id = o.included_in_hr_changed_by
  WHERE public.is_super_admin()
  ORDER BY i.name;
$function$;

COMMENT ON FUNCTION public.hr_organizations_admin_list() IS
  'Every HR organization with its staff and pending-request counts, INCLUDING excluded ones — the only place that sees them, since fn_hr_orgs_for_institutions now filters them out. Super-admin only.';

-- ---------------------------------------------------------------------------
-- 2. The toggle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_organization_set_included(
  p_hr_org_id uuid,
  p_included  boolean,
  p_reason    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst    text;
  v_was     boolean;
  v_pending bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'Insufficient permission: changing HR module inclusion is restricted to super administrators';
  END IF;
  IF p_included IS NULL THEN
    RAISE EXCEPTION 'included must be true or false';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required — it is what makes this change auditable';
  END IF;

  SELECT i.name, o.included_in_hr INTO v_inst, v_was
  FROM public.hr_organizations o
  JOIN public.institutions i ON i.id = o.institution_id
  WHERE o.id = p_hr_org_id;

  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.hr_leave_applications a
  WHERE a.hr_organization_id = p_hr_org_id AND a.status IN ('pending','escalated');

  UPDATE public.hr_organizations
     SET included_in_hr            = p_included,
         included_in_hr_changed_at = now(),
         included_in_hr_changed_by = auth.uid(),
         included_in_hr_reason     = btrim(p_reason),
         updated_at                = now()
   WHERE id = p_hr_org_id;

  -- Nothing is deleted. Balances, attendance and applications stay exactly as
  -- they are and simply stop being visible; re-enabling restores all of it.
  -- frozen_pending is returned so the caller can say how many requests just
  -- became unreachable.
  RETURN jsonb_build_object(
    'ok', true, 'institution', v_inst,
    'was', v_was, 'now', p_included,
    'frozen_pending', CASE WHEN p_included THEN 0 ELSE v_pending END);
END;
$function$;

COMMENT ON FUNCTION public.hr_organization_set_included(uuid, boolean, text) IS
  'Include or exclude one institution from the HR module. Excluding hides its staff from every HR surface and turns off their HR self-service; no data is deleted and re-enabling restores everything. Super-admin only, reason mandatory.';

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hr_organizations_admin_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_organization_set_included(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_organizations_admin_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_organization_set_included(uuid, boolean, text) TO authenticated, service_role;

-- Pre-existing drift on the three functions this change touched. See the header.
REVOKE EXECUTE ON FUNCTION public.hr_leave_balance_analytics(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_hr_orgs_for_institutions()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_staff_visible_org_ids()        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_analytics(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_orgs_for_institutions()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_staff_visible_org_ids()         TO authenticated, service_role;
