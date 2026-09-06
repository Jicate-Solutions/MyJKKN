-- ============================================================================
-- MBA Teaching-Enterprise · Faculty auto-sync role  (Team-Rotation build, Part 1)
-- Created: 2026-07-25  (spec: specs/mba-team-rotation-and-faculty-2026-07-25.md)
--
-- DORMANT migration. Ships as a FILE only; the Director applies it AFTER merge
-- (a MyJKKN deploy ships CODE, not DB migrations). Fully idempotent — safe to
-- re-run. Zero residue on prod from the PR itself.
--
-- Supersedes the DEFERRED, commented-out block (f) of 20260724071217
-- (mba_access_wiring). That block granted a *teaching-derived* set of 8 (staff
-- mapped to MBA courses via active staff plans). The interview of 2026-07-25
-- LOCKED the faculty rule as **department membership**, not teaching load:
--   Faculty who = staff WHERE department_id = MBA department (6, verified prod).
-- The two sets overlap but are not equal; this file is the authoritative grant.
--
-- What this migration does:
--   (a) create the 'mba_faculty' role — manager-side perms for MBA Senior
--       Learners (improvement.board.manage + ceo_rounds.log), scope 'own';
--   (b) backfill the role onto the 6 current MBA-department staff
--       (map staff -> profile via staff.profile_id);
--   (c) fn_mba_faculty_sync() — the service-role daily sweep the cron calls,
--       mirroring fn_mba_associate_sync (add joiners, remove leavers).
--
-- NOTE on terminology: role_key `mba_faculty` and table/column identifiers are
-- CODE identifiers (allowed to stay technical). All user-facing copy uses the
-- JKKN terms "Senior Learner" / "MBA Associate" / "learner".
--
-- MBA program : 43eed6cf-fa51-4e6b-ba93-1b27c4c16df4
-- MBA dept    : e73d1763-7479-4771-9c9e-cdea547d0205
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) 'mba_faculty' role — MBA-department Senior Learners (managers of the
--     Improvement Board + CEO Rounds). Perms locked by the 2026-07-25 interview:
--     improvement.board.manage (review/score/approve ideas, view ANY department's
--     analytics incl. money — the RPC already bypasses the posting gate + returns
--     money for managers) + ceo_rounds.log (host/log CEO Rounds).
--     institution_scope='own'. Do NOT grant these to the base 'faculty' role.
-- ----------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES
  ('mba_faculty',
   'MBA Faculty',
   'MBA-department Senior Learners (staff whose department is the MBA department). '
   || 'Auto-synced daily from department membership by fn_mba_faculty_sync(). Grants '
   || 'Improvement Board management plus CEO Rounds logging, and — as board managers — '
   || 'read access to every department''s de-identified analytics, financial views included.',
   '{"improvement.board.manage":true,"ceo_rounds.log":true}'::jsonb,
   'own', false, true)
ON CONFLICT (role_key) DO UPDATE SET
  role_name         = EXCLUDED.role_name,
  description       = EXCLUDED.description,
  permissions       = EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  is_active         = true,
  updated_at        = now();

-- ----------------------------------------------------------------------------
-- (b) Backfill the 6 current MBA-department staff onto the role.
--     Map: user_roles.user_id = profiles.id = staff.profile_id.
--     Derivation set = active staff in the MBA department with a linked profile
--     (is_active filter is the leaver guard — a deactivated staff row drops out
--     of the set and loses the role on the next sync; all 6 current rows are
--     active, so the backfill count is 6). is_primary=false so it never
--     displaces a staff member's existing primary role.
--     ON CONFLICT (user_id, role_id) DO NOTHING -> idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, is_primary)
SELECT DISTINCT st.profile_id,
       (SELECT id FROM public.custom_roles WHERE role_key = 'mba_faculty'),
       false
FROM public.staff st
WHERE st.department_id = 'e73d1763-7479-4771-9c9e-cdea547d0205'
  AND st.is_active
  AND st.profile_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- (c) fn_mba_faculty_sync() — daily reconciliation (cron/system-only).
--     Re-derives the current MBA-department staff set from the RULE, then:
--       • ADDs the role to new matches (joiners);
--       • REMOVEs the role from anyone who no longer matches (leavers — a staff
--         member deactivated, moved to another department, or removed). Their
--         authored artifacts STAY (those key on author_id and RLS checks the
--         VIEWER's perms, not the author's current role).
--     Mirrors fn_mba_associate_sync exactly (that one syncs the learner-side
--     'mba_associate' role from the enrolment rule; this one syncs the
--     manager-side 'mba_faculty' role from department membership).
--     SERVICE-ROLE-ONLY: REVOKE anon/PUBLIC/authenticated; GRANT service_role
--     (CLAUDE.md cron-RPC rule — a system sweep must never be caller-invokable).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_faculty_sync()
RETURNS TABLE (
  role_added   integer,
  role_removed integer,
  role_total   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id  uuid;
  v_role_add integer := 0;
  v_role_del integer := 0;
  v_role_tot integer := 0;
BEGIN
  SELECT id INTO v_role_id FROM public.custom_roles WHERE role_key = 'mba_faculty';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'mba_faculty role missing; apply the faculty-role migration first';
  END IF;

  -- Current matching set: active MBA-department staff with a linked profile.
  CREATE TEMP TABLE _mba_fac_match ON COMMIT DROP AS
  SELECT DISTINCT st.profile_id AS user_id
  FROM public.staff st
  WHERE st.department_id = 'e73d1763-7479-4771-9c9e-cdea547d0205'
    AND st.is_active
    AND st.profile_id IS NOT NULL;

  -- ROLE (the access gate) — ADD new matches.
  WITH ins AS (
    INSERT INTO public.user_roles (user_id, role_id, is_primary)
    SELECT m.user_id, v_role_id, false FROM _mba_fac_match m
    ON CONFLICT (user_id, role_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_role_add FROM ins;

  -- ROLE — REMOVE leavers (held the role, no longer match).
  WITH del AS (
    DELETE FROM public.user_roles ur
    WHERE ur.role_id = v_role_id
      AND NOT EXISTS (SELECT 1 FROM _mba_fac_match m WHERE m.user_id = ur.user_id)
    RETURNING 1
  )
  SELECT count(*) INTO v_role_del FROM del;

  SELECT count(*) INTO v_role_tot FROM public.user_roles WHERE role_id = v_role_id;

  RETURN QUERY SELECT v_role_add, v_role_del, v_role_tot;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_faculty_sync() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_faculty_sync() TO service_role;

-- ============================================================================
-- End Faculty-role migration.
-- ============================================================================
