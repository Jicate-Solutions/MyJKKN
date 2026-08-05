-- ============================================================================
-- Director's Desk — PR 2 of 5: the capture control's server half.
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md
-- Depends on: 20260811100000, 20260811100100, 20260811100200 (PR #2827, the
--             spine). This migration REPLACES fn_director_handover_create and
--             therefore CANNOT be applied before the spine exists. Apply order
--             is 100000 -> 100100 -> 100200 -> 110000.
--
-- WHAT THIS ADDS
-- --------------
-- 1. fn_handover_people_search — the picker behind "who is this for".
--    A raw-UUID member picker was a real reported defect in this repo
--    (project_lc_executive_rotation_and_member_picker, 2026-07-31: PR #2702 sat
--    green-and-unmerged because the only way to name a person was to paste
--    their UUID). The Director is choosing a colleague in a hurry; he knows a
--    name, never an id. So name search is a first-class server capability, not
--    a client-side filter over a list the client had to fetch first.
--
-- 2. fn_director_handover_create gains a SECOND named rejection: keys that the
--    chosen access level cannot carry.
--
-- WHY (2) MATTERS — it is the same failure the walls already guard against.
--    fn_handover_grants_key re-checks fn_handover_key_allowed_at_level at CHECK
--    time. So handing over `improvement.board.manage` at the `watch` level
--    writes a row that grants NOTHING: the Director believes he delegated the
--    page, the receiver opens it and gets the access-denied panel, and the row
--    looks perfectly healthy on both desks. That is precisely the "half-works"
--    outcome the spine's wall comment calls the worst possible one — the walls
--    were given a NAMED list for exactly this reason, and the access level had
--    been left silent.
--
--    Unlike a wall, this one is FIXABLE by the Director in the same dialog:
--    raise the level to Full and submit again. So the message says which keys
--    and what each level carries, rather than just refusing.
-- ============================================================================

