-- ============================================================================
-- /my-desk — the two reads the receiving side needs and cannot get any other way.
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md (PR 3 — the receiver's desk)
-- Depends on: 20260811100000 (tables + walls), 20260811100200 (lifecycle RPCs)
--
-- /my-desk reads director_handovers directly through the session client, so RLS
-- (`grantee_user_id = auth.uid()`) does the scoping. That is deliberate and the
-- page adds NOTHING on top of it — the whole point of the feature is that a
-- person whose only access came from a handover can still open this page.
--
-- Two things that read cannot answer honestly, and both are answered here.
--
-- 1. WHY fn_my_desk_probe EXISTS
--    RLS denial is silent: PostgREST answers a denied read with zero rows and
--    error === null (feedback_rls_denial_is_always_silent). So an empty desk is
--    ambiguous between "nothing has been handed to you" and "we could not read
--    your rows", and the page cannot tell which without a second, independent
--    source of truth. This function is that source: SECURITY DEFINER, so it
--    counts what actually exists for the caller regardless of policy, and the
--    page compares the two. If the definer count exceeds what the session read
--    returned, the page says so instead of reporting an empty desk as fact.
--
--    It returns COUNTS ONLY — never a row, never a title, never a route. A
--    counting function cannot become a way around the policy it is measuring.
--
-- 2. WHY fn_my_desk_people EXISTS
--    Every item has to name who handed it over, and every audit line has to
--    name who acted. Both are profile ids. profiles_select_policy admits
--    `auth.uid() = id OR is_pre_registered = false`, so a direct read USUALLY
--    works and silently returns nothing for a pre-registered profile — which
--    would render "handed over by —" with no explanation. Rather than depend on
--    that accident, the names come from here, scoped to exactly the people
--    already named on the caller's own handovers and their audit trail. It
--    takes no arguments on purpose: a function that accepted a list of ids
--    would be a directory lookup for any id the caller cared to guess.
-- ============================================================================

-- ============================================================================
-- 1. THE READABILITY PROBE — counts only, never content
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_desk_probe()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- NO IDENTITY, NO ANSWER. Without this branch an expired or malformed JWT
    -- reaches the aggregate below, matches nothing, and returns
    -- {checked: true, total_count: 0} — which the page would read as a
    -- CONFIRMED empty desk and render as "Nothing has been handed to you. We
    -- checked." That is precisely the sentence this whole design exists to
    -- never get wrong, arrived at from a read that identified nobody.
    WHEN (SELECT auth.uid()) IS NULL THEN jsonb_build_object('checked', false)

    ELSE (
      SELECT jsonb_build_object(
        'checked',      true,
        -- pending and accepted are the two statuses that still grant access.
        'open_count',   COUNT(*) FILTER (WHERE dh.status IN ('pending','accepted')),
        'closed_count', COUNT(*) FILTER (WHERE dh.status NOT IN ('pending','accepted')),
        'total_count',  COUNT(*)
      )
      FROM public.director_handovers dh
      WHERE dh.grantee_user_id = (SELECT auth.uid())
    )
  END;
$$;

COMMENT ON FUNCTION public.fn_my_desk_probe() IS
  'Counts the caller''s own handovers bypassing RLS so /my-desk can tell "nothing was handed to you" apart from "we could not read your rows". Returns counts only — never row content. Answers {"checked": false} with no identity, so a missing auth.uid() can never surface as a verified empty desk.';

-- ============================================================================
-- 2. THE PEOPLE ALREADY NAMED ON THE CALLER'S OWN ROWS
--
-- OUT parameter names are prefixed `person_` because in a LANGUAGE sql function
-- with RETURNS TABLE they are in scope over the body: naming one of them
-- `email` would shadow profiles.email and select the parameter from itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_desk_people()
RETURNS TABLE (
  person_id          uuid,
  person_name        text,
  person_email       text,
  person_designation text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id,
    NULLIF(btrim(COALESCE(p.full_name, '')), ''),
    p.email,
    NULLIF(btrim(COALESCE(p.designation, '')), '')
  FROM public.profiles p
  WHERE p.id IN (
    -- whoever handed something to me
    SELECT dh.granted_by
    FROM public.director_handovers dh
    WHERE dh.grantee_user_id = (SELECT auth.uid())

    UNION

    -- whoever appears on the audit trail of something handed to me
    SELECT a.actor_user_id
    FROM public.director_handover_audit a
    JOIN public.director_handovers dh2 ON dh2.id = a.handover_id
    WHERE dh2.grantee_user_id = (SELECT auth.uid())
      AND a.actor_user_id IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.fn_my_desk_people() IS
  'Display names for the people already named on the caller''s own handovers and their audit trail. Takes no arguments on purpose — an id-taking version would be a directory lookup for any id the caller guessed.';

-- ============================================================================
-- 3. GRANTS
--
-- anon is revoked EXPLICITLY. Supabase runs
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, which is a
-- direct grant separate from PUBLIC, so revoking PUBLIC alone leaves both of
-- these callable by anyone holding the anon key that ships in every JS bundle.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_my_desk_probe()  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_probe()  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_my_desk_people() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_people() TO authenticated;

NOTIFY pgrst, 'reload schema';
