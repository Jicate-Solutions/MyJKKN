-- ============================================================================
-- College Leadership — GROUP posts and INSTITUTION-OWNED posts.
-- Created: 2026-09-30.
--
-- 20260930130000 made posts data, but the catalog was one global list: a custom
-- post appeared in every institution's picker. Two real shapes were missing:
--
--   scope = 'group'        Managing Director, Joint Managing Director. ONE holder
--                          for the whole group, appointed by an admin, shown as
--                          context — never as a per-institution vacancy.
--   owner_institution_id   any other custom post belongs to ONE institution: it
--                          is not offered to, or visible in, any other.
--
-- Shared posts (the four built-ins) stay shared and are switched on/off per
-- institution through institution_leadership_posts, exactly as before.
--
-- SAFETY RULE UNCHANGED: group and owned posts are designation records. They
-- never touch user_roles or profiles.role. fn_set_college_leadership is not
-- modified.
--
-- Owned posts are applicable to their owner BY OWNERSHIP, not through an
-- institution_leadership_posts row. That matters: fn_get_college_posts falls
-- back to the built-ins only when an institution has no *shared* applicability
-- rows, and an owned-post row would silently switch that fallback off and
-- drop Principal from a college that had never customised.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catalog columns.
-- ----------------------------------------------------------------------------
-- The one custom row that exists (`test`, retired, unused) predates ownership
-- and cannot satisfy the new rule; remove it only if nothing references it.
DELETE FROM public.leadership_posts p
 WHERE NOT p.is_builtin
   AND NOT EXISTS (SELECT 1 FROM public.institution_leadership il WHERE il.position = p.code)
   AND NOT EXISTS (SELECT 1 FROM public.institution_leadership_posts x WHERE x.post_code = p.code);

ALTER TABLE public.leadership_posts
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'institution',
  ADD COLUMN IF NOT EXISTS owner_institution_id uuid
    REFERENCES public.institutions(id) ON DELETE CASCADE;

ALTER TABLE public.leadership_posts
  DROP CONSTRAINT IF EXISTS leadership_posts_scope_check,
  DROP CONSTRAINT IF EXISTS leadership_posts_scope_owner,
  DROP CONSTRAINT IF EXISTS leadership_posts_builtin_shared,
  DROP CONSTRAINT IF EXISTS leadership_posts_generic_owned;

ALTER TABLE public.leadership_posts
  ADD CONSTRAINT leadership_posts_scope_check
    CHECK (scope IN ('group', 'institution')),
  ADD CONSTRAINT leadership_posts_scope_owner
    CHECK (scope <> 'group' OR (owner_institution_id IS NULL AND kind = 'generic')),
  ADD CONSTRAINT leadership_posts_builtin_shared
    CHECK (NOT is_builtin OR owner_institution_id IS NULL),
  ADD CONSTRAINT leadership_posts_generic_owned
    CHECK (NOT (kind = 'generic' AND scope = 'institution') OR owner_institution_id IS NOT NULL);

