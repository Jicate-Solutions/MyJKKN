-- ============================================================================
-- JKKN ID: kind-wise analytics + guarded manual issuance
-- ============================================================================
-- Two RPCs behind /users/jkkn-id:
--
-- fn_jkkn_stats() — issued/pending counts per kind for the analytics cards.
--   Gated on users.jkkn_id.view like the directory; learner/team counts are
--   institution-scoped for non-admins. "Eligible" mirrors what auto-issuance
--   covers: learners in the six trigger statuses, active team members, and
--   custom-role holders who are neither. Learners also get a `review` count —
--   unissued people whose phone matches an unlinked team-member identity, the
--   set every backfill deliberately withheld for a human.
--
-- fn_jkkn_issue_manual(p_kind, p_ref_id) — the "Issue ID" button. Gated on
--   users.jkkn_id.issue (or admin). CARRIES THE SAME EMAIL GUARD as the
--   auto-issue triggers: if the person's email matches exactly one unlinked
--   identity of the other kind, the existing row is UPGRADED to 'both' and
--   its number returned — a human clicking "Issue" on a graduate-turned-staff
--   must link, never mint a duplicate. An ambiguous email (2+ matches) raises
--   instead of guessing. Phone overlap does NOT block here: the click IS the
--   human review the backfills were waiting for. issued_by = the clicker.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jkkn_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_all       boolean;
  v_learners  jsonb;
  v_team      jsonb;
  v_assoc     jsonb;
  v_register  jsonb;
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

  SELECT jsonb_build_object(
           'eligible', count(*),
           'issued',   count(*) FILTER (WHERE ji.id IS NOT NULL),
           'pending',  count(*) FILTER (WHERE ji.id IS NULL),
           'review',   count(*) FILTER (WHERE ji.id IS NULL AND EXISTS (
             SELECT 1
               FROM public.jkkn_identities j2
               JOIN public.staff st ON st.id = j2.team_member_id
              WHERE j2.learner_profile_id IS NULL
                AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10)
                    = NULLIF(right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10), '')
           ))
         )
    INTO v_learners
    FROM public.learners_profiles lp
    LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
   WHERE lp.lifecycle_status::text IN ('reserved', 'account', 'admitted', 'active', 'graduated', 'alumni')
     AND (v_all OR public.role_has_institution_access(lp.institution_id));

  SELECT jsonb_build_object(
           'eligible', count(*),
           'issued',   count(*) FILTER (WHERE ji.id IS NOT NULL),
           'pending',  count(*) FILTER (WHERE ji.id IS NULL)
         )
    INTO v_team
    FROM public.staff st
    LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
   WHERE st.is_active IS TRUE
     AND (v_all OR public.role_has_institution_access(st.institution_id));

  -- Associates: custom-role holders who are neither learner-linked nor
  -- matched by email to any staff row (those belong to the other lanes).
  SELECT jsonb_build_object(
           'eligible', count(*),
           'issued',   count(*) FILTER (WHERE ji.id IS NOT NULL),
           'pending',  count(*) FILTER (WHERE ji.id IS NULL)
         )
    INTO v_assoc
    FROM (SELECT DISTINCT ur.user_id FROM public.user_roles ur) ur
    JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN public.jkkn_identities ji ON ji.profile_id = p.id
   WHERE p.learner_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.staff st
        WHERE NULLIF(lower(btrim(coalesce(p.email, ''))), '') IS NOT NULL
          AND (lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(p.email))
            OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(p.email)))
     )
     AND (v_all OR public.role_has_institution_access(p.institution_id));

  SELECT jsonb_build_object(
           'total',                 count(*),
           'both',                  count(*) FILTER (WHERE person_kind = 'both'),
           'external_participants', count(*) FILTER (WHERE person_kind = 'external_participant'),
           'retired',               count(*) FILTER (WHERE retired_at IS NOT NULL)
         )
    INTO v_register
    FROM public.jkkn_identities;

  RETURN jsonb_build_object(
    'ok',           true,
    'learners',     v_learners,
    'team_members', v_team,
    'associates',   v_assoc,
    'register',     v_register
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_stats() IS
  'Kind-wise issued/pending counts for the /users/jkkn-id analytics cards. Gated on users.jkkn_id.view; learner/team/associate counts are institution-scoped for non-admins; register totals are global. learners.review = unissued learners phone-matching an unlinked team-member identity (the withheld human-review set).';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_stats() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_stats() TO authenticated;

-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_jkkn_issue_manual(
  p_kind   text,
  p_ref_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_existing text;
  v_emails   text[];
  v_matches  int;
  v_match_id uuid;
  v_number   text;
  v_result   jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  ) THEN
    RAISE EXCEPTION 'Not authorised to issue a JKKN ID'
      USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('learner', 'team_member', 'associate') THEN
    RAISE EXCEPTION 'kind must be learner, team_member or associate (got %)', p_kind
      USING ERRCODE = '22023';
  END IF;
  IF p_ref_id IS NULL THEN
    RAISE EXCEPTION 'p_ref_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'learner' THEN
    IF NOT EXISTS (SELECT 1 FROM public.learners_profiles WHERE id = p_ref_id) THEN
      RAISE EXCEPTION 'No learner profile %', p_ref_id USING ERRCODE = '23503';
    END IF;

    SELECT btrim(jkkn_id) INTO v_existing
      FROM public.jkkn_identities WHERE learner_profile_id = p_ref_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'already_held', 'jkkn_id', v_existing);
    END IF;

    SELECT ARRAY(
             SELECT lower(btrim(e))
               FROM unnest(ARRAY[lp.student_email, lp.college_email]) AS e
              WHERE e IS NOT NULL AND btrim(e) <> ''
           )
      INTO v_emails
      FROM public.learners_profiles lp WHERE lp.id = p_ref_id;

    v_matches := 0; v_match_id := NULL;
    IF array_length(v_emails, 1) IS NOT NULL THEN
      SELECT count(*), min(ji.id::text)::uuid INTO v_matches, v_match_id
        FROM public.jkkn_identities ji
        JOIN public.staff st ON st.id = ji.team_member_id
       WHERE ji.learner_profile_id IS NULL
         AND (lower(btrim(coalesce(st.institution_email, ''))) = ANY (v_emails)
           OR lower(btrim(coalesce(st.email, '')))             = ANY (v_emails));
    END IF;

    IF v_matches = 1 THEN
      UPDATE public.jkkn_identities
         SET learner_profile_id = p_ref_id, person_kind = 'both'
       WHERE id = v_match_id
       RETURNING btrim(jkkn_id) INTO v_number;
      RETURN jsonb_build_object('ok', true, 'action', 'linked_existing', 'jkkn_id', v_number);
    ELSIF v_matches > 1 THEN
      RAISE EXCEPTION 'This learner''s email matches % existing team-member identities — resolve which one is the same person before issuing.', v_matches
        USING ERRCODE = '23505';
    END IF;

    v_result := public.fn_jkkn_allocate('learner', p_ref_id, NULL, NULL, auth.uid());

  ELSIF p_kind = 'team_member' THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_ref_id) THEN
      RAISE EXCEPTION 'No team member %', p_ref_id USING ERRCODE = '23503';
    END IF;

    SELECT btrim(jkkn_id) INTO v_existing
      FROM public.jkkn_identities WHERE team_member_id = p_ref_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'already_held', 'jkkn_id', v_existing);
    END IF;

    SELECT ARRAY(
             SELECT lower(btrim(e))
               FROM unnest(ARRAY[st.institution_email, st.email]) AS e
              WHERE e IS NOT NULL AND btrim(e) <> ''
           )
      INTO v_emails
      FROM public.staff st WHERE st.id = p_ref_id;

    v_matches := 0; v_match_id := NULL;
    IF array_length(v_emails, 1) IS NOT NULL THEN
      SELECT count(*), min(ji.id::text)::uuid INTO v_matches, v_match_id
        FROM public.jkkn_identities ji
        JOIN public.learners_profiles lp ON lp.id = ji.learner_profile_id
       WHERE ji.team_member_id IS NULL
         AND (lower(btrim(coalesce(lp.student_email, ''))) = ANY (v_emails)
           OR lower(btrim(coalesce(lp.college_email, ''))) = ANY (v_emails));
    END IF;

    IF v_matches = 1 THEN
      UPDATE public.jkkn_identities
         SET team_member_id = p_ref_id, person_kind = 'both'
       WHERE id = v_match_id
       RETURNING btrim(jkkn_id) INTO v_number;
      RETURN jsonb_build_object('ok', true, 'action', 'linked_existing', 'jkkn_id', v_number);
    ELSIF v_matches > 1 THEN
      RAISE EXCEPTION 'This team member''s email matches % existing learner identities — resolve which one is the same person before issuing.', v_matches
        USING ERRCODE = '23505';
    END IF;

    v_result := public.fn_jkkn_allocate('team_member', NULL, p_ref_id, NULL, auth.uid());

  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_ref_id) THEN
      RAISE EXCEPTION 'No profile %', p_ref_id USING ERRCODE = '23503';
    END IF;

    SELECT btrim(jkkn_id) INTO v_existing
      FROM public.jkkn_identities WHERE profile_id = p_ref_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'already_held', 'jkkn_id', v_existing);
    END IF;

    v_result := public.fn_jkkn_allocate('associate', NULL, NULL, p_ref_id, auth.uid());
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', 'issued', 'jkkn_id', v_result->>'jkkn_id');
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_issue_manual(text, uuid) IS
  'Manual "Issue ID" behind /users/jkkn-id, gated on users.jkkn_id.issue. Applies the same email guard as the auto-issue triggers: an exact match to an unlinked identity of the other kind LINKS that row (person_kind=both) and returns its number instead of minting a duplicate; an ambiguous match raises. issued_by = the caller.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_issue_manual(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_issue_manual(text, uuid) TO authenticated;
