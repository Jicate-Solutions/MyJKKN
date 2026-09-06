-- ============================================================================
-- One person, a leadership post at MORE THAN ONE college.
--
-- Date: 2026-08-05
-- Status: **FILE ONLY / NOT APPLIED TO PRODUCTION.**
--         Nothing in this file has been run against kvizhngldtiuufknvehv, not
--         even inside a BEGIN..ROLLBACK. Apply is Director-gated. The header and
--         supabase/SQL_FILE_INDEX.md must continue to agree.
--
-- THE DECISION THIS SERVES
-- ------------------------
-- Dr Dhanasekar Balakrishnan (dentalprincipal@jkkn.ac.in) is Principal of JKKN
-- Dental College AND of JKKN College of Allied Health Sciences
-- (9c1554e8-12a2-4b76-a9d6-8242bb05eba1). Today that is not merely unrecorded —
-- it is unrecordABLE.
--
-- WHY IT IS IMPOSSIBLE TODAY
-- --------------------------
-- Read from 20260809101500_college_leadership.sql, which is the file that
-- introduced both functions:
--
--   * public.user_roles is (id, user_id, role_id, is_primary, assigned_at,
--     assigned_by). There is NO institution column. The 'principal' role is one
--     GLOBAL row per person.
--   * fn_get_college_leadership resolves the Principal with
--       JOIN profiles p ON p.id = ur.user_id
--       WHERE cr.role_key = 'principal' AND p.institution_id = p_institution_id
--   * fn_set_college_leadership RAISES check_violation when
--     profiles.institution_id <> p_institution_id.
--
-- So "Principal of college X" is DERIVED — a global role row crossed with a
-- SINGLE-VALUED profiles.institution_id — and never stored. A single-valued
-- column cannot hold two colleges, which is why exactly one college per person
-- is not a policy but an arithmetic consequence. Widening the guard alone would
-- not help: the READ would still resolve him at whichever one college his
-- profile names.
--
-- WHAT THIS FILE DOES
-- -------------------
-- Gives the post a home of its own — public.institution_leadership, one row per
-- (college x post) — and teaches both functions to prefer that row while still
-- honouring the derived answer where no row exists yet.
--
-- THE FALLBACK IS NOT OPTIONAL. Ten people hold 'principal' in production today
-- and NONE of them has an institution_leadership row, because the table does not
-- exist yet. A read that consulted only the new table would blank all ten
-- colleges the moment it was applied. Every principal/vice_principal read below
-- is COALESCE(explicit row, the existing derived query) — the derived query is
-- copied verbatim from 20260809101500 rather than paraphrased, so it cannot
-- drift.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------
-- It does not backfill. Nothing writes an institution_leadership row for the ten
-- sitting principals: the fallback already answers for them, and inventing ten
-- rows would assert an assignment nobody made, with an assigned_by nobody is.
-- The first row appears the first time a human uses the screen.
--
-- It does not touch the IQAC or department-head branches — those already store
-- the post against the college (accreditation_committees.institution_id,
-- departments.id) and were never single-valued.
--
-- It grants no permission to any role. organizations.leadership.manage is
-- registered in lib/constants/permissions.ts and held by nobody; who holds it
-- stays a Director decision in Role Management, not something smuggled into a
-- migration.
--
-- ORDERING
-- --------
-- This file is 20260809102100 and REQUIRES 20260809101500 to have been applied
-- first — it replaces two of that file's functions and calls a third
-- (fn_college_leadership_can_manage). Section 0 refuses to apply otherwise,
-- loudly, rather than leaving a CREATE OR REPLACE pointing at a function that
-- is not there.
--
-- CORRECTION 2026-08-05: an earlier draft of this header stated that
-- 20260809101500 was "still NOT APPLIED". That was WRONG — it was read from the
-- repo file's own stale status line, not from the database. Verified live
-- against production by catalog: all four of its functions exist and are
-- SECURITY DEFINER (fn_college_leadership_can_manage, fn_list_leadership_colleges,
-- fn_get_college_leadership, fn_set_college_leadership), and its data half ran
-- too — the vice_principal custom_role is live with institution_scope='own'.
-- Independently corroborated by calling fn_get_college_leadership and
-- fn_set_college_leadership over PostgREST as a real signed-in user; a
-- file-only function cannot be called. 20260809101500 shipped in PR #2829,
-- merged 2026-08-05T01:42:15Z.
--
-- So this file has no unapplied prerequisite. Section 0 stays anyway: it costs
-- nothing when the prerequisite is present, and it is the correct guard for a
-- from-scratch replay (db reset / fresh CI database) where ordering is real.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Refuse to apply out of order.
--
-- CREATE OR REPLACE FUNCTION does not resolve the functions a body calls, so an
-- out-of-order apply would succeed here and fail at the first click instead.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.fn_college_leadership_can_manage(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'REFUSING TO APPLY: 20260809101500_college_leadership.sql must be applied '
      'first — fn_college_leadership_can_manage(uuid) does not exist, and every '
      'function in this file calls it.';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1. Where a post now lives.
--
-- One row per (college, post, holder). The post belongs to the COLLEGE, so a
-- person can appear in as many rows as they hold posts — which is the whole
-- point of this file.
--
-- Only 'principal' and 'vice_principal' are storable here. The other three
-- positions fn_set_college_leadership accepts (iqac_chair, iqac_coordinator,
-- department_head) already have college-scoped homes and are untouched; letting
-- them in would create a second place to look for the same fact.
--
-- History is kept by flipping is_active rather than deleting: "who was Principal
-- when this NAAC cycle was signed off" is a question the accreditation lane asks,
-- and a deleted row cannot answer it. The uniqueness that matters is therefore
-- partial — one LIVE holder per (college, post), any number of retired ones.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_leadership (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  position       text NOT NULL CHECK (position IN ('principal', 'vice_principal')),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  -- SET NULL, not CASCADE: if the person who made the appointment later leaves
  -- the platform, the appointment itself is still true. CASCADE here would erase
  -- a sitting Principal because their appointer was deleted.
  assigned_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_leadership_live_post_key
  ON public.institution_leadership (institution_id, position)
  WHERE is_active;

-- Answering "does this person still hold the post at ANOTHER college?" is on the
-- hot path of every vacate, and it is the question that decides whether a
-- user_roles row is deleted. Indexed so it is never a sequential scan.
CREATE INDEX IF NOT EXISTS institution_leadership_user_position_idx
  ON public.institution_leadership (user_id, position)
  WHERE is_active;

COMMENT ON TABLE public.institution_leadership IS
  'Principal / Vice Principal held AT A COLLEGE. user_roles carries the global '
  'role (one row per person, no institution column) and profiles.institution_id '
  'is single-valued, so before this table "Principal of college X" was derived '
  'and one person could hold it at exactly one college. Rows here are the '
  'authoritative answer; where none exists the old derived query still answers, '
  'which is what keeps the 10 pre-existing principals visible.';

COMMENT ON COLUMN public.institution_leadership.is_active IS
  'false = vacated, kept for history. The partial unique index allows one live '
  'holder per (institution, position) and any number of retired ones.';


-- ----------------------------------------------------------------------------
-- 2. Table privileges.
--
-- REVOKE FIRST, then grant. Supabase ships
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated — so this table is born with SELECT/INSERT/UPDATE/DELETE granted
-- to the anon key embedded in every page of https://www.jkkn.ai, and a bare
-- "GRANT SELECT TO authenticated" would be a no-op over an existing ALL.
--
-- Only SELECT is handed back. Every write goes through
-- fn_set_college_leadership, which is the single audited path; a client that
-- could INSERT directly could appoint itself Principal.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.institution_leadership FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.institution_leadership FROM authenticated;
GRANT  SELECT ON TABLE public.institution_leadership TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. RLS.
--
-- The table privilege above already keeps writes out. RLS is the second door:
-- it is what keeps one signed-in college out of another's rows, and it is what
-- applies if a later migration widens the grant. Policy shape is the repo
-- standard — super admin, admin, or the scoped permission.
-- ----------------------------------------------------------------------------
ALTER TABLE public.institution_leadership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS institution_leadership_select_permission ON public.institution_leadership;
CREATE POLICY institution_leadership_select_permission
  ON public.institution_leadership
  FOR SELECT
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
         COALESCE(public.user_has_permission('organizations.leadership.manage'), false)
     AND COALESCE(public.role_has_institution_access(institution_id), false)
       )
  );