-- A name is unique within its owner, not globally, so two institutions can each
-- have a "Dean". Retired posts free their name.
CREATE UNIQUE INDEX IF NOT EXISTS leadership_posts_label_per_owner_key
  ON public.leadership_posts (lower(label), COALESCE(owner_institution_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS leadership_posts_owner_idx
  ON public.leadership_posts (owner_institution_id)
  WHERE owner_institution_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Group holders. One live holder per group post.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_leadership (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_code   text NOT NULL REFERENCES public.leadership_posts(code)
                ON UPDATE CASCADE ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_leadership_live_post_key
  ON public.group_leadership (post_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS group_leadership_user_idx
  ON public.group_leadership (user_id) WHERE is_active;

ALTER TABLE public.group_leadership ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.group_leadership FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.group_leadership TO authenticated;

DROP POLICY IF EXISTS group_leadership_select_permission ON public.group_leadership;
CREATE POLICY group_leadership_select_permission
  ON public.group_leadership
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('organizations.leadership.manage'), false)
  );

-- ----------------------------------------------------------------------------
-- 3. Create a post. Signature changes, so the two-argument one is DROPPED —
--    a default-argument overload beside it would make a two-argument call
--    ambiguous.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_create_leadership_post(text, text);

CREATE OR REPLACE FUNCTION public.fn_create_leadership_post(
  p_label          text,
  p_description    text DEFAULT NULL,
  p_scope          text DEFAULT 'institution',
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := btrim(COALESCE(p_label, ''));
  v_slug  text;
  v_code  text;
  v_n     integer := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_scope NOT IN ('group', 'institution') THEN
    RAISE EXCEPTION 'Unknown post scope: %', p_scope USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_scope = 'group' THEN
    IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)) THEN
      RAISE EXCEPTION 'Only an admin can add a group-level post.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_institution_id IS NOT NULL THEN
      RAISE EXCEPTION 'A group post does not belong to an institution.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    IF p_institution_id IS NULL THEN
      RAISE EXCEPTION 'Which institution is this post for?'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
      RAISE EXCEPTION
        'You do not have permission to add posts for this institution. Ask a '
        'super admin to grant you organizations.leadership.manage.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF char_length(v_label) < 2 OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'A post name must be between 2 and 60 characters.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_slug := btrim(lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '_', 'g')), '_');
  v_slug := left(v_slug, 28);
  IF v_slug !~ '^[a-z][a-z0-9_]*$' OR char_length(v_slug) < 2 THEN
    RAISE EXCEPTION 'Post name "%" must start with a letter and use letters or numbers.', v_label
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leadership_posts p
     WHERE p.is_active
       AND lower(p.label) = lower(v_label)
       AND COALESCE(p.owner_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_institution_id,        '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'A post called "%" already exists here.', v_label
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Owned codes carry a slice of the institution id so two institutions can
  -- each have a "Dean"; a retired post keeps its code, so add a counter.
  v_code := CASE WHEN p_institution_id IS NULL
                 THEN v_slug
                 ELSE v_slug || '_' || left(replace(p_institution_id::text, '-', ''), 6) END;
  WHILE EXISTS (SELECT 1 FROM public.leadership_posts p WHERE p.code = v_code) LOOP
    v_n := v_n + 1;
    v_code := CASE WHEN p_institution_id IS NULL
                   THEN v_slug || '_' || v_n
                   ELSE v_slug || '_' || left(replace(p_institution_id::text, '-', ''), 6) || '_' || v_n END;
  END LOOP;

  INSERT INTO public.leadership_posts (
    code, label, description, sort_order, kind, scope, owner_institution_id,
    is_builtin, created_by
  )
  VALUES (
    v_code, v_label, NULLIF(btrim(COALESCE(p_description, '')), ''),
    COALESCE((SELECT max(sort_order) FROM public.leadership_posts), 0) + 10,
    'generic', p_scope, p_institution_id, false, auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'label', v_label, 'scope', p_scope);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_create_leadership_post(text, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_leadership_post(text, text, text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Rename / retire. Authority follows ownership.
-- ----------------------------------------------------------------------------
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

  SELECT * INTO v_post FROM public.leadership_posts WHERE code = p_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such post.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_post.is_builtin THEN
    RAISE EXCEPTION '% is a built-in post and cannot be renamed or retired.', v_post.label
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_post.scope = 'group' THEN
    IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)) THEN
      RAISE EXCEPTION 'Only an admin can change a group-level post.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT public.fn_college_leadership_can_manage(v_post.owner_institution_id) THEN
    RAISE EXCEPTION 'You do not have permission to change posts for this institution.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_retire THEN
    IF EXISTS (SELECT 1 FROM public.institution_leadership il
                WHERE il.position = p_code AND il.is_active)
       OR EXISTS (SELECT 1 FROM public.group_leadership g
                   WHERE g.post_code = p_code AND g.is_active) THEN
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

  IF EXISTS (
    SELECT 1 FROM public.leadership_posts p
     WHERE p.code <> p_code AND p.is_active
       AND lower(p.label) = lower(v_label)
       AND COALESCE(p.owner_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(v_post.owner_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'A post called "%" already exists here.', v_label
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

-- ----------------------------------------------------------------------------
-- 5. The picker catalog for ONE institution: shared posts + its own. Never
--    another institution's post, never a group post.
--    The zero-argument version is dropped for the same overload reason as above.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_list_leadership_posts();

CREATE OR REPLACE FUNCTION public.fn_list_leadership_posts(p_institution_id uuid)
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

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION 'You do not have access to leadership posts for this institution.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'code', p.code, 'label', p.label, 'description', p.description,
               'kind', p.kind, 'is_builtin', p.is_builtin,
               'owned', p.owner_institution_id IS NOT NULL
             ) ORDER BY p.sort_order, p.label
           )
      FROM public.leadership_posts p
     WHERE p.is_active
       AND p.scope = 'institution'
       AND (p.owner_institution_id IS NULL OR p.owner_institution_id = p_institution_id)
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_leadership_posts(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_leadership_posts(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. One institution's applicable posts: owned by it, OR shared and ticked
--    (built-ins by fallback while it has never customised the shared set).
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
-- 7. Tick shared posts for an institution. Owned posts are always on for their
--    owner and are folded in automatically; another institution's post or a
--    group post is refused.
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
  v_shared  text[];
  v_bad     text;
  v_held    text;
  v_current jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have permission to change leadership posts for this institution.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Only shared posts are tickable; the caller's own posts are ignored here
  -- because they cannot be switched off.
  SELECT c INTO v_bad
    FROM unnest(COALESCE(p_codes, '{}')) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.leadership_posts p
      WHERE p.code = c AND p.is_active AND p.scope = 'institution'
        AND (p.owner_institution_id IS NULL OR p.owner_institution_id = p_institution_id)
   )
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown, retired or unavailable post: %', v_bad
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COALESCE(array_agg(p.code), '{}') INTO v_shared
    FROM public.leadership_posts p
   WHERE p.code = ANY (COALESCE(p_codes, '{}'))
     AND p.owner_institution_id IS NULL;

  IF cardinality(v_shared) = 0 THEN
    RAISE EXCEPTION 'Choose at least one shared post for this institution.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_current := public.fn_get_college_posts(p_institution_id) -> 'posts';

  SELECT (e ->> 'label') INTO v_held
    FROM jsonb_array_elements(v_current) e
   WHERE (e ->> 'owned')::boolean IS NOT TRUE
     AND NOT ((e ->> 'code') = ANY (v_shared))
     AND jsonb_typeof(e -> 'holder') = 'object'
   LIMIT 1;
  IF v_held IS NOT NULL THEN
    RAISE EXCEPTION
      '% is filled. Clear the post before removing it from this institution.', v_held
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.institution_leadership_posts ilp
   USING public.leadership_posts sp
   WHERE sp.code = ilp.post_code
     AND ilp.institution_id = p_institution_id
     AND sp.owner_institution_id IS NULL
     AND NOT (ilp.post_code = ANY (v_shared));

  INSERT INTO public.institution_leadership_posts (institution_id, post_code)
  SELECT p_institution_id, c FROM unnest(v_shared) AS c
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'institution_id', p_institution_id, 'codes', v_shared);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_institution_leadership_posts(uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_institution_leadership_posts(uuid, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Holder of an institution-owned (generic) post. Applicability is now
--    ownership, not an institution_leadership_posts row.
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

  IF v_post.scope = 'group' THEN
    RAISE EXCEPTION '% is a group-level post and is appointed from the group section.', v_post.label
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_post.kind <> 'generic' THEN
    RAISE EXCEPTION '% is a built-in post and is assigned through the standard path.', v_post.label
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_post.owner_institution_id IS DISTINCT FROM p_institution_id THEN
    RAISE EXCEPTION '% does not belong to this institution.', v_post.label
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

-- ----------------------------------------------------------------------------
-- 9. Group leadership: read (anyone who manages leadership), write (admins).
--    `can_manage_group` is returned so the screen never has to guess who is an
--    admin (useAuth() has no isSuperAdmin, and the SQL check is narrower than
--    the client's).
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
                          )
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

CREATE OR REPLACE FUNCTION public.fn_set_group_post_holder(
  p_post_code text,
  p_user_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_post  public.leadership_posts%ROWTYPE;
  v_ok    boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)) THEN
    RAISE EXCEPTION 'Only an admin can appoint group-level posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_post
    FROM public.leadership_posts
   WHERE code = p_post_code AND is_active AND scope = 'group';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such group post.' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(p.is_active, true) INTO v_ok FROM public.profiles p WHERE p.id = p_user_id;
    IF v_ok IS NULL THEN
      RAISE EXCEPTION 'That person has no MyJKKN profile.' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'That person''s profile is deactivated.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.group_leadership
     SET is_active = false, updated_at = now()
   WHERE post_code = p_post_code AND is_active
     AND (p_user_id IS NULL OR user_id <> p_user_id);

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.group_leadership (post_code, user_id, assigned_by)
    VALUES (p_post_code, p_user_id, v_actor)
    ON CONFLICT (post_code) WHERE is_active
    DO UPDATE SET user_id = EXCLUDED.user_id, assigned_by = EXCLUDED.assigned_by,
                  assigned_at = now(), updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'post', p_post_code, 'user_id', p_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_group_post_holder(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_group_post_holder(text, uuid) TO authenticated;

-- Everyone an admin may appoint: active staff with a profile.
CREATE OR REPLACE FUNCTION public.fn_list_group_candidates()
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
             jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email)
             ORDER BY p.full_name
           )
      FROM public.profiles p
     WHERE COALESCE(p.is_active, true)
       AND EXISTS (SELECT 1 FROM public.staff s
                    WHERE s.profile_id = p.id AND s.is_active)
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_group_candidates() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_group_candidates() TO authenticated;
