-- =====================================================================
-- Fix: fn_resolve_person read a column that does not exist
-- Added: 2026-08-14
-- Supersedes the body created in 20260817050000_jkkn_identity_rpcs.sql
-- (that migration is already applied and its objects are live — it is
--  left untouched; this one replaces the function cleanly).
-- =====================================================================
-- SYMPTOM
--   Every single call to public.fn_resolve_person(text) failed with:
--     ERROR 42703: column lp.admission_year does not exist
--     HINT: Perhaps you meant to reference the column "lp.admission_year_id"
--   That is the whole of /users/jkkn-id — the universal person lookup —
--   so the deployed page errored the moment anyone typed a search.
--
-- WHY IT SHIPPED GREEN
--   PL/pgSQL resolves column names at RUNTIME, not at CREATE time. The
--   CREATE FUNCTION therefore succeeded, CI passed, and the page went
--   live with a resolver that had never once been executed. Only an
--   authorised caller reaches the query at all (an unauthorised one is
--   refused earlier, at the permission check), so the failure stayed
--   invisible until someone with the permission actually searched.
--
-- THE FIX
--   learners_profiles carries admission_year_id — a uuid FK to
--   admission_years — and no admission_year column. Join through the FK
--   and take admission_years.year (integer, e.g. 2026).
--
--   The OUTPUT KEY is deliberately unchanged: the payload still carries
--   'admission_year' holding a year number, so the page contract does not
--   move. Only where the value is read from changes.
--
--   The team-member branch is untouched — it already returns NULL for
--   admission_year, which is correct: a team member has no admission year.
-- =====================================================================

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
      -- Was lp.admission_year, which does not exist on learners_profiles and
      -- made every call raise 42703. The cohort lives behind the FK.
      lp.program_id, ay.year AS admission_year, lp.lifecycle_status, lp.roll_number,
      lp.register_number, lp.application_id, ji.jkkn_id
    FROM public.learners_profiles lp
    LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
    -- LEFT, not inner: admission_year_id is nullable, and a learner whose
    -- cohort was never filled in must still be findable by name or roll
    -- number. They come back with a null admission_year, not absent.
    LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
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
  'Universal person lookup: JKKN ID, roll number, Team Code, register number, application number, name fragment, phone or email. Validates a JKKN ID check digit before searching so a typo is reported as a typo instead of as an absent person. Institution-scoped to the caller and says so in scope_note. Reads the admission year through learners_profiles.admission_year_id -> admission_years.year.';

REVOKE EXECUTE ON FUNCTION public.fn_resolve_person(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_person(text) TO authenticated;
