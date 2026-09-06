-- ============================================================================
-- College Leadership — ask the question about the COLLEGE, not the person.
--
-- Date: 2026-08-04
-- Status: **FILE ONLY / NOT APPLIED TO PRODUCTION.**
--         Nothing in this file has been run against kvizhngldtiuufknvehv.
--         Tracked as NOT APPLIED in supabase/SQL_FILE_INDEX.md — the header and
--         the tracker must continue to agree.
--
-- THE PROBLEM
-- -----------
-- Leadership is stored on the PERSON and never asked about the COLLEGE, so the
-- gaps are invisible. Measured live 2026-08-04:
--
--   * 5 of 14 institutions have NO Principal — including the teaching colleges
--     JKKN College of Allied Health Sciences (10 departments) and JKKN College
--     of Education (2 departments).
--   * 82 of 89 departments have no Head. The 7 that do are all Pharmacy.
--   * 1 accreditation_committees row exists in the entire estate, at JKKN
--     College of Arts and Science (Self). Twelve colleges have none.
--   * Vice Principal has NO storage at all. Three people carry it as free text
--     in staff.designation, which nothing can read or enforce.
--
-- The IQAC rollout is blocked on this: the rule is "Principal chairs, Vice
-- Principal coordinates", and Vice Principal cannot be assigned.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------
-- It creates NO leadership table and adds NO institutions.principal_id.
-- Every position already has a home and this file writes to those homes:
--
--   Principal / Vice Principal  -> user_roles + custom_roles
--   IQAC Chairman               -> accreditation_committees.chair_user_id
--   IQAC Coordinator            -> accreditation_committee_members.role
--   Head of Department          -> departments.head_of_department_id
--
-- Duplicating an existing link is what PR #2800 correctly refused.
--
-- ============================================================================
-- WHY A SECURITY DEFINER FUNCTION AND NOT FIVE PERMISSION GRANTS
-- ============================================================================
-- Writing this one screen's data touches four tables whose RLS demands five
-- different keys:
--
--   departments UPDATE                    -> organizations.departments.edit
--   user_roles INSERT/UPDATE              -> roles.create / roles.edit
--   accreditation_committees INSERT       -> accreditation.naac.committees.create
--   accreditation_committees UPDATE       -> accreditation.naac.committees.edit
--   accreditation_committee_members       -> accreditation.naac.committees.edit
--
-- Verified live 2026-08-04: the `principal` role holds NONE of them —
-- roles.create=false, roles.edit=false, roles.assign=false,
-- organizations.departments.edit=false, accreditation.naac.committees.*=false.
--
-- Granting all five would hand a Principal global role-management. roles.create
-- and roles.edit are NOT institution-scoped — they govern every role in the
-- system, so a college Principal could edit super_admin. That is an
-- unacceptable over-grant for a scoped job.
--
-- The function restricts the writes by construction: it touches exactly the
-- five columns above and there is no path through it to any other row, table
-- or column. Callers need one key, organizations.leadership.manage, which
-- grants nothing anywhere else.
--
-- ============================================================================
-- WHY THERE ARE READ FUNCTIONS TOO (this was NOT in the original spec)
-- ============================================================================
-- The spec assumed only the WRITE path was blocked. It is not. Verified live
-- 2026-08-04, the READ path is blocked in the same way and it is worse:
--
--   user_roles SELECT  -> is_super_admin() OR is_admin() OR roles.edit
--                         ...otherwise a user sees ONLY THEIR OWN role row.
--   accreditation_committees / _members SELECT
--                      -> accreditation.naac.committees.view (+ inst access)
--
-- RLS denial is silent: it returns zero rows with error = NULL. A page that
-- read these tables directly would render "Not assigned" for a Principal who
-- IS assigned — a false vacancy, indistinguishable from a real one. Since the
-- entire point of the screen is to make real absence visible, showing
-- fabricated absence is worse than showing nothing. So reads go through
-- SECURITY DEFINER too, behind the identical authorisation check.
--
-- (institutions, profiles and departments are readable under existing policies;
-- they are folded into the same payload only so one authorisation decision
-- governs the whole screen rather than a mosaic of partial visibility.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The Vice Principal role.
--
-- Derived from the LIVE `principal` permissions JSONB rather than authored, so
-- no key is invented and the two roles cannot drift apart by transcription.
--
-- COPIED:   every key principal holds, including all 1,329 false entries, so
--           the role renders complete in Role Management.
-- WITHHELD: every key principal has TRUE that is an authority or destructive
--           action -- suffix .approve / .approve.<scope> / .reject / .delete /
--           .manage -- plus four appointment-and-broadcast keys named
--           explicitly (staff.create, staff.edit, staff.status_update,
--           notifications.send). Keys ending in .view are never withheld;
--           reading is not authority.
--
-- Live arithmetic 2026-08-04: principal has 247 true of 1,329 keys. The rule
-- withholds 40, leaving Vice Principal 207 true. Withheld include
-- hr.recruitment.approve, hr.recruitment.packages.approve,
-- academic.leaves.approve.institution, bos.meetings.approve,
-- learners.onboarding.delete and rcltp.config.manage.
--
-- This is a deliberately NARROW opening position for a role that has never
-- existed. Whoever the Director appoints can be widened in Role Management;
-- a role that starts too broad cannot be narrowed without taking something
-- away from someone already using it.
--
-- institution_scope = 'own' — a Vice Principal is a college officer, never
-- cross-institutional. This also matters mechanically: the
-- guard_no_privilege_escalation trigger on user_roles REFUSES to assign any
-- role whose scope is 'all' unless the actor is a super admin, so 'own' is
-- what keeps the function usable by a non-super-admin at all.
-- ----------------------------------------------------------------------------
INSERT INTO public.custom_roles (
  role_key, role_name, description, permissions,
  institution_scope, is_system_role, is_active
)
SELECT
  'vice_principal',
  'Vice Principal',
  'Deputy head of a college. Coordinates the IQAC under the Principal (who '
  || 'chairs it). Derived from the Principal role minus approval, deletion, '
  || 'management, staff-appointment and broadcast authority.',
  (
    SELECT jsonb_object_agg(
             e.key,
             CASE
               WHEN e.value = 'true'
                    AND e.key NOT LIKE '%.view'
                    AND (
                         e.key LIKE '%.approve'
                      OR e.key LIKE '%.approve.%'
                      OR e.key LIKE '%.reject'
                      OR e.key LIKE '%.delete'
                      OR e.key LIKE '%.manage'
                      OR e.key IN ('staff.create', 'staff.edit',
                                   'staff.status_update', 'notifications.send')
                    )
               THEN to_jsonb(false)
               ELSE to_jsonb(e.value = 'true')
             END
           )
    FROM public.custom_roles p, jsonb_each_text(p.permissions) e
    WHERE p.role_key = 'principal'
  ),
  'own',
  false,
  true
WHERE EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'principal')
  AND NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'vice_principal');