DROP POLICY IF EXISTS institution_leadership_insert_permission ON public.institution_leadership;
CREATE POLICY institution_leadership_insert_permission
  ON public.institution_leadership
  FOR INSERT
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
         COALESCE(public.user_has_permission('organizations.leadership.manage'), false)
     AND COALESCE(public.role_has_institution_access(institution_id), false)
       )
  );

DROP POLICY IF EXISTS institution_leadership_update_permission ON public.institution_leadership;
CREATE POLICY institution_leadership_update_permission
  ON public.institution_leadership
  FOR UPDATE
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
         COALESCE(public.user_has_permission('organizations.leadership.manage'), false)
     AND COALESCE(public.role_has_institution_access(institution_id), false)
       )
  );

DROP POLICY IF EXISTS institution_leadership_delete_permission ON public.institution_leadership;
CREATE POLICY institution_leadership_delete_permission
  ON public.institution_leadership
  FOR DELETE
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
         COALESCE(public.user_has_permission('organizations.leadership.manage'), false)
     AND COALESCE(public.role_has_institution_access(institution_id), false)
       )
  );


-- ----------------------------------------------------------------------------
-- 4. Reading one college — explicit row first, derived answer as the fallback.
--
-- Replaces the body from 20260809101500. Everything except the two COALESCEs is
-- carried over unchanged, including the authorisation, the committee lookup and
-- the department roster, so a reader can diff the two and see only what moved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_college_leadership(
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name        text;
  v_committee   uuid;
  v_result      jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have access to leadership for this institution. Ask a super '
      'admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT i.name INTO v_name
    FROM public.institutions i WHERE i.id = p_institution_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ac.id INTO v_committee
    FROM public.accreditation_committees ac
   WHERE ac.institution_id = p_institution_id
     AND ac.body_code = 'NAAC'
     AND ac.committee_type = 'main'
     AND ac.is_active
   ORDER BY ac.created_at
   LIMIT 1;

  SELECT jsonb_build_object(
    'institution_id',   p_institution_id,
    'institution_name', v_name,
    'committee_id',     v_committee,

    -- COALESCE, not a UNION: the explicit row is the recorded decision and must
    -- win. The second arm is the pre-existing derived query, verbatim. Ten live
    -- principals have no row here — drop that arm and all ten colleges read
    -- "Not assigned" the day this is applied.
    'principal', COALESCE(
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.institution_leadership il
          JOIN public.profiles p ON p.id = il.user_id
         WHERE il.institution_id = p_institution_id
           AND il.position = 'principal'
           AND il.is_active
         ORDER BY il.assigned_at DESC
         LIMIT 1
      ),
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          JOIN public.profiles p      ON p.id  = ur.user_id
         WHERE cr.role_key = 'principal' AND p.institution_id = p_institution_id
         ORDER BY ur.assigned_at DESC NULLS LAST
         LIMIT 1
      )
    ),
    'vice_principal', COALESCE(
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.institution_leadership il
          JOIN public.profiles p ON p.id = il.user_id
         WHERE il.institution_id = p_institution_id
           AND il.position = 'vice_principal'
           AND il.is_active
         ORDER BY il.assigned_at DESC
         LIMIT 1
      ),
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          JOIN public.profiles p      ON p.id  = ur.user_id
         WHERE cr.role_key = 'vice_principal' AND p.institution_id = p_institution_id
         ORDER BY ur.assigned_at DESC NULLS LAST
         LIMIT 1
      )
    ),
    'iqac_chair', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.accreditation_committees ac
        JOIN public.profiles p ON p.id = ac.chair_user_id
       WHERE ac.id = v_committee
    ),
    'iqac_coordinator', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.accreditation_committee_members m
        JOIN public.profiles p ON p.id = m.user_id
       WHERE m.committee_id = v_committee
         AND m.role = 'coordinator'
         AND m.is_active
       ORDER BY m.joined_at DESC NULLS LAST
       LIMIT 1
    ),

    'departments', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'department_id',   d.id,
                 'department_name', d.department_name,
                 'department_code', d.department_code,
                 'head_user_id',    d.head_of_department_id,
                 'head_name',       hp.full_name,
                 'head_email',      hp.email
               ) ORDER BY d.department_name
             )
        FROM public.departments d
        LEFT JOIN public.profiles hp ON hp.id = d.head_of_department_id
       WHERE d.institution_id = p_institution_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_college_leadership(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_college_leadership(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_get_college_leadership(uuid) IS
  'Full leadership roster for one college: Principal, Vice Principal, IQAC '
  'Chairman, IQAC Coordinator and every department with its Head. Principal and '
  'Vice Principal read COALESCE(institution_leadership row, the older derived '
  'user_roles x profiles.institution_id query) — the fallback is what keeps the '
  '10 principals who predate the table visible. Unfilled posts come back as '
  'JSON null so the screen can render an explicit "Not assigned".';


-- ----------------------------------------------------------------------------
-- 5. Who may be named to a post at this college.
--
-- New. The screen previously read profiles directly with
-- .eq('institution_id', institutionId), which is precisely the filter that made
-- Dr Dhanasekar invisible in the Allied Health picker: his profile names Dental.
-- A widened write path that nobody can reach through the picker is not a fix.
--
-- SECURITY DEFINER for the same reason every other read on this screen is: it
-- must consult user_institution_access, whose RLS an ordinary college officer
-- does not satisfy, and RLS denial is silent — a direct read would return a
-- short list with error = null and look like "that person does not exist here".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_list_leadership_candidates(
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have access to leadership for this institution. Ask a super '
      'admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Exactly the two ways fn_set_college_leadership accepts a person, so the
  -- picker and the guard can never disagree about who is eligible.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('id', x.id, 'full_name', x.full_name, 'email', x.email)
             ORDER BY x.full_name NULLS LAST, x.email NULLS LAST
           ),
           '[]'::jsonb
         )
    INTO v_result
    FROM (
      SELECT DISTINCT p.id, p.full_name, p.email
        FROM public.profiles p
       WHERE p.is_active
         AND (
              p.institution_id = p_institution_id
           OR EXISTS (
                SELECT 1
                  FROM public.user_institution_access uia
                 WHERE uia.user_id        = p.id
                   AND uia.institution_id = p_institution_id
                   AND uia.is_active
              )
         )
    ) x;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_leadership_candidates(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_leadership_candidates(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_list_leadership_candidates(uuid) IS
  'People who may be named to a leadership post at this college: profile '
  'attached to it, OR holding an active user_institution_access grant for it. '
  'Mirrors fn_set_college_leadership''s eligibility test exactly so the picker '
  'never offers someone the write path would refuse, and never hides someone it '
  'would accept.';


-- ----------------------------------------------------------------------------
-- 6. The write path.
--
-- Replaces the body from 20260809101500. Three changes, everything else carried
-- over unchanged (including every comment on the is_primary handling, which
-- documents a real defect that suite T4 caught):
--
--   (a) ELIGIBILITY — a person qualifies for a college if their profile names it
--       OR they hold an active user_institution_access grant for it. Still an
--       outright refusal when neither holds, naming both the person and the
--       college; a silent no-op would leave the screen showing a successful save
--       over an empty post.
--
--   (b) VACATE — scoped to institution_leadership for THIS college. The global
--       user_roles row is removed ONLY when the outgoing holder no longer holds
--       the post anywhere else. Deleting it while they are still Principal at
--       another college would blank that other college, which is the exact
--       failure this file exists to prevent.
--
--   (c) WRITE — the post is written to institution_leadership. The user_roles
--       row is still granted, because permissions come from it and the derived
--       read still consults it, but idempotently: Dr Dhanasekar already holds
--       'principal', so naming him at a second college must not collide.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_college_leadership(
  p_institution_id uuid,
  p_position       text,
  p_user_id        uuid DEFAULT NULL,
  p_department_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_inst_name    text;
  v_role_id      uuid;
  v_role_key     text;
  v_subject_inst uuid;
  v_subject_name text;
  v_has_grant    boolean;
  v_committee    uuid;
  v_dept_inst    uuid;
  v_dept_name    text;
  v_outgoing     uuid[];
  v_holder       uuid;
BEGIN
  -- --- authorise once ------------------------------------------------------
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have permission to change leadership for this institution. '
      'Ask a super admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_position NOT IN ('principal', 'vice_principal', 'iqac_chair',
                        'iqac_coordinator', 'department_head') THEN
    RAISE EXCEPTION 'Unknown leadership position: %', p_position
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT i.name INTO v_inst_name
    FROM public.institutions i WHERE i.id = p_institution_id;
  IF v_inst_name IS NULL THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  -- --- the person must be attached to THIS college -------------------------
  -- Two ways to qualify, because profiles.institution_id is single-valued and
  -- somebody who serves two colleges can only ever name one of them there.
  -- user_institution_access is the platform's existing, auditable record of the
  -- second attachment (granted_by, granted_at, is_active) — this file invents no
  -- new way to say "this person belongs here".
  --
  -- Refused outright, never silently ignored: a no-op here would leave the
  -- screen showing a successful save and the post still empty.
  IF p_user_id IS NOT NULL THEN
    SELECT p.institution_id, COALESCE(p.full_name, p.email, 'that person')
      INTO v_subject_inst, v_subject_name
      FROM public.profiles p WHERE p.id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That person has no MyJKKN profile.'
        USING ERRCODE = 'no_data_found';
    END IF;

    v_has_grant := EXISTS (
      SELECT 1
        FROM public.user_institution_access uia
       WHERE uia.user_id        = p_user_id
         AND uia.institution_id = p_institution_id
         AND uia.is_active
    );

    IF (v_subject_inst IS NULL OR v_subject_inst <> p_institution_id)
       AND NOT v_has_grant THEN
      RAISE EXCEPTION
        '% is not attached to %. Their profile belongs to another institution '
        'and they hold no active institution-access grant for %. Grant them '
        'access to it, or move their profile there, and try again.',
        v_subject_name, v_inst_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ==========================================================================
  -- Principal / Vice Principal -> institution_leadership (+ user_roles)
  -- ==========================================================================
  IF p_position IN ('principal', 'vice_principal') THEN
    v_role_key := p_position;

    SELECT cr.id INTO v_role_id
      FROM public.custom_roles cr
     WHERE cr.role_key = v_role_key AND cr.is_active;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'The % role does not exist or is inactive.', v_role_key
        USING ERRCODE = 'no_data_found';
    END IF;

    -- Who currently holds this post AT THIS COLLEGE, by either route: an
    -- explicit row, or the derived answer that still stands for the principals
    -- who predate this table. Collected first rather than deleted inside a
    -- cursor over the same tables.
    SELECT COALESCE(array_agg(DISTINCT s.holder), '{}')
      INTO v_outgoing
      FROM (
        SELECT il.user_id AS holder
          FROM public.institution_leadership il
         WHERE il.institution_id = p_institution_id
           AND il.position       = v_role_key
           AND il.is_active
        UNION
        SELECT ur.user_id
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.id = ur.user_id
         WHERE ur.role_id = v_role_id
           AND pr.institution_id = p_institution_id
      ) s
     WHERE (p_user_id IS NULL OR s.holder <> p_user_id);

    -- Vacate the post AT THIS COLLEGE ONLY. Retired, not deleted, so the
    -- history survives; the partial unique index counts only live rows.
    UPDATE public.institution_leadership
       SET is_active  = false,
           updated_at = now()
     WHERE institution_id = p_institution_id
       AND position       = v_role_key
       AND is_active
       AND (p_user_id IS NULL OR user_id <> p_user_id);

    FOREACH v_holder IN ARRAY v_outgoing
    LOOP
      -- THE POINT OF THIS FILE. user_roles has no institution column, so its row
      -- is the person's claim to the post EVERYWHERE. Deleting it because they
      -- were replaced at one college would strip them at every other. Keep it
      -- whenever they still hold the post elsewhere — by an explicit row at
      -- another college, or by the derived route (their profile names a
      -- different college, which is where the old query still resolves them).
      IF EXISTS (
           SELECT 1 FROM public.institution_leadership il
            WHERE il.user_id  = v_holder
              AND il.position = v_role_key
              AND il.is_active
              AND il.institution_id <> p_institution_id
         )
         OR EXISTS (
           SELECT 1 FROM public.profiles pr
            WHERE pr.id = v_holder
              AND pr.institution_id IS NOT NULL
              AND pr.institution_id <> p_institution_id
         )
      THEN
        CONTINUE;
      END IF;

      DELETE FROM public.user_roles
       WHERE user_id = v_holder AND role_id = v_role_id;

      -- Deleting the row does not undo profiles.role, because
      -- sync_primary_role_to_profile only fires on INSERT/UPDATE. Promote a
      -- role the person still holds so the legacy field stops claiming a post
      -- they no longer hold. If they hold nothing else there is nothing to
      -- promote to and profiles.role is left alone rather than guessed at.
      UPDATE public.user_roles ur
         SET is_primary = true
       WHERE ur.id = (
         SELECT ur2.id FROM public.user_roles ur2
          WHERE ur2.user_id = v_holder
          ORDER BY ur2.assigned_at DESC NULLS LAST
          LIMIT 1
       )
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur3
            WHERE ur3.user_id = v_holder AND ur3.is_primary
         );
    END LOOP;

    IF p_user_id IS NOT NULL THEN
      -- The post itself. Step 1 retired every other live holder, so the only row
      -- this can collide with is one naming the same person again — which is a
      -- re-save, and must succeed quietly rather than raise.
      INSERT INTO public.institution_leadership (
        institution_id, position, user_id, assigned_by, is_active
      )
      VALUES (p_institution_id, v_role_key, p_user_id, v_actor, true)
      ON CONFLICT (institution_id, position) WHERE is_active
      DO UPDATE SET user_id     = EXCLUDED.user_id,
                    assigned_by = EXCLUDED.assigned_by,
                    assigned_at = now(),
                    updated_at  = now();

      -- is_primary differs BY DESIGN between the two posts.
      --
      -- Principal: true. All 10 live principal rows are is_primary=true, and
      -- the sync trigger then writes profiles.role='principal', which legacy
      -- policies such as institutions_select_faculty_hod_principal still read.
      -- A principal assigned here must behave exactly like the 10 already
      -- there.
      --
      -- Vice Principal: false. The post is brand new, nothing legacy reads it,
      -- and making it primary would overwrite profiles.role — silently
      -- stripping the person of whatever they were before (Senior Learner,
      -- Head of Department) and
      -- demoting their existing primary row. Permissions still apply: multiple
      -- roles merge with OR.
      --
      -- Demote the incoming person's existing primary FIRST. user_roles carries
      -- `idx_user_roles_primary_unique` — UNIQUE (user_id) WHERE is_primary —
      -- which is enforced during the INSERT itself, whereas the trigger that
      -- demotes the old primary (sync_primary_role_trigger) is an AFTER
      -- trigger and does not run until the row is already in. Without this
      -- line, naming a Principal who already holds any primary role (that is:
      -- essentially everyone — 86 of 102 HoDs are primary) fails outright with
      -- a duplicate-key error. Caught by the offline behaviour suite, T4.
      --
      -- Setting is_primary = false does not fire the sync trigger's body: it
      -- only acts when NEW.is_primary is true.
      IF v_role_key = 'principal' THEN
        UPDATE public.user_roles
           SET is_primary = false
         WHERE user_id = p_user_id AND is_primary = true;
      END IF;

      -- IDEMPOTENT ON PURPOSE. user_roles_unique_assignment is UNIQUE
      -- (user_id, role_id), and a second college for a sitting Principal means
      -- the row is already there — a plain INSERT would raise 23505 and the save
      -- would fail. DO UPDATE rather than DO NOTHING because the demotion
      -- immediately above has just cleared this person's primary flag: DO
      -- NOTHING would leave them holding no primary role at all, and
      -- profiles.role would stop tracking the post.
      INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
      VALUES (p_user_id, v_role_id, (v_role_key = 'principal'), v_actor)
      ON CONFLICT (user_id, role_id) DO UPDATE
        SET is_primary  = EXCLUDED.is_primary,
            assigned_by = EXCLUDED.assigned_by;
    END IF;

  -- ==========================================================================
  -- IQAC Chairman / Coordinator -> accreditation_committees(+ _members)
  -- ==========================================================================
  ELSIF p_position IN ('iqac_chair', 'iqac_coordinator') THEN
    SELECT ac.id INTO v_committee
      FROM public.accreditation_committees ac
     WHERE ac.institution_id = p_institution_id
       AND ac.body_code = 'NAAC'
       AND ac.committee_type = 'main'
       AND ac.is_active
     ORDER BY ac.created_at
     LIMIT 1;

    -- Twelve of thirteen colleges have no committee row at all, so the row is
    -- created on demand the first time somebody is named to it — and only
    -- then, so clearing an empty post never manufactures an empty committee.
    -- Shape copied from the one live row (JKKN College of Arts and Science
    -- (Self)) so the estate stays uniform. committee_type='main' also keeps
    -- clear of accreditation_committees_cluster_needs_members, which demands
    -- two or more member institutions for type 'cluster'.
    IF v_committee IS NULL THEN
      IF p_user_id IS NULL THEN
        RETURN jsonb_build_object(
          'ok', true, 'position', p_position, 'user_id', NULL,
          'committee_id', NULL,
          'message', 'Nothing to clear — this college has no IQAC committee yet.'
        );
      END IF;

      INSERT INTO public.accreditation_committees (
        institution_id, body_code, committee_name, committee_type,
        formed_at, is_active
      )
      VALUES (
        p_institution_id, 'NAAC',
        'Internal Quality Assurance Cell (IQAC)', 'main',
        CURRENT_DATE, true
      )
      RETURNING id INTO v_committee;
    END IF;

    IF p_position = 'iqac_chair' THEN
      UPDATE public.accreditation_committees
         SET chair_user_id = p_user_id,
             updated_at    = now()
       WHERE id = v_committee;
    ELSE
      -- Retire whoever currently coordinates before naming the replacement.
      -- There is no unique index on (committee_id, role), so without this a
      -- college would quietly accumulate several live coordinators.
      UPDATE public.accreditation_committee_members
         SET is_active = false
       WHERE committee_id = v_committee
         AND role = 'coordinator'
         AND is_active
         AND (p_user_id IS NULL OR user_id IS DISTINCT FROM p_user_id);

      IF p_user_id IS NOT NULL THEN
        INSERT INTO public.accreditation_committee_members (
          committee_id, user_id, role, joined_at, is_active, is_external
        )
        VALUES (v_committee, p_user_id, 'coordinator', CURRENT_DATE, true, false)
        ON CONFLICT (committee_id, user_id, joined_at) DO UPDATE
          SET role = 'coordinator', is_active = true;
      END IF;
    END IF;

  -- ==========================================================================
  -- Head of Department -> departments.head_of_department_id
  -- ==========================================================================
  ELSE
    IF p_department_id IS NULL THEN
      RAISE EXCEPTION 'Which department? p_department_id is required.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT d.institution_id, d.department_name
      INTO v_dept_inst, v_dept_name
      FROM public.departments d WHERE d.id = p_department_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No such department.' USING ERRCODE = 'no_data_found';
    END IF;

    -- The department must belong to the institution the caller was authorised
    -- for. Without this, anyone cleared for one college could set the Head of
    -- a department in any other by passing its id.
    IF v_dept_inst IS DISTINCT FROM p_institution_id THEN
      RAISE EXCEPTION
        'Department % does not belong to %.', v_dept_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.departments
       SET head_of_department_id = p_user_id,
           updated_at            = now()
     WHERE id = p_department_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'position',      p_position,
    'institution_id', p_institution_id,
    'department_id', p_department_id,
    'user_id',       p_user_id,
    'committee_id',  v_committee
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid) IS
  'The only write path for the College Leadership screen. Principal / Vice '
  'Principal are written to institution_leadership (the post belongs to the '
  'college, so one person may hold it at several) and the global user_roles row '
  'is granted idempotently; it is removed on vacate ONLY when the outgoing '
  'holder holds the post at no other college. IQAC Chairman / Coordinator and '
  'Head of Department are unchanged. A person qualifies for a college by '
  'profiles.institution_id OR an active user_institution_access grant, and is '
  'refused outright otherwise. The actor is always auth.uid(); p_user_id is the '
  'person being placed, never the actor.';


-- ----------------------------------------------------------------------------
-- 7. Assert the locks actually took, in this transaction.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- and ALL on every new table, separate from PUBLIC. The REVOKEs above are not
-- optional and this block proves they landed.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
    'public.fn_get_college_leadership(uuid)',
    'public.fn_list_leadership_candidates(uuid)',
    'public.fn_set_college_leadership(uuid, text, uuid, uuid)'
  ];
  v_priv text;
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %, which the page calls', v_fn;
    END IF;
  END LOOP;

  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('anon', 'public.institution_leadership', v_priv) THEN
      RAISE EXCEPTION 'anon holds % on institution_leadership', v_priv;
    END IF;
  END LOOP;

  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('authenticated', 'public.institution_leadership', v_priv) THEN
      RAISE EXCEPTION
        'authenticated holds % on institution_leadership — every write must go '
        'through fn_set_college_leadership', v_priv;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.institution_leadership', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT institution_leadership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.institution_leadership'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on institution_leadership';
  END IF;
END $$;
