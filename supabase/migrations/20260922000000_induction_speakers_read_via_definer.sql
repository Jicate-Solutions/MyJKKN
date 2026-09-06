-- ============================================================================
-- Induction — an induction.view / induction.manage holder can actually READ a
-- session's resource persons. The branch that was supposed to let them has been
-- dead since 2026-06-28.
-- File: 20260922000000_induction_speakers_read_via_definer.sql | Date: 2026-09-22
--
-- SYMPTOM (reported 2026-08-22, /events/induction/91c0d6e9-…, JKKN College of
-- Pharmacy)
--   An Induction Lead opens a session in the schedule editor. The "Resource
--   persons (linked users)" box is EMPTY — no chips — even though the session
--   has a linked resource person and a super-admin sees them. The session cards
--   show no resource-person badges either. Nothing errors; it reads as "nobody
--   has been assigned yet".
--
--   Worse, and this is what makes it a data-loss bug rather than a display bug:
--   the editor loads the existing set, sees zero rows with NO error, marks the
--   set "loaded", and on save calls fn_induction_set_session_speakers(sid, []).
--   That RPC is replace-set — it DELETEs then re-inserts — and the Lead passes
--   its authorization gate (induction.manage + institution access). So the Lead
--   editing a session title silently deletes every resource person on it.
--   ("previous added list removed".)
--
-- ROOT CAUSE — an RLS policy is evaluated with the QUERYING role's privileges,
-- so every table it joins is itself subject to RLS.
--
--   ess_select's fourth branch is:
--
--       EXISTS (SELECT 1
--                 FROM event_sessions es
--                 JOIN induction_programs ip ON ip.event_id = es.event_id
--                WHERE es.id = event_session_speakers.session_id
--                  AND (user_has_permission('induction.view')
--                    OR user_has_permission('induction.manage'))
--                  AND role_has_institution_access(ip.institution_id))
--
--   event_sessions has exactly ONE policy, event_sessions_admin FOR ALL:
--       (is_super_admin() OR is_admin())
--
--   For any non-admin, `es` therefore yields NO rows, EXISTS is false, and the
--   branch can never fire — regardless of permissions or institution scope. The
--   permission and institution tests inside it are unreachable code.
--
--   The sibling policy added three days later already knew this. 20260702151000
--   says so in its own header: "SECURITY DEFINER so the RLS policy below can
--   traverse event_sessions (whose own RLS is admin-only) without recursion."
--   ess_select was never given the same treatment.
--
--   That is why only three groups could ever see a speaker row:
--     • super-admin / admin            → branches 1-2
--     • the person themselves          → branch 3 (profile_id = auth.uid())
--     • a credited speaker on the event → ess_event_speaker_read, which does use
--                                         a DEFINER helper
--   The per-event coordinator who actually built this schedule reads it today
--   only by the accident of also being a speaker on it.
--
-- MEASURED, not estimated (impersonated via request.jwt.claims, 2026-08-22):
--   Induction Lead c19665ec-33fd-4008-b057-e5fe6860343c
--     user_has_permission('induction.view')                       = true
--     user_has_permission('induction.manage')                     = true
--     role_has_institution_access('5736d86f-…' JKKN Pharmacy)      = true
--     is_admin()                                                  = false
--     count(*) FROM event_sessions        WHERE id = '<session>'   = 0
--     count(*) FROM event_session_speakers                         = 0   ← whole platform
--     branch-4 predicate                                           = false
--     branch-4 predicate with event_sessions dropped from the join = true
--
-- THE FIX — move the traversal into a SECURITY DEFINER helper. The predicate is
-- reproduced VERBATIM; no branch is added, removed or widened. This grants no
-- authority the policy did not already claim to grant in 2026-06-28 — it only
-- lets the existing test actually run.
--
-- BLAST RADIUS: ess_select is the ONLY policy in the database whose expression
-- traverses event_sessions (verified against pg_policy), so this defect and this
-- fix are confined to event_session_speakers.
--
-- NOT IN SCOPE (deliberately, decide separately):
--   • A per-event coordinator with NO induction.view and no institution access
--     to the event's college still cannot read the links. Today's coordinators
--     all hold induction.view via the induction_coordinator role, so nobody on
--     the reported page needs it; adding a coordinator branch to a READ policy
--     is a separate authority decision.
--   • anon holds the default Supabase table grants on event_session_speakers
--     (SELECT/INSERT/UPDATE/DELETE). RLS blocks every row, so nothing leaks, but
--     the grant should be revoked as its own change.
--   • The client treats "zero rows" as "no speakers" and will therefore wipe on
--     save again if any future policy narrows this read. A guard belongs in
--     sessions-section.tsx, not here.
-- ============================================================================

-- ── The traversal, run with the definer's privileges ────────────────────────
-- SECURITY DEFINER for exactly one reason: to read event_sessions, whose RLS is
-- admin-only. It is NOT a bypass — the authorization it applies (induction.view
-- / induction.manage AND role_has_institution_access) is the caller's own, byte
-- for byte the test ess_select has always specified.
--
-- No recursion risk: induction_programs_speaker_view calls
-- fn_induction_is_event_speaker(), which reads event_session_speakers — but a
-- DEFINER function owned by the table owner does not re-enter RLS. This mirrors
-- fn_induction_session_in_my_speaker_event (20260702151000), live since then.
CREATE OR REPLACE FUNCTION public.fn_induction_can_read_session_speakers(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_sessions es
    JOIN public.induction_programs ip ON ip.event_id = es.event_id
    WHERE es.id = p_session_id
      AND (public.user_has_permission('induction.view')
        OR public.user_has_permission('induction.manage'))
      AND public.role_has_institution_access(ip.institution_id)
  );
$$;

COMMENT ON FUNCTION public.fn_induction_can_read_session_speakers(uuid) IS
  'May the caller read the resource-person links of this induction session? '
  'SECURITY DEFINER solely so the check can traverse event_sessions (admin-only '
  'RLS); the authorization applied is the caller''s own induction.view/manage '
  'plus institution access. Called from ess_select on event_session_speakers.';

-- Answers only about auth.uid(), which is NULL for anon, so anon would get
-- `false` anyway — but the policy below is scoped TO authenticated, so anon
-- never reaches it and has no reason to hold EXECUTE.
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_read_session_speakers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_read_session_speakers(uuid) TO authenticated;

-- ── The policy, with branch 4 delegated ─────────────────────────────────────
-- TO authenticated (was untargeted/PUBLIC): every branch already required
-- auth.uid(), so anon has always read zero rows here and still does. Scoping it
-- matters because Postgres does not guarantee OR short-circuits — an anon
-- SELECT could otherwise evaluate the helper and raise permission-denied where
-- it used to return an empty set. service_role is BYPASSRLS, so server-side
-- routes using the service key are unaffected.
-- The first three branches are reproduced verbatim, InitPlan wrappers included.
DROP POLICY IF EXISTS ess_select ON public.event_session_speakers;
CREATE POLICY ess_select ON public.event_session_speakers
FOR SELECT TO authenticated
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR profile_id = (SELECT auth.uid())
  -- was: EXISTS (... FROM event_sessions es JOIN induction_programs ip ...),
  -- which RLS on event_sessions made permanently false for non-admins.
  OR public.fn_induction_can_read_session_speakers(session_id)
);
