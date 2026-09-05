-- =====================================================================
-- Course Events — a Course Coordinator can finish an approval
-- Added: 2026-08-21
-- =====================================================================
-- SYMPTOM
-- A Course Coordinator opens /courses/<id>?tab=applications, clicks
-- "Approve & issue JKKN ID", and gets 42501 "Not authorised to issue a
-- JKKN ID". The application stays pending. An Administrator approving
-- the same row succeeds.
--
-- CAUSE
-- fn_course_approve_application is SECURITY DEFINER and gates on
-- courses.applications.decide, which the coordinator holds. Halfway
-- through it calls fn_issue_jkkn_id, which is ALSO SECURITY DEFINER and
-- runs its own gate on users.jkkn_id.issue. Nesting one definer function
-- inside another does not change auth.uid() — it is still the human who
-- clicked — so the inner gate re-evaluates against the coordinator and
-- raises.
--
-- 20260819120000 asserted "all 7 roles holding the former already hold
-- the latter". That count was taken with `permissions ? key`, which is
-- key PRESENCE. user_has_permission tests (permissions->>key)::boolean
-- = true. Role Management writes the whole catalogue — every key
-- present, most of them false — so presence proved nothing.
-- course_coordinator carries users.jkkn_id.issue with the value false.
--
-- WHY NOT SIMPLY GRANT users.jkkn_id.issue TO THE ROLE
-- That key is load-bearing in two places. It is the issuer's gate AND
-- the key on the jkkn_identities INSERT/UPDATE policies. Granting it
-- would let a coordinator mint a permanent lifetime number for any
-- learner or team member via fn_issue_jkkn_id('learner', ...), and write
-- or rewrite jkkn_identities rows straight through PostgREST. That is a
-- platform-wide identity capability, handed to a role scoped to one
-- course, to fix one button.
--
-- WHAT THIS DOES INSTEAD
-- Scopes the gate by kind. An external_participant identity is never
-- issued on its own: it exists only as one step inside
-- fn_course_approve_application, which has already established that the
-- caller may decide this application. So that kind — and only that kind
-- — additionally accepts courses.applications.decide. learner,
-- team_member and both stay exactly where they were, and the
-- jkkn_identities policies are not touched, so direct writes to that
-- table remain admin-only.
--
-- This also covers the next Role-Management-authored role to hold
-- courses.applications.decide without the identity key, rather than
-- patching one role's JSONB and waiting for the next report.
--
-- CREATE OR REPLACE, never DROP + CREATE: the signature is unchanged and
-- dropping the function would discard its EXECUTE grants, which revert
-- to PUBLIC on recreate.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_issue_jkkn_id(
  p_person_kind        text,
  p_learner_profile_id uuid DEFAULT NULL,
  p_team_member_id     uuid DEFAULT NULL,
  p_profile_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_attempt   int;
  v_six       text;
  v_candidate text;
  v_id        uuid;
  v_existing  text;
BEGIN
  -- IS NOT DISTINCT FROM, not `=`. With `=`, a NULL p_person_kind makes
  -- that term NULL; for a caller holding courses.applications.decide the
  -- whole OR chain evaluates to NULL, NOT NULL is NULL, and plpgsql
  -- treats IF NULL as false — the gate would fall through and pass
  -- silently. This codebase has been bitten by exactly that shape
  -- before. IS NOT DISTINCT FROM returns false for NULL, never NULL, so
  -- the gate fails closed.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
    OR (
      p_person_kind IS NOT DISTINCT FROM 'external_participant'
      AND public.user_has_permission('courses.applications.decide')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to issue a JKKN ID'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_kind IS NULL
     OR p_person_kind NOT IN ('learner','team_member','both','external_participant') THEN
    RAISE EXCEPTION 'person_kind must be learner, team_member, both or external_participant (got %)', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_person_kind IN ('learner', 'both') THEN
    IF p_learner_profile_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a learner profile', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.learners_profiles WHERE id = p_learner_profile_id) THEN
      RAISE EXCEPTION 'No learner profile %', p_learner_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_learner_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a learner profile', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_person_kind IN ('team_member', 'both') THEN
    IF p_team_member_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a team member', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_team_member_id) THEN
      RAISE EXCEPTION 'No team member %', p_team_member_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_team_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a team member', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- New kind: an external participant is anchored on a profile only.
  IF p_person_kind = 'external_participant' THEN
    IF p_profile_id IS NULL THEN
      RAISE EXCEPTION 'An external_participant identity needs a profile'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
      RAISE EXCEPTION 'No profile %', p_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an external_participant identity is issued against a profile'
      USING ERRCODE = '22023';
  END IF;

  -- One person, one number, for life.
  SELECT jkkn_id INTO v_existing
    FROM public.jkkn_identities
   WHERE (p_learner_profile_id IS NOT NULL AND learner_profile_id = p_learner_profile_id)
      OR (p_team_member_id     IS NOT NULL AND team_member_id     = p_team_member_id)
      OR (p_profile_id         IS NOT NULL AND profile_id         = p_profile_id)
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This person already holds JKKN ID %. A person is issued one number for life; to record a new capacity, update person_kind on the existing row.', btrim(v_existing)
      USING ERRCODE = '23505';
  END IF;

  FOR v_attempt IN 1..20 LOOP
    v_six       := (100000 + floor(random() * 900000))::int::text;
    v_candidate := v_six || '-' || public.fn_jkkn_id_check_digit(v_six);

    INSERT INTO public.jkkn_identities (
      jkkn_id, person_kind, learner_profile_id, team_member_id, profile_id, issued_by
    )
    VALUES (
      v_candidate, p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, auth.uid()
    )
    ON CONFLICT (jkkn_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok',          true,
        'identity_id', v_id,
        'jkkn_id',     v_candidate,
        'person_kind', p_person_kind,
        'attempts',    v_attempt
      );
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not find an unused JKKN ID in 20 attempts. The 900,000-number pool is close to exhausted or something is wrong.'
    USING ERRCODE = '53400';
END;
$fn$;

COMMENT ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) IS
  'Issues ONE permanent JKKN ID to a person who does not already hold one. Kinds: learner, team_member, both, external_participant (Course Events, 2026-08-13). Gated on users.jkkn_id.issue, EXCEPT the external_participant kind, which also accepts courses.applications.decide because it is only ever minted inside fn_course_approve_application by someone already entitled to decide that application. Numbers are drawn at random from 100000..999999 so an ID card never reveals intake volume or joining order.';
