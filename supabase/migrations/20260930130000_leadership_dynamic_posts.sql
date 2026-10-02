-- ============================================================================
-- College Leadership — dynamic posts, chosen per institution.
-- Created: 2026-09-30.
--
-- Until now the four senior posts (principal, vice_principal, iqac_chair,
-- iqac_coordinator) were hardcoded in the RPCs, in a CHECK on
-- institution_leadership.position and in the UI. Schools and colleges need
-- different posts (Headmaster, Correspondent, Dean, Director …), so the list is
-- now DATA:
--
--   leadership_posts               the catalog (global)
--   institution_leadership_posts   which catalog posts apply to which institution
--
-- THE SAFETY RULE OF THIS FILE
-- A custom post is a DESIGNATION RECORD ONLY. It never touches user_roles or
-- profiles.role. Principal / Vice Principal write user_roles — a global role,
-- with no institution column — and that is exactly the privilege path the
-- director-desk role-write sweep polices. Letting "Dean" or "Headmaster" reach
-- it would mint global roles from a free-text label. If a post should carry
-- access, that stays a Role Management decision.
--
-- fn_set_college_leadership is deliberately NOT modified. Built-in posts keep
-- their exact storage and side effects through it; custom posts go through the
-- new fn_set_college_post_holder, which has no role writes at all. Not touching
-- the sensitive function is the point.
--
-- Backwards compatible: an institution with no applicability rows resolves to
-- the four built-ins, so nothing changes until somebody edits posts.
--
-- All writes are via SECURITY DEFINER RPCs gated by
-- fn_college_leadership_can_manage. The tables grant SELECT only and have no
-- write policies, so a direct PostgREST write is refused.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The catalog.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leadership_posts (
  code        text PRIMARY KEY
              CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label       text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 60),
  description text,
  sort_order  integer NOT NULL DEFAULT 100,
  -- principal_role : institution_leadership + user_roles (fn_set_college_leadership)
  -- committee      : IQAC committee tables               (fn_set_college_leadership)
  -- generic        : institution_leadership only, NO role writes
  kind        text NOT NULL CHECK (kind IN ('principal_role', 'committee', 'generic')),
  is_builtin  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadership_posts_builtin_kind CHECK (NOT is_builtin OR kind <> 'generic')
);

INSERT INTO public.leadership_posts (code, label, description, sort_order, kind, is_builtin)
VALUES
  ('principal',        'Principal',        'Heads the college and chairs its IQAC.',                          10, 'principal_role', true),
  ('vice_principal',   'Vice Principal',   'Deputises for the Principal and coordinates the IQAC.',           20, 'principal_role', true),
  ('iqac_chair',       'IQAC Chairman',    'Chairs the Internal Quality Assurance Cell. Normally the Principal.', 30, 'committee',   true),
  ('iqac_coordinator', 'IQAC Coordinator', 'Runs the IQAC day to day. Normally the Vice Principal.',          40, 'committee',      true)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Which posts apply to which institution.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_leadership_posts (
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  post_code      text NOT NULL REFERENCES public.leadership_posts(code)
                   ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, post_code)
);

CREATE INDEX IF NOT EXISTS institution_leadership_posts_post_idx
  ON public.institution_leadership_posts (post_code);

-- Every institution and school starts with the four built-ins, explicitly.
INSERT INTO public.institution_leadership_posts (institution_id, post_code)
SELECT i.id, p.code
  FROM public.institutions i
 CROSS JOIN public.leadership_posts p
 WHERE i.is_active
   AND i.entity_type IN ('institution', 'school')
   AND p.is_builtin
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. institution_leadership.position: CHECK -> FK to the catalog.
-- ----------------------------------------------------------------------------
ALTER TABLE public.institution_leadership
  DROP CONSTRAINT IF EXISTS institution_leadership_position_check;

ALTER TABLE public.institution_leadership
  DROP CONSTRAINT IF EXISTS institution_leadership_position_fkey;

ALTER TABLE public.institution_leadership
  ADD CONSTRAINT institution_leadership_position_fkey
  FOREIGN KEY (position) REFERENCES public.leadership_posts(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- 4. RLS + grants. SELECT only; every write goes through the RPCs below.
-- ----------------------------------------------------------------------------
ALTER TABLE public.leadership_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_leadership_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.leadership_posts             FROM anon, PUBLIC, authenticated;
REVOKE ALL ON TABLE public.institution_leadership_posts FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.leadership_posts             TO authenticated;
GRANT  SELECT ON TABLE public.institution_leadership_posts TO authenticated;

DROP POLICY IF EXISTS leadership_posts_select_permission ON public.leadership_posts;
CREATE POLICY leadership_posts_select_permission
  ON public.leadership_posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('organizations.leadership.manage'), false)
  );

DROP POLICY IF EXISTS institution_leadership_posts_select_permission ON public.institution_leadership_posts;
CREATE POLICY institution_leadership_posts_select_permission
  ON public.institution_leadership_posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR (COALESCE(user_has_permission('organizations.leadership.manage'), false)
        AND COALESCE(role_has_institution_access(institution_id), false))
  );

