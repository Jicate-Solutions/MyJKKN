-- Guest can no longer assign roles or browse users and staff (Director, 8 Oct 2026).
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
-- Writes nothing else: is_privileged stays as it is (it could later be set to
-- false; PR #4254 already stops guest counting as admin powers), every other
-- key is kept, and no other role is touched.
--
-- Drift check: refuses, changing nothing, unless the guest row exists and its
-- keys set to true are exactly the set read on 2026-10-08. Applied twice, the
-- second run refuses too, because the five keys are already gone.

BEGIN;

DO $$
DECLARE
  v_perms jsonb;
  v_true  text[];
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
  SELECT permissions INTO v_perms
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

  IF v_true IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(v_expected) AS k) THEN
    RAISE EXCEPTION 'guest grants differ from the set read on 2026-10-08; nothing changed. Now true: %',
      array_to_string(v_true, ', ');
  END IF;
END
$$;

UPDATE public.custom_roles
SET permissions = permissions - ARRAY['roles.assign', 'assign_roles', 'staff.view', 'users.view', 'view_users']::text[],
    updated_at  = now()
WHERE role_key = 'guest';

COMMIT;