-- ============================================================================
-- 1. FIND A PERSON BY NAME
--
-- SECURITY DEFINER because the answer must not depend on whatever slice of
-- `profiles` the caller's RLS happens to expose. RLS denial is silent — 0 rows
-- with error === null (feedback_rls_denial_is_always_silent) — so a picker
-- built on a plain .from('profiles') select is indistinguishable from
-- "nobody by that name works here". Fail-closed on authorisation, but LOUDLY.
--
-- Scoping, in order:
--   * fn_can_hand_over() — same gate as the write path, so a caller who could
--     not create a handover cannot use this to enumerate the directory either.
--   * role_has_institution_access() — the house multi-tenant helper. A Director
--     scoped to one college sees that college; a super admin (or an 'all'-scope
--     role) sees everyone. NULL institution_id is system-wide by that helper's
--     own definition.
--   * active, login-enabled accounts only. fn_director_handover_create rejects
--     an inactive grantee anyway; surfacing them here would only produce a
--     picker whose entries fail on submit.
--   * learners are excluded (learner_id IS NOT NULL, or role = 'student').
--     Decision 6 frames the receiver as a colleague. FLAGGED as a judgment
--     call: if a learner ever needs a handover, delete these two lines.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_people_search(p_query text)
RETURNS TABLE (
  id               uuid,
  full_name        text,
  email            text,
  role             text,
  designation      text,
  institution_id   uuid,
  institution_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- Every OUT column below (id, role, email, institution_id …) also becomes a
-- plpgsql variable, and several of them share a name with a profiles column.
-- All references in the query are table-qualified, but use_column removes the
-- entire class of "column reference is ambiguous" failure rather than relying
-- on that discipline surviving the next edit.
#variable_conflict use_column
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF NOT public.fn_can_hand_over() THEN
    RAISE EXCEPTION 'Not authorised to hand over work'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         p.role,
         p.designation,
         p.institution_id,
         i.name AS institution_name
  FROM public.profiles p
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  WHERE COALESCE(p.is_active, true) = true
    AND COALESCE(p.is_login_disabled, false) = false
    AND p.learner_id IS NULL
    AND p.role <> 'student'
    AND p.id <> auth.uid()
    AND public.role_has_institution_access(p.institution_id)
    AND (
      v_q = ''
      OR p.full_name ILIKE '%' || v_q || '%'
      OR p.email     ILIKE '%' || v_q || '%'
    )
  -- Exact-prefix matches first: typing "Bo" should surface Boobalan before
  -- everyone whose email merely contains "bo".
  ORDER BY (p.full_name ILIKE v_q || '%') DESC NULLS LAST,
           p.full_name ASC NULLS LAST
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION public.fn_handover_people_search(text) IS
  'Name search for the hand-over picker. Gated on fn_can_hand_over() and scoped by role_has_institution_access(). Exists so the picker never asks anyone to paste a UUID.';

REVOKE EXECUTE ON FUNCTION public.fn_handover_people_search(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_people_search(text) TO authenticated;

-- ============================================================================
-- 2. CREATE — unchanged from 20260811100200 except for the ACCESS-LEVEL block
--    marked NEW below.
--
-- Replaced wholesale rather than patched, because PostgreSQL has no way to
-- amend a function body in place. If the spine's body changes, this file is the
-- one that wins on a fresh apply — keep them in step.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_create(
  p_route           text,
  p_title           text,
  p_permission_keys text[],
  p_grantee_user_id uuid,
  p_due_date        date,
  p_access_level    text DEFAULT 'update',
  p_note            text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.director_handovers;
  v_blocked   text[];
  v_too_high  text[];
  v_clean     text[];
  v_inst      uuid;
BEGIN
  IF NOT public.fn_can_hand_over() THEN
    RAISE EXCEPTION 'Not authorised to hand over work'
      USING ERRCODE = '42501';
  END IF;

  IF p_grantee_user_id IS NULL OR p_due_date IS NULL
     OR p_route IS NULL OR btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'route, title, grantee and due date are all required'
      USING ERRCODE = '22023';
  END IF;

  IF p_due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Due date is in the past — the handover would be dead on arrival'
      USING ERRCODE = '22023';
  END IF;

  IF p_access_level NOT IN ('watch','update','full') THEN
    RAISE EXCEPTION 'access_level must be watch, update or full'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_grantee_user_id AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'That person does not have an active account'
      USING ERRCODE = '22023';
  END IF;

  IF p_grantee_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot hand work to yourself'
      USING ERRCODE = '22023';
  END IF;

  -- ---- THE WALLS (unchanged) ----------------------------------------------
  SELECT array_agg(k) INTO v_blocked
  FROM unnest(COALESCE(p_permission_keys, '{}'::text[])) AS k
  WHERE public.fn_handover_key_is_blocked(k);

  IF v_blocked IS NOT NULL AND cardinality(v_blocked) > 0 THEN
    RAISE EXCEPTION
      -- Wording note: the spine's copy of this string says "salary and staff
      -- files". Rewritten here to the house term (JKKN terminology rule) —
      -- the Director reads this string verbatim, so it is user-facing copy.
      'These cannot be handed over to anyone: %. They are permanently walled (access control, salary and team-member files, exam marks, or money movement).',
      array_to_string(v_blocked, ', ')
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT k) INTO v_clean
  FROM unnest(COALESCE(p_permission_keys, '{}'::text[])) AS k
  WHERE btrim(k) <> '';

  IF v_clean IS NULL OR cardinality(v_clean) = 0 THEN
    RAISE EXCEPTION 'This page has no permission key to hand over'
      USING ERRCODE = '22023';
  END IF;

  -- ---- NEW: THE ACCESS LEVEL ----------------------------------------------
  -- Same reasoning as the walls, one step softer. fn_handover_grants_key
  -- re-checks the level at CHECK time, so a key the level cannot carry produces
  -- a row that grants nothing and looks healthy on both desks. Named, not
  -- silently filtered — and the message says how to fix it, because unlike a
  -- wall this one is the Director's own choice one field up the dialog.
  SELECT array_agg(k) INTO v_too_high
  FROM unnest(v_clean) AS k
  WHERE NOT public.fn_handover_key_allowed_at_level(k, p_access_level);

  IF v_too_high IS NOT NULL AND cardinality(v_too_high) > 0 THEN
    RAISE EXCEPTION
      'At the "%" level these cannot be handed over: %. Watch carries view, read and export only. Update adds edit, update, submit, mark, respond and acknowledge. Choose Full if this page needs more than that.',
      p_access_level, array_to_string(v_too_high, ', ')
      USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM public.profiles WHERE id = p_grantee_user_id;

  INSERT INTO public.director_handovers (
    route, title, note, permission_keys, access_level,
    grantee_user_id, granted_by, institution_id, due_date
  ) VALUES (
    p_route, btrim(p_title), NULLIF(btrim(COALESCE(p_note,'')), ''), v_clean, p_access_level,
    p_grantee_user_id, auth.uid(), v_inst, p_due_date
  )
  RETURNING * INTO v_row;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (v_row.id, 'created', auth.uid(),
          jsonb_build_object('route', p_route, 'keys', v_clean,
                             'access_level', p_access_level,
                             'grantee', p_grantee_user_id, 'due_date', p_due_date));

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.fn_director_handover_create(text, text, text[], uuid, date, text, text) IS
  'Creates a handover. Rejects with a NAMED list twice: walled keys (permanent) and keys the chosen access level cannot carry (fixable by raising the level).';

REVOKE EXECUTE ON FUNCTION public.fn_director_handover_create(text, text, text[], uuid, date, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_director_handover_create(text, text, text[], uuid, date, text, text) TO authenticated;