-- ----------------------------------------------------------------------------
-- 5. Catalog read.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_list_leadership_posts()
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

  IF NOT EXISTS (
    SELECT 1 FROM public.institutions i
     WHERE public.fn_college_leadership_can_manage(i.id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to leadership posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'code', p.code, 'label', p.label, 'description', p.description,
               'kind', p.kind, 'is_builtin', p.is_builtin
             ) ORDER BY p.sort_order, p.label
           )
      FROM public.leadership_posts p
     WHERE p.is_active
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_leadership_posts() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_leadership_posts() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Create / rename / retire a custom post.
--
-- The catalog row is GLOBAL, so renaming or retiring a post that another
-- institution uses would change that institution's page. Refused unless the
-- caller may manage every institution using it (super admins / admins always
-- can — fn_college_leadership_can_manage is true for them everywhere).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_leadership_post(
  p_label       text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := btrim(COALESCE(p_label, ''));
  v_code  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institutions i
     WHERE public.fn_college_leadership_can_manage(i.id)
  ) THEN
    RAISE EXCEPTION
      'You do not have permission to add leadership posts. Ask a super admin to '
      'grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF char_length(v_label) < 2 OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'A post name must be between 2 and 60 characters.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_code := lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '_', 'g'));
  v_code := btrim(v_code, '_');
  IF v_code !~ '^[a-z][a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION
      'Post name "%" must start with a letter and use letters or numbers.', v_label
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (SELECT 1 FROM public.leadership_posts p
              WHERE p.code = v_code OR lower(p.label) = lower(v_label)) THEN
    RAISE EXCEPTION 'A post called "%" already exists.', v_label
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.leadership_posts (code, label, description, sort_order, kind, is_builtin, created_by)
  VALUES (
    v_code, v_label, NULLIF(btrim(COALESCE(p_description, '')), ''),
    COALESCE((SELECT max(sort_order) FROM public.leadership_posts), 0) + 10,
    'generic', false, auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'label', v_label);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_create_leadership_post(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_leadership_post(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_update_leadership_post(
  p_code        text,
  p_label       text,
  p_description text    DEFAULT NULL,
  p_retire      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post  public.leadership_posts%ROWTYPE;
  v_label text := btrim(COALESCE(p_label, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_post FROM public.leadership_posts WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such post.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_post.is_builtin THEN
    RAISE EXCEPTION '% is a built-in post and cannot be renamed or retired.', v_post.label
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institutions i
     WHERE public.fn_college_leadership_can_manage(i.id)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change leadership posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.institution_leadership_posts ilp
     WHERE ilp.post_code = p_code
       AND NOT public.fn_college_leadership_can_manage(ilp.institution_id)
  ) THEN
    RAISE EXCEPTION
      '% is used by institutions outside your scope, so only a super admin can '
      'rename or retire it.', v_post.label
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_retire THEN
    IF EXISTS (SELECT 1 FROM public.institution_leadership il
                WHERE il.position = p_code AND il.is_active) THEN
      RAISE EXCEPTION 'Someone still holds %. Clear the post first.', v_post.label
        USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.institution_leadership_posts WHERE post_code = p_code;
    UPDATE public.leadership_posts
       SET is_active = false, updated_at = now()
     WHERE code = p_code;
    RETURN jsonb_build_object('ok', true, 'code', p_code, 'retired', true);
  END IF;

  IF char_length(v_label) < 2 OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'A post name must be between 2 and 60 characters.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (SELECT 1 FROM public.leadership_posts p
              WHERE p.code <> p_code AND lower(p.label) = lower(v_label)) THEN
    RAISE EXCEPTION 'A post called "%" already exists.', v_label
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.leadership_posts
     SET label       = v_label,
         description = NULLIF(btrim(COALESCE(p_description, '')), ''),
         updated_at  = now()
   WHERE code = p_code;

  RETURN jsonb_build_object('ok', true, 'code', p_code, 'label', v_label);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_update_leadership_post(text, text, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_update_leadership_post(text, text, text, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Read one college's posts (applicable ones only, with their holders).
--
-- Built-in holders come from fn_get_college_leadership, the resolver that
-- already handles the explicit-row / derived-principal fallback and basis
-- fields, so this cannot disagree with it. Custom holders come from
-- institution_leadership.
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
    SELECT 1 FROM public.institution_leadership_posts ilp
     WHERE ilp.institution_id = p_institution_id
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
                 'holder',
                   CASE
                     WHEN p.kind <> 'generic' THEN
                       CASE WHEN jsonb_typeof(v_lead -> p.code) = 'object'
                            THEN v_lead -> p.code END
                     ELSE (
                       SELECT jsonb_build_object(
                                'user_id',          pr.id,
                                'full_name',        pr.full_name,
                                'email',            pr.email,
                                'assigned_at',      il.assigned_at,
                                'assigned_by_name', ab.full_name
                              )
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
         AND (
           EXISTS (SELECT 1 FROM public.institution_leadership_posts ilp
                    WHERE ilp.institution_id = p_institution_id
                      AND ilp.post_code = p.code)
           OR (NOT v_has_own AND p.is_builtin)
         )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_college_posts(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_college_posts(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Overview: institutions and schools only, posts as data.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_leadership_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(
    jsonb_agg(public.fn_get_college_posts(i.id) - 'committee_id' ORDER BY i.name),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.institutions i
  WHERE i.is_active
    AND i.entity_type IN ('institution', 'school')
    AND public.fn_college_leadership_can_manage(i.id);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_overview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_leadership_overview() TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Choose which posts apply to an institution.
--
-- Removing a post that still has a live holder is REFUSED: silently dropping it
-- would orphan a real appointment (a Principal who still has the role but no
-- longer appears anywhere). The holder is cleared first, on purpose.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_institution_leadership_posts(
  p_institution_id uuid,
  p_codes          text[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes   text[] := COALESCE(p_codes, '{}');
  v_current jsonb;
  v_bad     text;
  v_held    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have permission to change leadership posts for this institution.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF cardinality(v_codes) = 0 THEN
    RAISE EXCEPTION 'Choose at least one post for this institution.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c INTO v_bad
    FROM unnest(v_codes) AS c
   WHERE NOT EXISTS (SELECT 1 FROM public.leadership_posts p
                      WHERE p.code = c AND p.is_active)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown or retired post: %', v_bad
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The posts in force right now (explicit rows, or the built-in fallback), so
  -- the holder check below also covers an institution that has never customised.
  v_current := public.fn_get_college_posts(p_institution_id) -> 'posts';

  SELECT (e ->> 'label') INTO v_held
    FROM jsonb_array_elements(v_current) e
   WHERE NOT ((e ->> 'code') = ANY (v_codes))
     AND jsonb_typeof(e -> 'holder') = 'object'
   LIMIT 1;
  IF v_held IS NOT NULL THEN
    RAISE EXCEPTION
      '% is filled. Clear the post before removing it from this institution.', v_held
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.institution_leadership_posts
   WHERE institution_id = p_institution_id
     AND NOT (post_code = ANY (v_codes));

  INSERT INTO public.institution_leadership_posts (institution_id, post_code)
  SELECT p_institution_id, c FROM unnest(v_codes) AS c
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'institution_id', p_institution_id, 'codes', v_codes);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_institution_leadership_posts(uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_institution_leadership_posts(uuid, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. Name (or clear) the holder of a CUSTOM post.
--
-- NO user_roles / profiles.role writes. Built-in posts are refused here and stay
-- on fn_set_college_leadership.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_college_post_holder(
  p_institution_id uuid,
  p_position       text,
  p_user_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_post         public.leadership_posts%ROWTYPE;
  v_inst_name    text;
  v_subject_inst uuid;
  v_subject_name text;
  v_has_grant    boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have permission to change leadership for this institution. '
      'Ask a super admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_post FROM public.leadership_posts WHERE code = p_position AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown leadership position: %', p_position
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_post.kind <> 'generic' THEN
    RAISE EXCEPTION '% is a built-in post and is assigned through the standard path.', v_post.label
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institution_leadership_posts ilp
     WHERE ilp.institution_id = p_institution_id AND ilp.post_code = p_position
  ) THEN
    RAISE EXCEPTION '% is not enabled for this institution.', v_post.label
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.name INTO v_inst_name FROM public.institutions i WHERE i.id = p_institution_id;
  IF v_inst_name IS NULL THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT p.institution_id, COALESCE(p.full_name, p.email, 'that person')
      INTO v_subject_inst, v_subject_name
      FROM public.profiles p WHERE p.id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That person has no MyJKKN profile.' USING ERRCODE = 'no_data_found';
    END IF;

    v_has_grant := EXISTS (
      SELECT 1 FROM public.user_institution_access uia
       WHERE uia.user_id = p_user_id
         AND uia.institution_id = p_institution_id
         AND uia.is_active
    );
    IF (v_subject_inst IS NULL OR v_subject_inst <> p_institution_id) AND NOT v_has_grant THEN
      RAISE EXCEPTION
        '% is not attached to %. Grant them access to it, or move their profile '
        'there, and try again.', v_subject_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Retire every other live holder (history kept; the partial unique index
  -- counts live rows only).
  UPDATE public.institution_leadership
     SET is_active = false, updated_at = now()
   WHERE institution_id = p_institution_id
     AND position = p_position
     AND is_active
     AND (p_user_id IS NULL OR user_id <> p_user_id);

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.institution_leadership (
      institution_id, position, user_id, assigned_by, is_active
    )
    VALUES (p_institution_id, p_position, p_user_id, v_actor, true)
    ON CONFLICT (institution_id, position) WHERE is_active
    DO UPDATE SET user_id     = EXCLUDED.user_id,
                  assigned_by = EXCLUDED.assigned_by,
                  assigned_at = now(),
                  updated_at  = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'position', p_position,
    'institution_id', p_institution_id, 'user_id', p_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_college_post_holder(uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_college_post_holder(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_set_college_post_holder(uuid, text, uuid) IS
  'Holder of a CUSTOM (kind=generic) leadership post. Writes institution_leadership '
  'only — never user_roles or profiles.role. Built-in posts stay on '
  'fn_set_college_leadership.';
