-- ============================================================================
-- Staff records: writes are HR Head only (+ super admin); everyone else views
-- ----------------------------------------------------------------------------
-- Owner's rule (2026-09-25): super admin keeps full access; HR Head adds,
-- edits, deletes, bulk-imports staff and changes a staff member's Role;
-- every other role is view-only. Staff Categories / Class Incharges are out
-- of scope and keep their grants.
--
-- 1. Grants. Before: staff.delete sat on administrator, cao,
--    digital_coordinator, hr_admin, payment_audit_admin (NOT hr_head), and
--    staff.manage_imports on administrator + payment_audit_admin as well.
--    After: the six write keys are held by hr_head alone. super_admin is
--    untouched — is_super_admin() short-circuits every check anyway.
--
-- 2. New key staff.role.change (hr_head). trg_staff_guard_role_key allowed a
--    role change for super admins only; it now also allows a holder of
--    staff.role.change, but never onto an is_privileged role — HR Head must
--    not be able to mint a super_admin/administrator/CEO/... The INSERT branch
--    (privileged role on create = super admin only) is unchanged. Gated on a
--    permission key + the is_privileged flag, never on role names.
--
-- The API routes that write staff with the service-role client
-- (app/api/staff/route.ts POST, app/api/staff/[id]/route.ts PATCH) bypass
-- this trigger (auth.uid() is NULL there) and enforce the same rule in code.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------
-- Strip every staff write key from every role except hr_head / super_admin.
UPDATE public.custom_roles
   SET permissions = permissions
                     - 'staff.create'
                     - 'staff.edit'
                     - 'staff.delete'
                     - 'staff.status_update'
                     - 'staff.manage_imports'
                     - 'staff.role.change',
       updated_at  = now()
 WHERE role_key NOT IN ('hr_head', 'super_admin')
   AND permissions ?| ARRAY['staff.create', 'staff.edit', 'staff.delete',
                            'staff.status_update', 'staff.manage_imports',
                            'staff.role.change'];

-- hr_head holds all six.
UPDATE public.custom_roles
   SET permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
                       'staff.view',           true,
                       'staff.create',         true,
                       'staff.edit',           true,
                       'staff.delete',         true,
                       'staff.status_update',  true,
                       'staff.manage_imports', true,
                       'staff.role.change',    true
                     ),
       updated_at  = now()
 WHERE role_key = 'hr_head';

-- ---------------------------------------------------------------------------
-- 2. Role guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_guard_role_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_privileged boolean;
BEGIN
  -- No session: service-role / cron. The API routes that write with the
  -- service-role client enforce this same rule themselves.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role_key IS DISTINCT FROM OLD.role_key THEN
    IF NOT coalesce(public.user_has_permission('staff.role.change'), false) THEN
      RAISE EXCEPTION 'Only HR Head or a super administrator can change a staff member''s role.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT r.is_privileged INTO v_privileged
    FROM public.custom_roles r WHERE r.role_key = NEW.role_key;

    IF coalesce(v_privileged, false) THEN
      RAISE EXCEPTION 'Only a super administrator can assign the role "%".', NEW.role_key
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT r.is_privileged INTO v_privileged
    FROM public.custom_roles r WHERE r.role_key = NEW.role_key;

    IF coalesce(v_privileged, false) THEN
      RAISE EXCEPTION 'Only a super administrator can assign the role "%".', NEW.role_key
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_staff_guard_role_key() IS
  'staff.role_key guard: changes need super admin or staff.role.change (never onto an is_privileged role); a privileged role on create needs super admin.';

-- ---------------------------------------------------------------------------
-- 3. Assertions
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_leak text;
  v_missing int;
BEGIN
  SELECT string_agg(role_key || ':' || k, ', ')
    INTO v_leak
    FROM public.custom_roles cr,
         unnest(ARRAY['staff.create', 'staff.edit', 'staff.delete',
                      'staff.status_update', 'staff.manage_imports',
                      'staff.role.change']) k
   WHERE cr.role_key NOT IN ('hr_head', 'super_admin')
     AND (cr.permissions ->> k)::boolean IS TRUE;
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'staff write keys still granted outside hr_head: %', v_leak;
  END IF;

  SELECT count(*) INTO v_missing
    FROM public.custom_roles cr,
         unnest(ARRAY['staff.create', 'staff.edit', 'staff.delete',
                      'staff.status_update', 'staff.manage_imports',
                      'staff.role.change']) k
   WHERE cr.role_key = 'hr_head'
     AND (cr.permissions ->> k)::boolean IS NOT TRUE;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'hr_head is missing % staff write key(s)', v_missing;
  END IF;

  RAISE NOTICE 'staff writes: hr_head only — OK';
END
$assert$;
