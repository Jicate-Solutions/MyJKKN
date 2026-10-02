-- ============================================================================
-- College Leadership — person card (photo, designation, contact) on every holder.
-- Created: 2026-09-30.
--
-- The redesigned page shows each leader as a profile card. Photo comes from the
-- STAFF table (staff.profile_picture, a public storage URL, set for ~44% of
-- staff), falling back to profiles.avatar_url, then to initials in the UI.
--
-- fn_leadership_person_card is a helper for the other SECURITY DEFINER
-- leadership RPCs ONLY: it is not granted to anon or authenticated, so it cannot
-- be used as a lookup-anyone-by-uuid endpoint.
--
-- Phone is returned to admins only. Everyone else who can see the page sees the
-- name, designation, email and staff id they could already see; a personal phone
-- number is a wider disclosure than "who holds this post".
--
-- Existing consumers are unaffected: these RPCs only gain extra keys on holders.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_leadership_person_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'photo_url',   COALESCE(
                     NULLIF(btrim(s.profile_picture), ''),
                     NULLIF(btrim(p.avatar_url), '')
                   ),
    'designation', COALESCE(
                     NULLIF(btrim(s.designation), ''),
                     NULLIF(btrim(p.designation), '')
                   ),
    'phone',       CASE
                     WHEN COALESCE(public.is_super_admin(), false)
                       OR COALESCE(public.is_admin(), false)
                     THEN COALESCE(NULLIF(btrim(s.phone), ''), NULLIF(btrim(p.phone_number), ''))
                   END,
    'staff_id',    s.staff_id
  )
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT st.profile_picture, st.designation, st.phone, st.staff_id
      FROM public.staff st
     WHERE st.profile_id = p.id
     ORDER BY st.is_active DESC
     LIMIT 1
  ) s ON true
  WHERE p.id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_person_card(uuid) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- fn_get_college_posts — as 20260930150000, holders gain the person card.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_college_posts(p_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead    jsonb;
  v_has_own boolean;
BEGIN
  -- Authorisation and "no such institution" are enforced inside this call.
  v_lead := public.fn_get_college_leadership(p_institution_id);

  SELECT EXISTS (
    SELECT 1
      FROM public.institution_leadership_posts ilp
      JOIN public.leadership_posts sp ON sp.code = ilp.post_code
     WHERE ilp.institution_id = p_institution_id
       AND sp.owner_institution_id IS NULL
       AND sp.scope = 'institution'
  ) INTO v_has_own;

  RETURN jsonb_build_object(
    'institution_id',   p_institution_id,
    'institution_name', v_lead->>'institution_name',
    'committee_id',     v_lead->'committee_id',
    'posts', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'code',        p.code,
                 'label',       p.label,
                 'description', p.description,
                 'kind',        p.kind,
                 'is_builtin',  p.is_builtin,
                 'owned',       p.owner_institution_id IS NOT NULL,
                 'holder',
                   CASE
                     WHEN p.kind <> 'generic' THEN
                       CASE WHEN jsonb_typeof(v_lead -> p.code) = 'object'
                            THEN (v_lead -> p.code)
                                 || public.fn_leadership_person_card((v_lead -> p.code ->> 'user_id')::uuid)
                       END
                     ELSE (
                       SELECT jsonb_build_object(
                                'user_id',          pr.id,
                                'full_name',        pr.full_name,
                                'email',            pr.email,
                                'assigned_at',      il.assigned_at,
                                'assigned_by_name', ab.full_name
                              ) || public.fn_leadership_person_card(pr.id)
                         FROM public.institution_leadership il
                         JOIN public.profiles pr ON pr.id = il.user_id
                         LEFT JOIN public.profiles ab ON ab.id = il.assigned_by
                        WHERE il.institution_id = p_institution_id
                          AND il.position = p.code
                          AND il.is_active
                        ORDER BY il.assigned_at DESC
                        LIMIT 1
                     )
                   END
               ) ORDER BY p.sort_order, p.label
             )
        FROM public.leadership_posts p
       WHERE p.is_active
         AND p.scope = 'institution'
         AND (
           p.owner_institution_id = p_institution_id
           OR (
             p.owner_institution_id IS NULL
             AND (
               EXISTS (SELECT 1 FROM public.institution_leadership_posts ilp
                        WHERE ilp.institution_id = p_institution_id
                          AND ilp.post_code = p.code)
               OR (NOT v_has_own AND p.is_builtin)
             )
           )
         )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_college_posts(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_college_posts(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_list_group_leadership — group holders gain the person card.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_list_group_leadership()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM public.institutions i WHERE public.fn_college_leadership_can_manage(i.id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to group leadership.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'can_manage_group', v_admin,
    'posts', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'code', p.code, 'label', p.label, 'description', p.description,
                 'holder', (
                   SELECT jsonb_build_object(
                            'user_id', pr.id, 'full_name', pr.full_name, 'email', pr.email,
                            'assigned_at', g.assigned_at, 'assigned_by_name', ab.full_name
                          ) || public.fn_leadership_person_card(pr.id)
                     FROM public.group_leadership g
                     JOIN public.profiles pr ON pr.id = g.user_id
                     LEFT JOIN public.profiles ab ON ab.id = g.assigned_by
                    WHERE g.post_code = p.code AND g.is_active
                    LIMIT 1
                 )
               ) ORDER BY p.sort_order, p.label
             )
        FROM public.leadership_posts p
       WHERE p.is_active AND p.scope = 'group'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_group_leadership() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_group_leadership() TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_search_group_candidates — result rows gain photo_url / designation.
-- (Body as 20260930170000; only the two extra keys are new.)
-- ----------------------------------------------------------------------------
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
                        'photo_url',        public.fn_leadership_person_card(pg.id) ->> 'photo_url',
                        'designation',      public.fn_leadership_person_card(pg.id) ->> 'designation',
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
