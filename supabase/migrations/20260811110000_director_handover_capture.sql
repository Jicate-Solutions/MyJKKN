-- ============================================================================
-- Director's Desk — PR 2 of 5: the capture control's server half.
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md
-- Depends on: 20260811100000, 20260811100100, 20260811100200 (PR #2827, the
--             spine) for fn_can_hand_over(). Apply order is
--             100000 -> 100100 -> 100200 -> 110000.
--
-- WHAT THIS ADDS — one function, and it is a NEW one.
-- ---------------------------------------------------
-- fn_handover_people_search — the picker behind "who is this for".
-- A raw-UUID member picker was a real reported defect in this repo
-- (project_lc_executive_rotation_and_member_picker, 2026-07-31: PR #2702 sat
-- green-and-unmerged because the only way to name a person was to paste their
-- UUID). The Director is choosing a colleague in a hurry; he knows a name,
-- never an id. So name search is a first-class server capability, not a
-- client-side filter over a list the client had to fetch first.
--
-- ============================================================================
-- 🛑 WHAT THIS FILE DELIBERATELY DOES **NOT** DO — READ BEFORE EDITING
--
-- It does NOT redefine fn_director_handover_create. An earlier revision did,
-- and that was a live cross-tenant hole with no visible symptom:
--
--   * It carried a COPY of the spine's function body, taken before the spine's
--     review fixes landed (spine head b791fc4, 35 seconds later).
--   * The copy was missing v_is_super, v_grantee_inst, the
--     "You can only hand work to someone at your own institution" refusal, and
--     the `array_agg(DISTINCT btrim(k))` normalisation. It also recorded the
--     GRANTEE's institution on the row instead of the granter's.
--   * 110000 > 100200, so on a fresh ordered apply the copy WON, silently
--     deleting the guard. Two different files, so git reported no conflict and
--     no reviewer saw a diff. Nothing anywhere flagged the reversion.
--
--   Reproduced on Postgres 16 with the real migrations, no super admin
--   involved: a Director at College A handed a key to a clerk at College B,
--   the row was created, and user_has_permission() returned TRUE for that
--   clerk. Amplifier: 18 non-learner profiles have institution_id IS NULL.
--
-- The access-level rejection that was this file's excuse for redefining the
-- function now lives in the spine itself (20260811100200), which is where a
-- change to that function belongs. There is nothing left to add here.
--
-- THE RULE THIS FILE NOW FOLLOWS: a later migration NEVER re-issues CREATE OR
-- REPLACE on a director-desk security function just to append a check. Postgres
-- cannot amend a body in place, so "replace wholesale and keep them in step" is
-- a promise no review can verify and merge order silently breaks. Change the
-- function where it is defined. This is enforced by
-- __tests__/director-desk/migration-order.test.ts, which fails if any migration
-- above 20260811100200 redefines it, and separately asserts that the winning
-- definition in the tree still carries the cross-tenant guard.
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
