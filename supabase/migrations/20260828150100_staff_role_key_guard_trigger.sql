-- Restrict who may set or change a staff member's role.
--
-- THE HOLE THIS CLOSES. Nothing validated staff.role_key. The RLS policies
-- staff_insert_scope_aware / staff_update_scope_aware gate on staff.create /
-- staff.edit and institution scope only, and validate_staff_department_scope
-- checks category/department. So anyone who could edit a staff row could set
-- role_key = 'super_admin' and escalate — and RoleService.getStaffAssignableRoles
-- offered exactly that in the dropdown, excluding only 'student' and 'guest'.
--
-- Filtering the dropdown fixes nothing on its own: the value is posted from the
-- client. THIS is the control; the UI change is the courtesy on top.

BEGIN;

-- The staff table is busy in production and CREATE TRIGGER needs an
-- AccessExclusiveLock, which deadlocked on the first attempt. Fail fast and
-- retry rather than sit in a lock queue.
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_staff_guard_role_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_privileged boolean;
BEGIN
  -- No session: service-role clients, cron jobs and migrations. Safe to allow,
  -- because anon cannot reach this trigger at all — the INSERT policy already
  -- demands staff.create. If that policy is ever loosened, revisit this branch.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- The actual reported problem: any coordinator with staff.edit could change
  -- a colleague's — or their own — role.
  IF TG_OP = 'UPDATE' AND NEW.role_key IS DISTINCT FROM OLD.role_key THEN
    RAISE EXCEPTION 'Only a super administrator can change a staff member''s role.'
      USING ERRCODE = 'P0001';
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
$fn$;

COMMENT ON FUNCTION public.fn_staff_guard_role_key() IS
  'Blocks non-super-admins from changing staff.role_key, or creating staff with a privileged role.';

-- Trigger functions are exempt from the anon-lock CI gate, but PostgREST would
-- still publish this at /rest/v1/rpc/ without the revoke.
REVOKE ALL ON FUNCTION public.fn_staff_guard_role_key() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_staff_guard_role_key ON public.staff;
CREATE TRIGGER trg_staff_guard_role_key
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_guard_role_key();

COMMIT;
