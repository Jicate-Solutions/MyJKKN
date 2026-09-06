-- =====================================================================
-- JKKN permanent identity — issuer, duplicate guard, universal resolver
-- Added: 2026-08-10
-- =====================================================================
-- Depends on 20260817040000_jkkn_permanent_identity_schema.sql.
--
-- SHIPS DORMANT. Creating these functions issues nothing. fn_issue_jkkn_id
-- is gated on 'users.jkkn_id.issue', a permission key that exists in
-- lib/constants/permissions.ts and is granted to NO role. Nothing in the
-- UI calls it: the page shipped alongside this migration is search-only
-- and has no issue button and no backfill button, deliberately.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. fn_issue_jkkn_id — allocate one permanent number
-- ---------------------------------------------------------------------
-- WHY RANDOM, NOT SEQUENTIAL
-- A sequential number publishes two things JKKN does not intend to
-- publish, on every ID card, forever: how many people the cluster has
-- taken in, and who joined before whom. 100000-000012 tells a stranger
-- they are looking at the twelfth person ever registered. Random
-- allocation over the 900,000-number space costs one retry loop and
-- leaks neither.
--
-- Collision maths: with even 50,000 numbers issued, a fresh draw
-- collides with probability 0.056, so eight attempts fail together about
-- once in 10^10 draws. The loop is bounded at 20 and raises rather than
-- spinning.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_issue_jkkn_id(
  p_person_kind        text,
  p_learner_profile_id uuid DEFAULT NULL,
  p_team_member_id     uuid DEFAULT NULL
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

  IF p_person_kind IS NULL OR p_person_kind NOT IN ('learner', 'team_member', 'both') THEN
    RAISE EXCEPTION 'person_kind must be learner, team_member or both (got %)', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- The link shape must match the kind, and the person must actually
  -- exist. The table tolerates an orphaned link (a person record can be
  -- removed years later and the number must survive); issuance does not.
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
    RAISE EXCEPTION 'A team_member identity must not carry a learner profile'
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
    RAISE EXCEPTION 'A learner identity must not carry a team member'
      USING ERRCODE = '22023';
  END IF;

  -- One person, one number, for life. Refuse a second — the whole design
  -- rests on a learner who returns as a Senior Learner keeping the number
  -- they already have. (The partial unique indexes enforce this too; this
  -- check exists to fail with a sentence a human can act on.)
  SELECT jkkn_id INTO v_existing
    FROM public.jkkn_identities
   WHERE (p_learner_profile_id IS NOT NULL AND learner_profile_id = p_learner_profile_id)
      OR (p_team_member_id     IS NOT NULL AND team_member_id     = p_team_member_id)
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
      jkkn_id, person_kind, learner_profile_id, team_member_id, issued_by
    )
    VALUES (
      v_candidate, p_person_kind, p_learner_profile_id, p_team_member_id, auth.uid()
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

COMMENT ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid) IS
  'Issues ONE permanent JKKN ID to a person who does not already hold one. Admin-gated on users.jkkn_id.issue, which no role holds today — the machinery ships dormant. Numbers are drawn at random from 100000..999999 so an ID card never reveals intake volume or joining order.';

