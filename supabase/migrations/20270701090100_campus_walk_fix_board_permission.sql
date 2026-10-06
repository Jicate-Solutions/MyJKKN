-- 20270701090100_campus_walk_fix_board_permission.sql
--
-- Campus Walk — open the FIXES board (/campus-walk/scoreboard/fixes) to every
-- team member through a permission key, instead of the named-email allow-list.
--
-- AUTHORITY
--   Director's ruling, 2026-09-30: "the public scoreboard stays DEPARTMENTS
--   only (D9) but must be visible to staff". The walking and coverage boards
--   (/campus-walk/scoreboard/coverage, /split) keep their current gate — the
--   email allow-list in platform_policies `campus_walk.reporters.allowed_emails`.
--
-- THE KEY
--   `campus_walk.fix_board.view`. It opens a read-only board of department
--   totals — no person's name is loaded to build it (see
--   app/(routes)/campus-walk/scoreboard/_lib/scoreboard-page.tsx,
--   loadStaffDepartments). It writes nothing and bypasses nothing.
--
-- WHO GETS IT
--   Every role EXCEPT the learner-side and outsider rows:
--     student, graduated_student, production_learner, cohort_member  (learners)
--     parent                                                         (families)
--     guest                                                          (confined to /guest by proxy.ts)
--     external_auditor_timeboxed                                     (a contracted outsider on a clock)
--   Everything else — teaching and non-teaching team members, HODs, principals,
--   office roles, custom roles — is granted, including inactive rows, for the
--   reason 20261212120000_instasolver_permission_all_roles.sql gives: a role
--   switched back on later should not be the one row silently missing the key,
--   and proxy.ts only reads active roles anyway.
--   Role Management stays the switch: a super admin can turn it off per role.
--
-- SHAPE
--   Flat dotted keys in custom_roles.permissions, jsonb_set create_missing,
--   JSONB (not TEXT) comparison — the same predicate, and for the same reason,
--   as 20261212120000 (a string "true" reads as granted to `->>` and as NOT
--   granted to every consumer).
--
-- NO TRANSACTION CONTROL IN THIS FILE — the appliers wrap each file.
-- IDEMPOTENT — a re-run changes nothing. To undo: set the key to false.
-- FILE ONLY — applied by the orchestrator at merge time, never from a lane.

UPDATE public.custom_roles
SET
  permissions = jsonb_set(
                  coalesce(permissions, '{}'::jsonb),
                  '{campus_walk.fix_board.view}',
                  'true'::jsonb,
                  true
                ),
  updated_at  = now()
WHERE role_key NOT IN (
        'student', 'graduated_student', 'production_learner', 'cohort_member',
        'parent', 'guest', 'external_auditor_timeboxed'
      )
  AND (
        jsonb_typeof(permissions -> 'campus_walk.fix_board.view') IS DISTINCT FROM 'boolean'
        OR (permissions -> 'campus_walk.fix_board.view') <> 'true'::jsonb
      );

DO $$
DECLARE
  v_eligible int;
  v_granted  int;
  v_learner  int;
BEGIN
  SELECT count(*) INTO v_eligible
    FROM public.custom_roles
   WHERE role_key NOT IN (
           'student', 'graduated_student', 'production_learner', 'cohort_member',
           'parent', 'guest', 'external_auditor_timeboxed'
         );

  SELECT count(*) INTO v_granted
    FROM public.custom_roles
   WHERE role_key NOT IN (
           'student', 'graduated_student', 'production_learner', 'cohort_member',
           'parent', 'guest', 'external_auditor_timeboxed'
         )
     AND (permissions -> 'campus_walk.fix_board.view') = 'true'::jsonb;

  -- The learner-side rows must not have picked the key up from anywhere else.
  SELECT count(*) INTO v_learner
    FROM public.custom_roles
   WHERE role_key IN ('student', 'graduated_student', 'production_learner', 'cohort_member', 'parent')
     AND (permissions -> 'campus_walk.fix_board.view') = 'true'::jsonb;

  RAISE NOTICE 'Campus fixes board: % of % eligible role(s) hold campus_walk.fix_board.view; % learner/family role(s) hold it',
    v_granted, v_eligible, v_learner;

  IF v_eligible > 0 AND v_granted <> v_eligible THEN
    RAISE EXCEPTION
      'campus_walk.fix_board.view grant is incomplete — % of % eligible roles hold it. '
      'Check that custom_roles.permissions still stores FLAT dotted keys.',
      v_granted, v_eligible;
  END IF;
END $$;
