-- Guest can no longer assign roles or browse users and staff; Guest is not an
-- admin role (Director, 8 Oct 2026).
--
-- The guest role is what a person holds after signing in with Google and before
-- being linked to a learner or a team-member record. On production (read
-- 2026-10-08) it granted five admin keys among its self-service ones:
--   roles.assign, assign_roles   - opens the Roles page (/users/roles)
--   users.view,   view_users     - opens All Users (/users) and user detail pages
--   staff.view                   - opens the team-member list, and passes the
--                                  staff table's read rule, the AI "list team
--                                  members" tool and the global record search
-- No migration in the repo ever granted them. view_users and assign_roles are the
-- old key format; RoleService.migratePermissions (the "migrate permissions"
-- button on Role Management) maps them to users.view and roles.assign and only
-- ever adds keys, so both spellings go together or the dotted ones grow back.
--
-- Part 1 also clears guest's is_privileged flag. 20260828150000 set it only
-- because guest held roles.assign; with that key gone guest is not an admin
-- role, and the flag would otherwise make /api/users/roles/assign treat every
-- guest holder as someone with admin powers.
--
-- Drift check: refuses, changing nothing, unless the guest row exists, its keys
-- set to true are exactly the 25 read on 2026-10-08 and is_privileged is true.
-- Re-runnable: if the five keys are already gone, the other 20 match and the
-- flag is false, it raises a NOTICE and writes nothing. Any other state aborts.
--
-- Part 2 adds fn_caller_can_grant_role(role_id), the no-escalation rule the
-- role-assign route asks for a caller who is not a super admin.

BEGIN;

-- ── Part 1: the guest row ──────────────────────────────────────────────────
DO $$
DECLARE
  v_perms jsonb;
  v_priv  boolean;
  v_true  text[];
  v_removed text[] := ARRAY['roles.assign', 'assign_roles', 'staff.view', 'users.view', 'view_users'];
  v_expected text[] := ARRAY[
    'aiPulse:view.self', 'ai_pulse.view', 'assign_roles', 'calendar.view',
    'courses.participant.self', 'hr.assets.view_own', 'hr.attendance.view_self',
    'hr.documents.view_own', 'hr.fdp.view_own', 'hr.forms.submit_own',
    'hr.leave.apply', 'hr.leave.balance.view', 'hr.leave.cancel',
    'hr.leave.encashment.view', 'hr.leave.withdraw', 'hr.memos.view_own',
    'hr.performance_reviews.view_own', 'hr.promotion.apply_own',
    'hr.training.view_own', 'onlineMeeting:create', 'online_meetings.view',
    'roles.assign', 'staff.view', 'users.view', 'view_users'
  ];
BEGIN
  SELECT permissions, is_privileged INTO v_perms, v_priv
  FROM public.custom_roles
  WHERE role_key = 'guest';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest role not found; nothing changed';
  END IF;

  IF v_perms IS NULL OR jsonb_typeof(v_perms) <> 'object' THEN
    RAISE EXCEPTION 'guest permissions are not a JSON object (%); nothing changed',
      COALESCE(jsonb_typeof(v_perms), 'null');
  END IF;

  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO v_true
  FROM jsonb_each(v_perms)
  WHERE value = 'true'::jsonb;

  IF v_priv IS FALSE
     AND v_true = (SELECT array_agg(k ORDER BY k) FROM unnest(v_expected) AS k
                   WHERE k <> ALL (v_removed)) THEN
    RAISE NOTICE 'guest role already has none of the five admin keys and is not privileged; nothing to do';
    RETURN;
  END IF;

  IF v_priv IS NOT TRUE THEN
    RAISE EXCEPTION 'guest is_privileged is % (expected true); nothing changed',
      COALESCE(v_priv::text, 'null');
  END IF;

  IF v_true IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(v_expected) AS k) THEN
    RAISE EXCEPTION 'guest grants differ from the set read on 2026-10-08; nothing changed. Now true: %',
      array_to_string(v_true, ', ');
  END IF;

  UPDATE public.custom_roles
  SET permissions   = permissions - v_removed,
      is_privileged = false,
      updated_at    = now()
  WHERE role_key = 'guest';
END
$$;

-- ── Part 2: no-escalation check for role assignment ────────────────────────
-- TRUE only when the signed-in caller (auth.uid(), never a parameter) may give
-- this role without gaining anyone powers the caller does not hold:
--   * the role is not is_privileged (NULL counts as privileged);
--   * its institution_scope is set and is not 'all';
--   * its permissions are a JSON object, and every key it grants is granted to
--     the caller by one of the caller's roles (user_roles, or the legacy
--     profiles.role), read with the same cast as user_has_permission:
--     (permissions->>key)::boolean. Director handovers do not count: they are
--     temporary and must not mint a permanent role.
-- A value that will not cast to boolean, on either side, answers FALSE.
-- A deactivated or login-disabled caller holds nothing, as in user_has_permission.
-- Super admins are decided by the route, not here.
CREATE OR REPLACE FUNCTION public.fn_caller_can_grant_role(p_role_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_priv   boolean;
  v_scope  text;
  v_perms  jsonb;
  v_key    text;
  v_on     boolean;
  v_caller boolean;
BEGIN
  IF v_uid IS NULL OR p_role_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT cr.is_privileged, cr.institution_scope, cr.permissions
  INTO v_priv, v_scope, v_perms
  FROM public.custom_roles cr
  WHERE cr.id = p_role_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_priv IS DISTINCT FROM false THEN
    RETURN false;
  END IF;
  IF v_scope IS NULL OR v_scope = 'all' THEN
    RETURN false;
  END IF;
  IF v_perms IS NULL OR jsonb_typeof(v_perms) <> 'object' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid
      AND (p.is_active = false OR p.is_login_disabled = true)
  ) THEN
    RETURN false;
  END IF;

  FOR v_key IN SELECT key FROM jsonb_object_keys(v_perms) AS key LOOP
    BEGIN
      v_on := (v_perms ->> v_key)::boolean;
    EXCEPTION WHEN data_exception THEN
      RETURN false;
    END;
    CONTINUE WHEN v_on IS NOT TRUE;

    BEGIN
      v_caller :=
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = v_uid
            AND (cr.permissions ->> v_key)::boolean = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          JOIN public.custom_roles cr ON cr.role_key = p.role
          WHERE p.id = v_uid
            AND (cr.permissions ->> v_key)::boolean = true
        );
    EXCEPTION WHEN data_exception THEN
      RETURN false;
    END;
    IF NOT v_caller THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_caller_can_grant_role(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_caller_can_grant_role(uuid) TO authenticated;

COMMIT;
