-- ============================================================================
-- Group leadership — candidate search over PROFILES.
-- Created: 2026-09-30.
--
-- fn_list_group_candidates returned only active staff that had a profile (719
-- people) as one flat list. Appointing a Managing Director should be able to
-- pick anyone with a profile, and a flat list over ~7,000 people is unusable, so
-- the picker is now a server-side search: multi-word text, custom-role filter,
-- institution filter, active/staff toggles, paginated.
--
-- Admin / super-admin only, like fn_set_group_post_holder (which still re-checks
-- that the chosen profile exists and is active, so a picker bug cannot appoint a
-- deactivated profile).
--
-- "Staff only" defaults ON: profiles is mostly learners, and without it the
-- default view would drown in students. It is a toggle, not a restriction.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_list_group_candidates();

CREATE OR REPLACE FUNCTION public.fn_search_group_candidates(
  p_query          text    DEFAULT NULL,
  p_role_ids       uuid[]  DEFAULT NULL,
  p_institution_id uuid    DEFAULT NULL,
  p_active_only    boolean DEFAULT true,
  p_staff_only     boolean DEFAULT true,
  p_limit          integer DEFAULT 25,
  p_offset         integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_tokens text[];
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)) THEN
    RAISE EXCEPTION 'Only an admin can appoint group-level posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One LIKE pattern per word, LIKE metacharacters escaped so "50%" or "a_b"
  -- match literally. Capped so a pasted paragraph cannot build a huge predicate.
  SELECT COALESCE(array_agg(
           '%' || replace(replace(replace(t, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
         ), '{}')
    INTO v_tokens
    FROM (
      SELECT t
        FROM unnest(regexp_split_to_array(btrim(left(COALESCE(p_query, ''), 100)), '\s+')) AS t
       WHERE t <> ''
       LIMIT 6
    ) s;

  WITH f AS (
    SELECT p.id, p.full_name, p.email, p.institution_id, p.is_active
      FROM public.profiles p
     WHERE (NOT COALESCE(p_active_only, true) OR COALESCE(p.is_active, true))
       AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
       AND (NOT COALESCE(p_staff_only, true)
            OR EXISTS (SELECT 1 FROM public.staff s
                        WHERE s.profile_id = p.id AND s.is_active))
       AND (p_role_ids IS NULL OR cardinality(p_role_ids) = 0
            OR EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = p.id AND ur.role_id = ANY (p_role_ids)))
       -- every word must match at least one of name / email / staff id
       AND NOT EXISTS (
         SELECT 1 FROM unnest(v_tokens) AS tok
          WHERE NOT (
            p.full_name ILIKE tok ESCAPE E'\\'
            OR p.email ILIKE tok ESCAPE E'\\'
            OR EXISTS (SELECT 1 FROM public.staff s
                        WHERE s.profile_id = p.id
                          AND s.staff_id::text ILIKE tok ESCAPE E'\\')
          )
       )
  ),
  pg AS (
    SELECT * FROM f ORDER BY full_name, id LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
           'total', (SELECT count(*) FROM f),
           'rows', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',               pg.id,
                        'full_name',        pg.full_name,
                        'email',            pg.email,
                        'institution_id',   pg.institution_id,
                        'institution_name', (SELECT i.name FROM public.institutions i
                                              WHERE i.id = pg.institution_id),
                        'staff_id',         (SELECT s.staff_id FROM public.staff s
                                              WHERE s.profile_id = pg.id
                                              ORDER BY s.is_active DESC LIMIT 1),
                        'is_active',        COALESCE(pg.is_active, true),
                        'roles',            COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object('id', cr.id, 'role_name', cr.role_name)
                                   ORDER BY ur.is_primary DESC, cr.role_name)
                            FROM public.user_roles ur
                            JOIN public.custom_roles cr ON cr.id = ur.role_id
                           WHERE ur.user_id = pg.id
                        ), '[]'::jsonb)
                      ) ORDER BY pg.full_name, pg.id
                    )
               FROM pg
           ), '[]'::jsonb)
         )
    INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_search_group_candidates(text, uuid[], uuid, boolean, boolean, integer, integer)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_search_group_candidates(text, uuid[], uuid, boolean, boolean, integer, integer)
  TO authenticated;

-- The role filter's options.
CREATE OR REPLACE FUNCTION public.fn_list_group_candidate_roles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)) THEN
    RAISE EXCEPTION 'Only an admin can appoint group-level posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object('id', cr.id, 'role_name', cr.role_name, 'role_key', cr.role_key)
             ORDER BY cr.role_name)
      FROM public.custom_roles cr
     WHERE cr.is_active
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_group_candidate_roles() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_group_candidate_roles() TO authenticated;