REVOKE EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. fn_check_duplicate_person — the guard, called BEFORE creating anyone
-- ---------------------------------------------------------------------
-- NEVER AUTO-MERGES, AND CANNOT BE MADE TO. Twins share a surname and a
-- date of birth, and often a household phone. An automatic merge on that
-- evidence fuses two real learners into one record, and un-fusing them
-- afterwards means unpicking marks, fees, attendance and hostel rows that
-- have all been written against the survivor. This function returns
-- findings and a verdict; a human decides.
--
-- Verdicts:
--   block   — an exact Aadhaar match. Same person, near certainly.
--   review  — same name + date of birth, or the same personal mobile.
--             A human looks. Frequently a sibling or a genuine namesake.
--   clear   — nothing matched on the evidence that could be checked.
--
-- AADHAAR IS NOT STORED ANYWHERE IN MyJKKN TODAY. Neither
-- learners_profiles nor staff has such a column, and no alias type carries
-- one. So the 'block' branch is wired but structurally dark: when an
-- Aadhaar is supplied, the result says aadhaar_checked = false with a
-- reason, rather than reporting "no duplicate" — a producer that could not
-- check must say so, not return silence that reads like a clean result.
-- Whether JKKN should hold Aadhaar at all is a Director decision with real
-- compliance weight, and is deliberately not made here.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_duplicate_person(
  p_aadhaar    text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL,
  p_dob        date DEFAULT NULL,
  p_phone      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_first    text := lower(btrim(coalesce(p_first_name, '')));
  v_last     text := lower(btrim(coalesce(p_last_name, '')));
  v_phone    text := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10);
  v_findings jsonb := '[]'::jsonb;
  v_verdict  text  := 'clear';
  v_aadhaar_checked boolean := false;
  v_aadhaar_note    text;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  ) THEN
    RAISE EXCEPTION 'Not authorised to run the duplicate check'
      USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_aadhaar, '')) <> '' THEN
    v_aadhaar_note := 'An Aadhaar number was supplied but MyJKKN stores no Aadhaar, on any table. This dimension could NOT be checked — treat it as unknown, not as clear.';
  END IF;

  IF length(v_phone) < 10 THEN
    v_phone := NULL;
  END IF;

  -- Same name + date of birth (learners).
  IF v_first <> '' AND p_dob IS NOT NULL THEN
    SELECT v_findings || COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_findings
    FROM (
      SELECT jsonb_build_object(
               'matched_on',  'name_and_dob',
               'person_kind', 'learner',
               'person_id',   lp.id,
               'full_name',   btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')),
               'date_of_birth', lp.date_of_birth,
               'status',      lp.lifecycle_status::text,
               'roll_number', lp.roll_number,
               'jkkn_id',     btrim(ji.jkkn_id)
             ) AS f
        FROM public.learners_profiles lp
        LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
       WHERE lower(btrim(lp.first_name)) = v_first
         AND (v_last = '' OR lower(btrim(coalesce(lp.last_name, ''))) = v_last)
         -- date_of_birth is TEXT on learners_profiles, so cast defensively:
         -- a malformed value must not abort the whole guard.
         AND CASE
               WHEN lp.date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
                 THEN substr(lp.date_of_birth, 1, 10)::date
             END = p_dob
       LIMIT 25
    ) s;

    SELECT v_findings || COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_findings
    FROM (
      SELECT jsonb_build_object(
               'matched_on',  'name_and_dob',
               'person_kind', 'team_member',
               'person_id',   st.id,
               'full_name',   btrim(st.first_name || ' ' || coalesce(st.last_name, '')),
               'date_of_birth', st.date_of_birth::text,
               'status',      CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END,
               'team_code',   st.staff_id,
               'jkkn_id',     btrim(ji.jkkn_id)
             ) AS f
        FROM public.staff st
        LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
       WHERE lower(btrim(st.first_name)) = v_first
         AND (v_last = '' OR lower(btrim(coalesce(st.last_name, ''))) = v_last)
         AND st.date_of_birth = p_dob
       LIMIT 25
    ) s;
  END IF;

  -- Same personal mobile. Deliberately NOT father_mobile / mother_mobile:
  -- siblings share a parent's number as a matter of course, so matching on
  -- those would push every second learner into review and the review queue
  -- would stop being read.
  IF v_phone IS NOT NULL THEN
    SELECT v_findings || COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_findings
    FROM (
      SELECT jsonb_build_object(
               'matched_on',  'phone',
               'person_kind', 'learner',
               'person_id',   lp.id,
               'full_name',   btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')),
               'phone',       lp.student_mobile,
               'status',      lp.lifecycle_status::text,
               'roll_number', lp.roll_number,
               'jkkn_id',     btrim(ji.jkkn_id)
             ) AS f
        FROM public.learners_profiles lp
        LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
       WHERE right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) = v_phone
       LIMIT 25
    ) s;

    SELECT v_findings || COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_findings
    FROM (
      SELECT jsonb_build_object(
               'matched_on',  'phone',
               'person_kind', 'team_member',
               'person_id',   st.id,
               'full_name',   btrim(st.first_name || ' ' || coalesce(st.last_name, '')),
               'phone',       st.phone,
               'status',      CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END,
               'team_code',   st.staff_id,
               'jkkn_id',     btrim(ji.jkkn_id)
             ) AS f
        FROM public.staff st
        LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
       WHERE right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone
       LIMIT 25
    ) s;
  END IF;

  IF jsonb_array_length(v_findings) > 0 THEN
    v_verdict := 'review';
  END IF;

  RETURN jsonb_build_object(
    'verdict',         v_verdict,
    'auto_merge',      false,
    'auto_merge_note', 'This guard never merges. Twins share a name and a birth date; merging on that evidence fuses two real people into one record.',
    'aadhaar_checked', v_aadhaar_checked,
    'aadhaar_note',    v_aadhaar_note,
    'checked',         jsonb_build_object(
                         'name_and_dob', (v_first <> '' AND p_dob IS NOT NULL),
                         'phone',        (v_phone IS NOT NULL)
                       ),
    'findings',        v_findings
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_check_duplicate_person(text, text, text, date, text) IS
  'Duplicate guard, run BEFORE a person is created. Returns a verdict plus the evidence behind it. NEVER merges anything and never will: twins share a name and a date of birth. Aadhaar is reported as unchecked because MyJKKN stores none.';

REVOKE EXECUTE ON FUNCTION public.fn_check_duplicate_person(text, text, text, date, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_check_duplicate_person(text, text, text, date, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. fn_resolve_person — the universal resolver
-- ---------------------------------------------------------------------
-- Accepts whatever a human has in front of them: a JKKN ID, a roll
-- number, a Team Code, a university register number, an application
-- number, a name fragment, a phone or an email.
--
-- A JKKN ID is check-digit validated FIRST. A mistyped number is rejected
-- outright rather than searched for, because searching for it would
-- return nothing and "nothing" reads identically to "this person does not
-- exist" — which is the wrong answer to a typo.
--
-- SCOPE: this is SECURITY DEFINER, so it reads past RLS. It therefore
-- re-imposes the caller's own institution scope with
-- role_has_institution_access(), and says so in the payload
-- (scope_note) — a search box that silently hides half the cluster
-- teaches its user that people do not exist.
-- ---------------------------------------------------------------------
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
      lp.program_id, lp.admission_year, lp.lifecycle_status, lp.roll_number,
      lp.register_number, lp.application_id, ji.jkkn_id
    FROM public.learners_profiles lp
    LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
    -- EXISTS, not a LEFT JOIN: two alias types can carry the same value
    -- (a roll number that is also a legacy number), and a join would then
    -- return the same person twice.
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
  'Universal person lookup: JKKN ID, roll number, Team Code, register number, application number, name fragment, phone or email. Validates a JKKN ID check digit before searching so a typo is reported as a typo instead of as an absent person. Institution-scoped to the caller and says so in scope_note.';

REVOKE EXECUTE ON FUNCTION public.fn_resolve_person(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_person(text) TO authenticated;
