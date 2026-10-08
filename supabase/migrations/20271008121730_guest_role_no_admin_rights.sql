-- Guest can no longer assign roles or browse users and staff; Guest is not an
-- admin role (Director, 8 Oct 2026). Data only: no function, policy or schema
-- change.
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
-- It also clears guest's is_privileged flag. 20260828150000 set it only
-- because guest held roles.assign; with that key gone guest is not an admin
-- role, and the flag would otherwise make /api/users/roles/assign treat every
-- guest holder as someone with admin powers.
--
-- Drift check: refuses, changing nothing, unless the guest row exists, the keys
-- it grants are exactly the 25 read on 2026-10-08 and is_privileged is true.
-- "Grants" is read the way user_has_permission reads it,
-- (permissions->>key)::boolean, so a key stored as "true", "t", "yes", "y",
-- "on" or "1" counts as granted and is removed with the rest; a value that
-- will not cast aborts. Re-runnable: if the five keys are already gone, the
-- other 20 match and the flag is false, it raises a NOTICE and writes nothing.
-- Any other state aborts.

BEGIN;

DO $$
DECLARE
  v_perms jsonb;
  v_priv  boolean;
  v_true  text[];
  v_key   text;
  v_val   text;
  v_on    boolean;
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

  v_true := ARRAY[]::text[];
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(v_perms) ORDER BY key LOOP
    BEGIN
      v_on := v_val::boolean;
    EXCEPTION WHEN data_exception THEN
      RAISE EXCEPTION 'guest key % holds %, which is not a boolean; nothing changed', v_key, v_val;
    END;
    IF v_on THEN
      v_true := v_true || v_key;
    END IF;
  END LOOP;

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

COMMIT;
