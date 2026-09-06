-- =====================================================================
-- JKKN identity — a third person kind: external_participant
-- =====================================================================
-- Course Events issues permanent IDs to external participants who are
-- neither learners nor staff. Rather than mint a second, differently
-- formatted identifier, this extends the existing register so there is
-- ONE pool and one format. An external participant who later enrols as a
-- learner keeps the same row and the same number — which is the whole
-- point of that register.
-- =====================================================================

-- 1. Third person kind ------------------------------------------------
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT jkkn_identities_person_kind_chk;

ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_person_kind_chk
  CHECK (person_kind IN ('learner','team_member','both','external_participant'));

-- 2. A link for a person who is neither a learner nor staff -----------
ALTER TABLE public.jkkn_identities
  ADD COLUMN IF NOT EXISTS profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_profile
  ON public.jkkn_identities (profile_id)
  WHERE profile_id IS NOT NULL;

COMMENT ON COLUMN public.jkkn_identities.profile_id IS
  'Link for an external participant, who has a profile but is neither a learner nor staff. Deliberately left unconstrained for the other kinds so that an external participant who later enrols keeps this row, this number, and both links.';

-- 3. Widen the link-shape CHECK ---------------------------------------
-- The first three clauses are preserved unchanged in meaning and
-- structure from the original migration; whitespace was realigned to
-- fit the longer 'external_participant' literal. Only the fourth clause
-- is new.
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT jkkn_identities_link_shape_chk;

ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_link_shape_chk CHECK (
       (person_kind = 'learner'              AND team_member_id     IS NULL)
    OR (person_kind = 'team_member'          AND learner_profile_id IS NULL)
    OR (person_kind = 'both')
    OR (person_kind = 'external_participant' AND learner_profile_id IS NULL
                                             AND team_member_id     IS NULL)
  );

-- 4. Widen the issuer -------------------------------------------------
-- This is a DROP, not a CREATE OR REPLACE. Adding a defaulted 4th
-- parameter alongside the 3-arg version creates an OVERLOAD: a
-- three-argument call would then match both and fail with 42725
-- "function is not unique". The old signature must go.
--
-- DROP FUNCTION also discards the function's ACL, so the REVOKE/GRANT is
-- re-applied below — without it EXECUTE reverts to PUBLIC, including anon.
DROP FUNCTION IF EXISTS public.fn_issue_jkkn_id(text, uuid, uuid);

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
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
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
  'Issues ONE permanent JKKN ID to a person who does not already hold one. Kinds: learner, team_member, both, external_participant (Course Events, 2026-08-13). Admin-gated on users.jkkn_id.issue. Numbers are drawn at random from 100000..999999 so an ID card never reveals intake volume or joining order.';

-- DROP FUNCTION discarded the ACL. Restore it.
REVOKE EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) TO authenticated;

-- 5. RLS on the new column --------------------------------------------
-- jkkn_identities policies gate on users.jkkn_id.view / .issue and are
-- column-agnostic, so adding profile_id needs no policy change. Asserted
-- in the verification step rather than assumed.
