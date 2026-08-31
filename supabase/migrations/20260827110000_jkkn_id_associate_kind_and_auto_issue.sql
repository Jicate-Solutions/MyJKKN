-- ============================================================================
-- JKKN ID: the 'associate' kind + automatic issuance
-- ============================================================================
-- The register (20260817040000/50000) shipped dormant, designed for deliberate
-- one-at-a-time issuance. On 2026-08-27 the Director's side chose to switch it
-- on and AUTOMATE issuance — a recorded design shift, not an accident:
--
--   1. A new person_kind 'associate' for profile-only internal users (admin /
--      management accounts that hold a custom role but are neither a learner
--      nor a team member), anchored on profiles.id like external_participant.
--   2. A private allocator, fn_jkkn_allocate, holding the one random-draw
--      insert loop. No permission gate of its own; EXECUTE revoked from every
--      role. Only reachable through the two SECURITY DEFINER callers below.
--   3. fn_issue_jkkn_id widened to issue 'associate' (still gated on
--      users.jkkn_id.issue) and delegating allocation to fn_jkkn_allocate.
--   4. Three AFTER triggers that auto-issue:
--        learners_profiles  → on reaching lifecycle_status admitted/active
--        staff              → on creation/activation (is_active = true)
--        user_roles         → on a custom-role grant to a profile-only user
--      The triggers carry NO permission gate on purpose: the write that fires
--      them (an admission, a hire, a role grant) is itself the authorised act.
--      Every trigger is fail-soft — an issuance failure RAISES A WARNING and
--      never blocks the parent write.
--   5. fn_resolve_person gains a third branch so associates (and external
--      participants) are findable by JKKN ID, email or name.
--
-- THE ONE UNRECOVERABLE ERROR here is one person holding two numbers (rows can
-- only be retired, never deleted). Both the learner and the staff triggers
-- therefore run the same overlap rule as scripts/backfill-jkkn-ids.ts before
-- minting: an exact normalised-email match against the other kind UPGRADES the
-- existing row to person_kind='both' instead of minting; an ambiguous match
-- (2+ candidates) skips with a WARNING for a human to resolve.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the person_kind and link-shape constraints
-- ----------------------------------------------------------------------------
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT IF EXISTS jkkn_identities_person_kind_chk;
ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_person_kind_chk
  CHECK (person_kind IN ('learner', 'team_member', 'both', 'external_participant', 'associate'));

-- First three clauses preserved VERBATIM from 20260817040000; the fourth from
-- 20260818000000; the fifth is new.
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT IF EXISTS jkkn_identities_link_shape_chk;
ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_link_shape_chk CHECK (
       (person_kind = 'learner'              AND team_member_id     IS NULL)
    OR (person_kind = 'team_member'          AND learner_profile_id IS NULL)
    OR (person_kind = 'both')
    OR (person_kind = 'external_participant' AND learner_profile_id IS NULL
                                             AND team_member_id     IS NULL)
    OR (person_kind = 'associate'            AND learner_profile_id IS NULL
                                             AND team_member_id     IS NULL)
  );

