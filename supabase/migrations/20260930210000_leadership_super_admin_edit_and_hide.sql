-- ============================================================================
-- College Leadership — super-admin-only editing, and per-institution Show/Hide.
-- Created: 2026-09-30.
--
-- 1. EVERY write is super admin only. Anyone else who can reach the page
--    (organizations.leadership.manage, within their institutions) is VIEW-ONLY.
--
--    How: a thin gate layer. Each write RPC is renamed to <name>_impl, made
--    uncallable by clients, and a same-name, same-signature wrapper checks
--    is_super_admin() and delegates. The 380-line fn_set_college_leadership —
--    which also writes global roles — is deliberately NOT re-copied: its body
--    stays byte-for-byte what was reviewed. Client calls (named parameters) keep
--    working unchanged. The gate only ever makes access stricter.
--
-- 2. A per-institution "shown on this page" switch. Hiding is a page-visibility
--    preference for the Leadership screen, NOT an access boundary: it does not
--    revoke anyone's access to the institution anywhere else.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. Wrap the write RPCs. Re-runnable: a function already wrapped (its _impl
--     exists) is skipped.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('fn_set_college_leadership',
       'uuid, text, uuid, uuid, text, text'),
      ('fn_set_college_post_holder',
       'uuid, text, uuid'),
      ('fn_set_institution_leadership_posts',
       'uuid, text[]'),
      ('fn_create_leadership_post',
       'text, text, text, uuid'),
      ('fn_update_leadership_post',
       'text, text, text, boolean'),
      ('fn_set_group_post_holder',
       'text, uuid'),
      ('fn_search_group_candidates',
       'text, uuid[], uuid, boolean, boolean, integer, integer'),
      ('fn_list_group_candidate_roles',
       '')
    ) AS t(fname, args)
  LOOP
    IF to_regprocedure(format('public.%I_impl(%s)', r.fname, r.args)) IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF to_regprocedure(format('public.%I(%s)', r.fname, r.args)) IS NULL THEN
      RAISE EXCEPTION 'Expected function public.%(%) not found', r.fname, r.args;
    END IF;

    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', r.fname, r.args, r.fname || '_impl');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC, authenticated',
                   r.fname || '_impl', r.args);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1b. The wrappers. Same names, parameter names and defaults as before.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_college_leadership(
  p_institution_id uuid,
  p_position       text,
  p_user_id        uuid DEFAULT NULL,
  p_department_id  uuid DEFAULT NULL,
  p_basis_code     text DEFAULT NULL,
  p_basis_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_set_college_leadership_impl(
    p_institution_id, p_position, p_user_id, p_department_id, p_basis_code, p_basis_note);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_set_college_post_holder_impl(p_institution_id, p_position, p_user_id);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_set_institution_leadership_posts_impl(p_institution_id, p_codes);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_create_leadership_post_impl(p_label, p_description, p_scope, p_institution_id);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_update_leadership_post_impl(p_code, p_label, p_description, p_retire);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change leadership. You have view-only access.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_set_group_post_holder_impl(p_post_code, p_user_id);
END;
$$;

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
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can appoint group-level posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_search_group_candidates_impl(
    p_query, p_role_ids, p_institution_id, p_active_only, p_staff_only, p_limit, p_offset);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_list_group_candidate_roles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can appoint group-level posts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_list_group_candidate_roles_impl();
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('fn_set_college_leadership',          'uuid, text, uuid, uuid, text, text'),
      ('fn_set_college_post_holder',          'uuid, text, uuid'),
      ('fn_set_institution_leadership_posts','uuid, text[]'),
      ('fn_create_leadership_post',          'text, text, text, uuid'),
      ('fn_update_leadership_post',          'text, text, text, boolean'),
      ('fn_set_group_post_holder',           'text, uuid'),
      ('fn_search_group_candidates',         'text, uuid[], uuid, boolean, boolean, integer, integer'),
      ('fn_list_group_candidate_roles',      '')
    ) AS t(fname, args)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', r.fname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.fname, r.args);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1c. Who can edit, for the screen. Group card controls follow the same rule.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_leadership_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND COALESCE(public.is_super_admin(), false);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_can_edit() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_leadership_can_edit() TO authenticated;

-- fn_list_group_leadership: can_manage_group now means SUPER ADMIN (it was
-- admin-or-super). Read access is unchanged: admins and manage-key holders.
CREATE OR REPLACE FUNCTION public.fn_list_group_leadership()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edit boolean := COALESCE(is_super_admin(), false);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_edit AND NOT COALESCE(is_admin(), false) AND NOT EXISTS (
    SELECT 1 FROM public.institutions i WHERE public.fn_college_leadership_can_manage(i.id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to group leadership.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'can_manage_group', v_edit,
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
-- 2. Show / hide an institution on the Leadership page.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leadership_hidden_institutions (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
  hidden_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hidden_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leadership_hidden_institutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leadership_hidden_institutions FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.leadership_hidden_institutions TO authenticated;

DROP POLICY IF EXISTS leadership_hidden_select_permission ON public.leadership_hidden_institutions;
CREATE POLICY leadership_hidden_select_permission
  ON public.leadership_hidden_institutions
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('organizations.leadership.manage'), false)
  );

CREATE OR REPLACE FUNCTION public.fn_set_leadership_institution_hidden(
  p_institution_id uuid,
  p_hidden         boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can show or hide institutions on this page.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_institution_id) THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  IF COALESCE(p_hidden, false) THEN
    INSERT INTO public.leadership_hidden_institutions (institution_id, hidden_by)
    VALUES (p_institution_id, auth.uid())
    ON CONFLICT (institution_id) DO NOTHING;
  ELSE
    DELETE FROM public.leadership_hidden_institutions WHERE institution_id = p_institution_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'institution_id', p_institution_id, 'hidden', COALESCE(p_hidden, false));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_leadership_institution_hidden(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_leadership_institution_hidden(uuid, boolean) TO authenticated;

-- Overview: hidden institutions are omitted for everyone except super admins,
-- who receive them flagged `hidden: true` so they can bring them back.
CREATE OR REPLACE FUNCTION public.fn_leadership_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edit   boolean := COALESCE(is_super_admin(), false);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      (public.fn_get_college_posts(i.id) - 'committee_id')
        || jsonb_build_object(
             'entity_type', i.entity_type,
             'hidden', EXISTS (SELECT 1 FROM public.leadership_hidden_institutions h
                                WHERE h.institution_id = i.id)
           )
      ORDER BY i.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.institutions i
  WHERE i.is_active
    AND i.entity_type IN ('institution', 'school')
    AND public.fn_college_leadership_can_manage(i.id)
    AND (v_edit OR NOT EXISTS (SELECT 1 FROM public.leadership_hidden_institutions h
                                WHERE h.institution_id = i.id));

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_overview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_leadership_overview() TO authenticated;