-- Fail loudly rather than leave the function pointing at a role that is not
-- there. A silent no-op here would surface much later as "Vice Principal
-- cannot be assigned", which is the exact bug this file exists to fix.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'vice_principal') THEN
    RAISE EXCEPTION 'vice_principal role was not created (is the principal role missing?)';
  END IF;
  IF (SELECT institution_scope FROM public.custom_roles WHERE role_key = 'vice_principal') <> 'own' THEN
    RAISE EXCEPTION 'vice_principal must be institution_scope=own';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Shared authorisation.
--
-- ONE decision, used by all three functions so the read and the write can
-- never disagree about who is allowed in.
--
-- Every guard is wrapped in COALESCE(..., false). is_admin() and
-- user_has_permission() can return NULL (no profile row, absent key), and in
-- SQL `NULL OR NULL` is NULL, not false — an un-COALESCEd guard would fall
-- through the IF NOT and grant access to exactly the users who have no
-- profile at all.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_college_leadership_can_manage(
  p_institution_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
         COALESCE(public.user_has_permission('organizations.leadership.manage'), false)
     AND COALESCE(public.role_has_institution_access(p_institution_id), false)
       ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_college_leadership_can_manage(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_college_leadership_can_manage(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_college_leadership_can_manage(uuid) IS
  'Single authorisation decision for the College Leadership screen, shared by '
  'the read and write functions so they cannot disagree. Super admin, admin, '
  'or organizations.leadership.manage scoped to an institution the caller may '
  'access. Every guard COALESCEd to false — a NULL guard grants access.';


-- ----------------------------------------------------------------------------
-- 3. Which colleges may this caller see, and how many holes does each have.
--
-- Drives the institution picker and the unfilled-count shown at the top of the
-- screen. Super admins and admins see every institution; everyone else sees
-- only those their role scope reaches.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_list_leadership_colleges()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT i.id, i.name
    FROM public.institutions i
    WHERE i.is_active
      AND public.fn_college_leadership_can_manage(i.id)
  ),
  counted AS (
    SELECT
      v.id,
      v.name,
      -- Scalar subqueries, never joins: institutions x profiles x user_roles x
      -- departments multiplies rows and inflates every count.
      (SELECT count(*) FROM public.user_roles ur
         JOIN public.custom_roles cr ON cr.id = ur.role_id
         JOIN public.profiles p      ON p.id  = ur.user_id
        WHERE cr.role_key = 'principal' AND p.institution_id = v.id) AS n_principal,
      (SELECT count(*) FROM public.user_roles ur
         JOIN public.custom_roles cr ON cr.id = ur.role_id
         JOIN public.profiles p      ON p.id  = ur.user_id
        WHERE cr.role_key = 'vice_principal' AND p.institution_id = v.id) AS n_vice,
      (SELECT count(*) FROM public.accreditation_committees ac
        WHERE ac.institution_id = v.id AND ac.is_active
          AND ac.chair_user_id IS NOT NULL) AS n_chair,
      (SELECT count(*) FROM public.accreditation_committee_members m
         JOIN public.accreditation_committees ac ON ac.id = m.committee_id
        WHERE ac.institution_id = v.id AND ac.is_active
          AND m.role = 'coordinator' AND m.is_active) AS n_coord,
      (SELECT count(*) FROM public.departments d
        WHERE d.institution_id = v.id) AS n_depts,
      (SELECT count(*) FROM public.departments d
        WHERE d.institution_id = v.id
          AND d.head_of_department_id IS NULL) AS n_depts_headless
    FROM visible v
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'institution_id',   c.id,
        'institution_name', c.name,
        'department_count', c.n_depts,
        'unfilled',         (CASE WHEN c.n_principal = 0 THEN 1 ELSE 0 END)
                          + (CASE WHEN c.n_vice      = 0 THEN 1 ELSE 0 END)
                          + (CASE WHEN c.n_chair     = 0 THEN 1 ELSE 0 END)
                          + (CASE WHEN c.n_coord     = 0 THEN 1 ELSE 0 END)
                          + c.n_depts_headless
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  FROM counted c;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_leadership_colleges() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_leadership_colleges() TO authenticated;

COMMENT ON FUNCTION public.fn_list_leadership_colleges() IS
  'Colleges the caller may manage leadership for, each with its count of '
  'unfilled positions (Principal, Vice Principal, IQAC Chairman, IQAC '
  'Coordinator + every headless department). SECURITY DEFINER because '
  'user_roles and accreditation_committees are not readable without '
  'roles.edit / accreditation.naac.committees.view, and RLS denial is silent — '
  'a direct read would report a filled post as empty.';


-- ----------------------------------------------------------------------------
-- 4. One college in full.
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

    'principal', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        JOIN public.profiles p      ON p.id  = ur.user_id
       WHERE cr.role_key = 'principal' AND p.institution_id = p_institution_id
       ORDER BY ur.assigned_at DESC NULLS LAST
       LIMIT 1
    ),
    'vice_principal', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        JOIN public.profiles p      ON p.id  = ur.user_id
       WHERE cr.role_key = 'vice_principal' AND p.institution_id = p_institution_id
       ORDER BY ur.assigned_at DESC NULLS LAST
       LIMIT 1
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
  'Chairman, IQAC Coordinator and every department with its Head. Unfilled '
  'posts come back as JSON null so the screen can render an explicit '
  '"Not assigned" rather than blank space.';


-- ----------------------------------------------------------------------------
-- 5. The single write path.
--
--   p_institution_id  the college being edited.
--   p_position        which post: principal | vice_principal | iqac_chair |
--                     iqac_coordinator | department_head
--   p_user_id         the person to PLACE IN the post. NULL clears it.
--   p_department_id   required when p_position = 'department_head'.
--
-- p_user_id is the SUBJECT of the change, never the actor. The actor is taken
-- from auth.uid() and cannot be supplied by the caller: a SECURITY DEFINER
-- function that accepts the user it should act as is an IDOR, because the
-- elevated privilege would then be steerable by whoever calls it.
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

  -- --- the person must belong to THIS college ------------------------------
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

    IF v_subject_inst IS NULL OR v_subject_inst <> p_institution_id THEN
      RAISE EXCEPTION
        '% belongs to a different institution and cannot hold a post at %. '
        'Move their profile to this institution first.',
        v_subject_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ==========================================================================
  -- Principal / Vice Principal -> user_roles
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

    -- Vacate the post at THIS college only. Scoped through profiles so a
    -- holder at another college is never touched. The outgoing holders are
    -- collected first rather than deleted inside a cursor over the same table.
    SELECT COALESCE(array_agg(ur.user_id), '{}')
      INTO v_outgoing
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role_id = v_role_id
       AND p.institution_id = p_institution_id
       AND (p_user_id IS NULL OR ur.user_id <> p_user_id);

    FOREACH v_holder IN ARRAY v_outgoing
    LOOP
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
  'The only write path for the College Leadership screen. Writes '
  'user_roles (Principal / Vice Principal), '
  'accreditation_committees.chair_user_id (IQAC Chairman), '
  'accreditation_committee_members.role (IQAC Coordinator) and '
  'departments.head_of_department_id (Head of Department). SECURITY DEFINER '
  'so a college officer needs one scoped key, organizations.leadership.manage, '
  'instead of five — two of which (roles.create / roles.edit) are not '
  'institution-scoped and would grant global role management. The actor is '
  'always auth.uid(); p_user_id is the person being placed, never the actor.';


-- ----------------------------------------------------------------------------
-- 6. Assert the locks actually took, in this transaction.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new
-- function, separate from PUBLIC. The REVOKEs above are not optional and this
-- block proves they landed.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
    'public.fn_college_leadership_can_manage(uuid)',
    'public.fn_list_leadership_colleges()',
    'public.fn_get_college_leadership(uuid)',
    'public.fn_set_college_leadership(uuid, text, uuid, uuid)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %, which the page calls', v_fn;
    END IF;
  END LOOP;
END $$;
