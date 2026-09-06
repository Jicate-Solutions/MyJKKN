-- ============================================================================
-- fn_jkkn_directory — paginated, filterable person directory for /users/jkkn-id
-- ============================================================================
-- The lookup page's default view is now a browsable table of everyone, not a
-- search box. Viewers hold users.jkkn_id.view but not necessarily row access
-- to learners_profiles / staff under RLS, so listing goes through this gated
-- SECURITY DEFINER RPC — the same trust shape as fn_resolve_person, which
-- remains the cross-identifier quick-lookup (phone, aliases, scans).
--
-- One kind per call ('learner' | 'team_member' | 'associate'): the three
-- populations have different columns, and a mixed page is not a useful table.
-- Sort keys are whitelisted inside the function (a URL param never reaches
-- ORDER BY raw), the limit is clamped to 1..100, and the page is clamped to
-- the last page so narrowing a filter while deep in the list never renders a
-- blank table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jkkn_directory(
  p_kind           text DEFAULT 'learner',
  p_institution_id uuid DEFAULT NULL,
  p_status         text DEFAULT NULL,
  p_issued         text DEFAULT NULL,   -- 'issued' | 'not_issued' | NULL = any
  p_admission_year int  DEFAULT NULL,   -- learners only
  p_search         text DEFAULT NULL,
  p_sort_by        text DEFAULT 'name',
  p_sort_order     text DEFAULT 'asc',
  p_page           int  DEFAULT 1,
  p_limit          int  DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_all    boolean;
  v_q      text := lower(btrim(coalesce(p_search, '')));
  v_sort   text;
  v_desc   boolean := lower(coalesce(p_sort_order, 'asc')) = 'desc';
  v_limit  int := LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
  v_total  bigint;
  v_pages  int;
  v_page   int;
  v_rows   jsonb;
BEGIN
  -- Gate + scope: identical to fn_resolve_person.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  ) THEN
    RAISE EXCEPTION 'Not authorised to look people up'
      USING ERRCODE = '42501';
  END IF;

  v_all := COALESCE(public.is_super_admin(), false) OR public.is_admin();

  IF p_kind IS NULL OR p_kind NOT IN ('learner', 'team_member', 'associate') THEN
    RAISE EXCEPTION 'kind must be learner, team_member or associate (got %)', p_kind
      USING ERRCODE = '22023';
  END IF;

  -- Sort whitelist. Anything unknown falls back to name rather than erroring —
  -- a stale bookmark should degrade, not 400.
  v_sort := CASE
    WHEN p_sort_by IN ('name', 'jkkn_id', 'code', 'status', 'admission_year') THEN p_sort_by
    ELSE 'name'
  END;

  IF p_kind = 'learner' THEN
    SELECT count(*) INTO v_total
      FROM public.learners_profiles lp
      LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
      LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
       AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
       AND (p_status IS NULL OR lp.lifecycle_status::text = p_status)
       AND (p_admission_year IS NULL OR ay.year = p_admission_year)
       AND (p_issued IS NULL
            OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
            OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
       AND (v_q = ''
            OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(lp.roll_number, '')))     LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(lp.register_number, ''))) LIKE '%' || v_q || '%'
            OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               lp.id,
               'kind',             'learner',
               'name',             btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')),
               'photo_url',        lp.student_photo_url,
               'email',            NULL,
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      lp.roll_number,
               'register_number',  lp.register_number,
               'team_code',        NULL,
               'designation',      NULL,
               'program',          pr.program_name,
               'institution_name', i.name,
               'admission_year',   ay.year,
               'status',           lp.lifecycle_status::text
             ) AS row_json
        FROM public.learners_profiles lp
        LEFT JOIN public.jkkn_identities ji ON ji.learner_profile_id = lp.id
        LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
        LEFT JOIN public.institutions    i  ON i.id  = lp.institution_id
        LEFT JOIN public.programs        pr ON pr.id = lp.program_id
       WHERE (v_all OR public.role_has_institution_access(lp.institution_id))
         AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
         AND (p_status IS NULL OR lp.lifecycle_status::text = p_status)
         AND (p_admission_year IS NULL OR ay.year = p_admission_year)
         AND (p_issued IS NULL
              OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
              OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
         AND (v_q = ''
              OR lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(lp.roll_number, '')))     LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(lp.register_number, ''))) LIKE '%' || v_q || '%'
              OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'name'           THEN lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')))
              WHEN 'jkkn_id'        THEN btrim(ji.jkkn_id)
              WHEN 'code'           THEN lower(btrim(coalesce(lp.roll_number, '')))
              WHEN 'status'         THEN lp.lifecycle_status::text
              WHEN 'admission_year' THEN lpad(coalesce(ay.year, 0)::text, 6, '0')
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'name'           THEN lower(btrim(lp.first_name || ' ' || coalesce(lp.last_name, '')))
              WHEN 'jkkn_id'        THEN btrim(ji.jkkn_id)
              WHEN 'code'           THEN lower(btrim(coalesce(lp.roll_number, '')))
              WHEN 'status'         THEN lp.lifecycle_status::text
              WHEN 'admission_year' THEN lpad(coalesce(ay.year, 0)::text, 6, '0')
            END
          END) DESC NULLS LAST,
         lp.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;

  ELSIF p_kind = 'team_member' THEN
    SELECT count(*) INTO v_total
      FROM public.staff st
      LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
     WHERE (v_all OR public.role_has_institution_access(st.institution_id))
       AND (p_institution_id IS NULL OR st.institution_id = p_institution_id)
       AND (p_status IS NULL
            OR (p_status = 'active'   AND st.is_active IS TRUE)
            OR (p_status = 'inactive' AND st.is_active IS NOT TRUE))
       AND (p_issued IS NULL
            OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
            OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
       AND (v_q = ''
            OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(st.staff_id, ''))) LIKE '%' || v_q || '%'
            OR lower(coalesce(st.email, ''))             LIKE '%' || v_q || '%'
            OR lower(coalesce(st.institution_email, '')) LIKE '%' || v_q || '%'
            OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               st.id,
               'kind',             'team_member',
               'name',             btrim(st.first_name || ' ' || coalesce(st.last_name, '')),
               'photo_url',        st.profile_picture,
               'email',            coalesce(st.institution_email, st.email),
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      NULL,
               'register_number',  NULL,
               'team_code',        st.staff_id,
               'designation',      st.designation,
               'program',          NULL,
               'institution_name', i.name,
               'admission_year',   NULL,
               'status',           CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
             ) AS row_json
        FROM public.staff st
        LEFT JOIN public.jkkn_identities ji ON ji.team_member_id = st.id
        LEFT JOIN public.institutions    i  ON i.id = st.institution_id
       WHERE (v_all OR public.role_has_institution_access(st.institution_id))
         AND (p_institution_id IS NULL OR st.institution_id = p_institution_id)
         AND (p_status IS NULL
              OR (p_status = 'active'   AND st.is_active IS TRUE)
              OR (p_status = 'inactive' AND st.is_active IS NOT TRUE))
         AND (p_issued IS NULL
              OR (p_issued = 'issued'     AND ji.jkkn_id IS NOT NULL)
              OR (p_issued = 'not_issued' AND ji.jkkn_id IS NULL))
         AND (v_q = ''
              OR lower(btrim(st.first_name || ' ' || coalesce(st.last_name, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(st.staff_id, ''))) LIKE '%' || v_q || '%'
              OR lower(coalesce(st.email, ''))             LIKE '%' || v_q || '%'
              OR lower(coalesce(st.institution_email, '')) LIKE '%' || v_q || '%'
              OR btrim(coalesce(ji.jkkn_id, '')) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'name'    THEN lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              WHEN 'code'    THEN lower(btrim(coalesce(st.staff_id, '')))
              WHEN 'status'  THEN CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
              ELSE lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'name'    THEN lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              WHEN 'code'    THEN lower(btrim(coalesce(st.staff_id, '')))
              WHEN 'status'  THEN CASE WHEN st.is_active THEN 'active' ELSE 'inactive' END
              ELSE lower(btrim(st.first_name || ' ' || coalesce(st.last_name, '')))
            END
          END) DESC NULLS LAST,
         st.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;

  ELSE
    -- Associates and external participants exist in the directory only through
    -- the register (INNER join), so the 'not_issued' filter is empty here by
    -- construction.
    SELECT count(*) INTO v_total
      FROM public.profiles p
      JOIN public.jkkn_identities ji ON ji.profile_id = p.id
     WHERE ji.person_kind IN ('associate', 'external_participant')
       AND (v_all OR public.role_has_institution_access(p.institution_id))
       AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
       AND (p_issued IS NULL OR p_issued = 'issued')
       AND (v_q = ''
            OR lower(coalesce(p.full_name, '')) LIKE '%' || v_q || '%'
            OR lower(coalesce(p.email, ''))     LIKE '%' || v_q || '%'
            OR btrim(ji.jkkn_id) = btrim(coalesce(p_search, '')));

    v_pages := GREATEST(1, CEIL(v_total::numeric / v_limit)::int);
    v_page  := LEAST(GREATEST(coalesce(p_page, 1), 1), v_pages);

    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'id',               p.id,
               'kind',             ji.person_kind,
               'name',             coalesce(btrim(p.full_name), 'Name unavailable'),
               'photo_url',        p.avatar_url,
               'email',            p.email,
               'jkkn_id',          btrim(ji.jkkn_id),
               'roll_number',      NULL,
               'register_number',  NULL,
               'team_code',        NULL,
               'designation',      NULL,
               'program',          NULL,
               'institution_name', i.name,
               'admission_year',   NULL,
               'status',           NULL
             ) AS row_json
        FROM public.profiles p
        JOIN public.jkkn_identities ji ON ji.profile_id = p.id
        LEFT JOIN public.institutions i ON i.id = p.institution_id
       WHERE ji.person_kind IN ('associate', 'external_participant')
         AND (v_all OR public.role_has_institution_access(p.institution_id))
         AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
         AND (p_issued IS NULL OR p_issued = 'issued')
         AND (v_q = ''
              OR lower(coalesce(p.full_name, '')) LIKE '%' || v_q || '%'
              OR lower(coalesce(p.email, ''))     LIKE '%' || v_q || '%'
              OR btrim(ji.jkkn_id) = btrim(coalesce(p_search, '')))
       ORDER BY
         (CASE WHEN NOT v_desc THEN
            CASE v_sort
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              ELSE lower(coalesce(p.full_name, ''))
            END
          END) ASC NULLS LAST,
         (CASE WHEN v_desc THEN
            CASE v_sort
              WHEN 'jkkn_id' THEN btrim(ji.jkkn_id)
              ELSE lower(coalesce(p.full_name, ''))
            END
          END) DESC NULLS LAST,
         p.id
       LIMIT v_limit OFFSET (v_page - 1) * v_limit
    ) page_rows;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'rows',        v_rows,
    'total',       v_total,
    'page',        v_page,
    'limit',       v_limit,
    'total_pages', v_pages
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_directory(text, uuid, text, text, int, text, text, text, int, int) IS
  'Paginated, filterable person directory behind /users/jkkn-id. One kind per call (learner | team_member | associate). Gated on users.jkkn_id.view like fn_resolve_person; non-admins are institution-scoped via role_has_institution_access. Sort keys whitelisted, limit clamped to 100, page clamped to the last page.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_directory(text, uuid, text, text, int, text, text, text, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_directory(text, uuid, text, text, int, text, text, text, int, int) TO authenticated;