-- ----------------------------------------------------------------------------
-- 2. fn_jkkn_allocate — the one allocation loop, private
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER because its callers need to read and write jkkn_identities
-- regardless of the session's RLS standing (the INSERT policy requires
-- users.jkkn_id.issue, which a learner-import session does not hold).
-- p_issued_by NULL means "issued by the system" (a trigger), and is the only
-- way a NULL lands in issued_by.
CREATE OR REPLACE FUNCTION public.fn_jkkn_allocate(
  p_person_kind        text,
  p_learner_profile_id uuid,
  p_team_member_id     uuid,
  p_profile_id         uuid,
  p_issued_by          uuid
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
  -- One person, one number, for life. Refuse a second — the whole design
  -- rests on a learner who returns as a team member keeping the number they
  -- already have. (The partial unique indexes enforce this too; this check
  -- exists to fail with a sentence a human can act on.)
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
    -- 100000..999999 inclusive: random() is [0,1), so floor(random()*900000)
    -- is 0..899999.
    v_six       := (100000 + floor(random() * 900000))::int::text;
    v_candidate := v_six || '-' || public.fn_jkkn_id_check_digit(v_six);

    INSERT INTO public.jkkn_identities (
      jkkn_id, person_kind, learner_profile_id, team_member_id, profile_id, issued_by
    )
    VALUES (
      v_candidate, p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, p_issued_by
    )
    ON CONFLICT (jkkn_id) DO NOTHING
    RETURNING id INTO v_id;

    -- ON CONFLICT covers only a number collision. A one-person-one-number
    -- violation is a different unique index and is left to raise.
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

COMMENT ON FUNCTION public.fn_jkkn_allocate(text, uuid, uuid, uuid, uuid) IS
  'PRIVATE allocator behind fn_issue_jkkn_id and the auto-issue triggers. Draws a random unused JKKN ID and inserts the register row. Carries no permission gate of its own — EXECUTE is revoked from every client role; its callers own authorisation.';

REVOKE ALL ON FUNCTION public.fn_jkkn_allocate(text, uuid, uuid, uuid, uuid) FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. fn_issue_jkkn_id — widened for 'associate', allocation delegated
-- ----------------------------------------------------------------------------
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
BEGIN
  -- Two gates, not one — see 20260821070100 for the external_participant
  -- carve-out's rationale. 'associate' gets no carve-out: it is issued only
  -- under the global key (or by the trigger, which does not pass through
  -- here). IS NOT DISTINCT FROM, not `=`: with `=`, a NULL p_person_kind makes
  -- that term NULL, the OR chain evaluates to NULL, and plpgsql treats IF NULL
  -- as false — the gate would pass silently. This form fails closed.
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
     OR p_person_kind NOT IN ('learner','team_member','both','external_participant','associate') THEN
    RAISE EXCEPTION 'person_kind must be learner, team_member, both, external_participant or associate (got %)', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- The link shape must match the kind, and the person must actually exist.
  -- The table tolerates an orphaned link (a person record can be removed
  -- years later and the number must survive); issuance does not.
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

  -- Profile-anchored kinds: external_participant (Course Events, 2026-08-13)
  -- and associate (2026-08-27).
  IF p_person_kind IN ('external_participant', 'associate') THEN
    IF p_profile_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a profile', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
      RAISE EXCEPTION 'No profile %', p_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an external_participant or associate identity is issued against a profile'
      USING ERRCODE = '22023';
  END IF;

  RETURN public.fn_jkkn_allocate(
    p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, auth.uid()
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) IS
  'Issues ONE permanent JKKN ID to a person who does not already hold one. Kinds: learner, team_member, both, external_participant (Course Events, 2026-08-13), associate (profile-only internal users, 2026-08-27). Gated on users.jkkn_id.issue, EXCEPT the external_participant kind, which also accepts courses.applications.decide. Allocation itself lives in fn_jkkn_allocate; auto-issuance triggers call that allocator directly.';

REVOKE EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Auto-issue trigger functions
-- ----------------------------------------------------------------------------
-- All three are SECURITY DEFINER: their guard reads on jkkn_identities and
-- staff must see the whole table no matter who performed the parent write.
-- All three are fail-soft: EXCEPTION → WARNING, never a failed admission.

-- 4a. Learner reaches admitted/active.
CREATE OR REPLACE FUNCTION public.tg_jkkn_auto_issue_learner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emails   text[];
  v_match_id uuid;
  v_matches  int;
BEGIN
  -- Already holds a number (retired still counts as held — the remedy for a
  -- retired identity is a human decision, not a fresh mint).
  IF EXISTS (SELECT 1 FROM public.jkkn_identities WHERE learner_profile_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  -- The two-numbers guard: does a TEAM-MEMBER identity already exist for this
  -- same human? Same rule as scripts/backfill-jkkn-ids.ts — exact normalised
  -- email match, nothing weaker (phone can be a parent; name+DOB can be twins).
  v_emails := ARRAY(
    SELECT lower(btrim(e)) FROM unnest(ARRAY[NEW.student_email, NEW.college_email]) AS e
     WHERE e IS NOT NULL AND btrim(e) <> ''
  );

  IF array_length(v_emails, 1) IS NOT NULL THEN
    SELECT count(*), min(ji.id::text)::uuid
      INTO v_matches, v_match_id
      FROM public.jkkn_identities ji
      JOIN public.staff st ON st.id = ji.team_member_id
     WHERE ji.learner_profile_id IS NULL
       AND (lower(btrim(coalesce(st.institution_email, ''))) = ANY (v_emails)
         OR lower(btrim(coalesce(st.email, '')))             = ANY (v_emails));

    IF v_matches = 1 THEN
      UPDATE public.jkkn_identities
         SET learner_profile_id = NEW.id, person_kind = 'both'
       WHERE id = v_match_id;
      RETURN NULL;
    ELSIF v_matches > 1 THEN
      RAISE WARNING '[jkkn auto-issue] learner % matches % team-member identities by email — skipped, needs a human', NEW.id, v_matches;
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.fn_jkkn_allocate('learner', NEW.id, NULL, NULL, NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[jkkn auto-issue] learner % failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_jkkn_auto_issue_learner() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_learner ON public.learners_profiles;
CREATE TRIGGER trg_jkkn_auto_issue_learner
  AFTER INSERT OR UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  WHEN (NEW.lifecycle_status::text IN ('admitted', 'active'))
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_learner();

-- 4b. Team member created active, or activated.
CREATE OR REPLACE FUNCTION public.tg_jkkn_auto_issue_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emails   text[];
  v_match_id uuid;
  v_matches  int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.jkkn_identities WHERE team_member_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  -- Mirror of the learner guard: an existing LEARNER identity for the same
  -- email is upgraded to 'both', never joined by a second number.
  v_emails := ARRAY(
    SELECT lower(btrim(e)) FROM unnest(ARRAY[NEW.institution_email, NEW.email]) AS e
     WHERE e IS NOT NULL AND btrim(e) <> ''
  );

  IF array_length(v_emails, 1) IS NOT NULL THEN
    SELECT count(*), min(ji.id::text)::uuid
      INTO v_matches, v_match_id
      FROM public.jkkn_identities ji
      JOIN public.learners_profiles lp ON lp.id = ji.learner_profile_id
     WHERE ji.team_member_id IS NULL
       AND (lower(btrim(coalesce(lp.student_email, ''))) = ANY (v_emails)
         OR lower(btrim(coalesce(lp.college_email, ''))) = ANY (v_emails));

    IF v_matches = 1 THEN
      UPDATE public.jkkn_identities
         SET team_member_id = NEW.id, person_kind = 'both'
       WHERE id = v_match_id;
      RETURN NULL;
    ELSIF v_matches > 1 THEN
      RAISE WARNING '[jkkn auto-issue] team member % matches % learner identities by email — skipped, needs a human', NEW.id, v_matches;
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.fn_jkkn_allocate('team_member', NULL, NEW.id, NULL, NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[jkkn auto-issue] team member % failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_jkkn_auto_issue_team_member() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_team_member ON public.staff;
CREATE TRIGGER trg_jkkn_auto_issue_team_member
  AFTER INSERT OR UPDATE OF is_active ON public.staff
  FOR EACH ROW
  WHEN (NEW.is_active IS TRUE)
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_team_member();

-- 4c. Custom role granted to a profile-only user → 'associate'.
CREATE OR REPLACE FUNCTION public.tg_jkkn_auto_issue_associate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile record;
BEGIN
  SELECT id, email, learner_id INTO v_profile
    FROM public.profiles WHERE id = NEW.user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The learner and team-member lanes own issuance for their people: a
  -- learner-linked profile is issued at admission, and a profile whose email
  -- belongs to a staff row is issued at hire/activation (even if that staff
  -- row is inactive today).
  IF v_profile.learner_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF v_profile.email IS NOT NULL AND btrim(v_profile.email) <> '' AND EXISTS (
    SELECT 1 FROM public.staff st
     WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(v_profile.email))
        OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(v_profile.email))
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.jkkn_identities WHERE profile_id = v_profile.id) THEN
    RETURN NULL;
  END IF;

  PERFORM public.fn_jkkn_allocate('associate', NULL, NULL, v_profile.id, NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[jkkn auto-issue] associate (profile %) failed: %', NEW.user_id, SQLERRM;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_jkkn_auto_issue_associate() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_associate ON public.user_roles;
CREATE TRIGGER trg_jkkn_auto_issue_associate
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_associate();

-- ----------------------------------------------------------------------------
-- 5. fn_resolve_person — third branch: profile-anchored identities
-- ----------------------------------------------------------------------------
-- Learner and team-member branches preserved VERBATIM from 20260819010000.
-- The new associate_hits branch is an INNER join to jkkn_identities on
-- purpose: a profile is only findable here once it holds a register row, so
-- name search does not flood with every account in the cluster.
CREATE OR REPLACE FUNCTION public.fn_resolve_person(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_q        text := btrim(coalesce(p_query, ''));
  v_lower    text;
  v_digits   text;
  v_phone    text;
  v_all      boolean;
  v_results  jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  ) THEN
    RAISE EXCEPTION 'Not authorised to look people up'
      USING ERRCODE = '42501';
  END IF;

  v_all := COALESCE(public.is_super_admin(), false) OR public.is_admin();

  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object(
      'query', v_q, 'ok', true, 'results', '[]'::jsonb,
      'note', 'Type at least two characters.'
    );
  END IF;

  v_lower  := lower(v_q);
  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_phone  := CASE WHEN length(v_digits) >= 10 THEN right(v_digits, 10) END;

  -- A JKKN ID that fails its check digit is a typo, and is reported as one.
  IF v_q ~ '^[0-9]{6}-[0-9]$' AND NOT public.fn_jkkn_id_validate(v_q) THEN
    RETURN jsonb_build_object(
      'query',   v_q,
      'ok',      false,
      'error',   'invalid_check_digit',
      'message', 'That is not a valid JKKN ID — the check digit does not match, so at least one digit is wrong. Read it again from the card rather than searching for it.',
      'results', '[]'::jsonb
    );
  END IF;

  WITH learner_hits AS (
    SELECT
      lp.id,
      CASE
        WHEN ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q         THEN 'jkkn_id'
        WHEN lower(btrim(coalesce(lp.roll_number, '')))      = v_lower   THEN 'roll_number'
        WHEN lower(btrim(coalesce(lp.register_number, '')))  = v_lower   THEN 'register_number'
        WHEN lower(btrim(coalesce(lp.application_id, '')))   = v_lower   THEN 'application_number'
        WHEN lower(btrim(coalesce(lp.neet_roll_number, ''))) = v_lower   THEN 'neet_roll'
        WHEN v_phone IS NOT NULL
             AND right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) = v_phone
                                                                        THEN 'phone'
        WHEN lower(coalesce(lp.student_email, '')) = v_lower
          OR lower(coalesce(lp.college_email, '')) = v_lower             THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                                          THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      lp.first_name, lp.last_name, lp.student_photo_url, lp.institution_id,
      lp.program_id, ay.year AS admission_year, lp.lifecycle_status, lp.roll_number,
      lp.register_number, lp.application_id, ji.jkkn_id
    FROM public.learners_profiles lp
    LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
    LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
      AND (
           (ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q)
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(btrim(coalesce(lp.roll_number, '')))      = v_lower
        OR lower(btrim(coalesce(lp.register_number, '')))  = v_lower
        OR lower(btrim(coalesce(lp.application_id, '')))   = v_lower
        OR lower(btrim(coalesce(lp.neet_roll_number, ''))) = v_lower
        OR lower(coalesce(lp.student_email, ''))           = v_lower
        OR lower(coalesce(lp.college_email, ''))           = v_lower
        OR (v_phone IS NOT NULL
            AND right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  team_hits AS (
    SELECT
      st.id,
      CASE
        WHEN ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q      THEN 'jkkn_id'
        WHEN lower(btrim(coalesce(st.staff_id, '')))       = v_lower  THEN 'team_code'
        WHEN v_phone IS NOT NULL
             AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone
                                                                      THEN 'phone'
        WHEN lower(coalesce(st.email, ''))             = v_lower
          OR lower(coalesce(st.institution_email, '')) = v_lower       THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                                        THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      st.first_name, st.last_name, st.profile_picture, st.institution_id,
      st.designation, st.is_active, st.staff_id, ji.jkkn_id
    FROM public.staff st
    LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
    WHERE (v_all OR public.role_has_institution_access(st.institution_id))
      AND (
           (ji.jkkn_id IS NOT NULL AND btrim(ji.jkkn_id) = v_q)
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(btrim(coalesce(st.staff_id, ''))) = v_lower
        OR lower(coalesce(st.email, ''))             = v_lower
        OR lower(coalesce(st.institution_email, '')) = v_lower
        OR (v_phone IS NOT NULL
            AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  associate_hits AS (
    SELECT
      p.id,
      CASE
        WHEN btrim(ji.jkkn_id) = v_q                  THEN 'jkkn_id'
        WHEN lower(coalesce(p.email, '')) = v_lower   THEN 'email'
        WHEN EXISTS (
               SELECT 1 FROM public.jkkn_identity_aliases al
                WHERE al.jkkn_identity_id = ji.id
                  AND lower(btrim(al.alias_value)) = v_lower
             )                                        THEN 'alias'
        ELSE 'name'
      END AS matched_on,
      p.full_name, p.avatar_url, p.institution_id,
      ji.person_kind, ji.jkkn_id
    FROM public.profiles p
    JOIN public.jkkn_identities ji ON ji.profile_id = p.id
    WHERE ji.person_kind IN ('associate', 'external_participant')
      AND (v_all OR public.role_has_institution_access(p.institution_id))
      AND (
           btrim(ji.jkkn_id) = v_q
        OR EXISTS (
             SELECT 1 FROM public.jkkn_identity_aliases al
              WHERE al.jkkn_identity_id = ji.id
                AND lower(btrim(al.alias_value)) = v_lower
           )
        OR lower(coalesce(p.email, '')) = v_lower
        OR lower(coalesce(p.full_name, '')) LIKE '%' || v_lower || '%'
      )
    LIMIT 25
  ),
  merged AS (
    SELECT jsonb_build_object(
             'person_kind',      'learner',
             'person_id',        lh.id,
             'matched_on',       lh.matched_on,
             'full_name',        btrim(lh.first_name || ' ' || coalesce(lh.last_name, '')),
             'photo_url',        lh.student_photo_url,
             'institution_name', i.name,
             'programme',        pr.program_name,
             'admission_year',   lh.admission_year,
             'status',           lh.lifecycle_status::text,
             'jkkn_id',          btrim(lh.jkkn_id),
             'roll_number',      lh.roll_number,
             'register_number',  lh.register_number,
             'application_number', lh.application_id
           ) AS row_json
      FROM learner_hits lh
      LEFT JOIN public.institutions i ON i.id = lh.institution_id
      LEFT JOIN public.programs    pr ON pr.id = lh.program_id
    UNION ALL
    SELECT jsonb_build_object(
             'person_kind',      'team_member',
             'person_id',        th.id,
             'matched_on',       th.matched_on,
             'full_name',        btrim(th.first_name || ' ' || coalesce(th.last_name, '')),
             'photo_url',        th.profile_picture,
             'institution_name', i.name,
             'programme',        th.designation,
             'admission_year',   NULL,
             'status',           CASE WHEN th.is_active THEN 'active' ELSE 'inactive' END,
             'jkkn_id',          btrim(th.jkkn_id),
             'team_code',        th.staff_id
           ) AS row_json
      FROM team_hits th
      LEFT JOIN public.institutions i ON i.id = th.institution_id
    UNION ALL
    SELECT jsonb_build_object(
             'person_kind',      ah.person_kind,
             'person_id',        ah.id,
             'matched_on',       ah.matched_on,
             'full_name',        coalesce(btrim(ah.full_name), 'Name unavailable'),
             'photo_url',        ah.avatar_url,
             'institution_name', i.name,
             'programme',        NULL,
             'admission_year',   NULL,
             'status',           NULL,
             'jkkn_id',          btrim(ah.jkkn_id)
           ) AS row_json
      FROM associate_hits ah
      LEFT JOIN public.institutions i ON i.id = ah.institution_id
  )
  SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_results FROM merged;

  RETURN jsonb_build_object(
    'query',      v_q,
    'ok',         true,
    'results',    v_results,
    'count',      jsonb_array_length(v_results),
    'scope_note', CASE
                    WHEN v_all THEN 'Searched every institution.'
                    ELSE 'Searched only the institutions your role can see. Someone you cannot find here may exist elsewhere in the cluster.'
                  END
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_resolve_person(text) IS
  'Universal person lookup: JKKN ID, roll number, Team Code, register number, application number, name fragment, phone or email. Validates a JKKN ID check digit before searching so a typo is reported as a typo instead of as an absent person. Institution-scoped to the caller and says so in scope_note. Third branch (2026-08-27) surfaces profile-anchored identities: associates and external participants.';

REVOKE EXECUTE ON FUNCTION public.fn_resolve_person(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_person(text) TO authenticated;
