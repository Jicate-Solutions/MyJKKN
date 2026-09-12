-- ci:allow-secdef-authenticated  fn_can_self_register_for_event_feedback is
-- callable by every authenticated user ON PURPOSE and cannot be used to reach
-- another person's data. Its ONLY argument names a FORM, never a user; every
-- identity branch is pinned to (SELECT auth.uid()), and the most it returns is a
-- BOOLEAN about the CALLER. It is SECURITY DEFINER for the same reason its
-- writing twin is: it must read events_registrations past that table's own
-- SELECT policy, which is what lets a non-participant be recognised as one at
-- all.
--
-- The guard's own rule still applies to anything added to this file later:
-- a predicate that IDENTIFIES a caller is not a predicate that AUTHORISES one.
-- ============================================================================
-- The read-only twin of fn_self_register_for_event_feedback (20260909230000)
-- ============================================================================
-- WHY A SECOND FUNCTION rather than calling the writing one on page load.
-- 20260909230000 is idempotent and refuses everyone it should, so calling it
-- when the respond page opens would be SAFE — but it would also mint a
-- registration for every student who merely looked at the form and closed it.
-- The coordinator's participant list is a record of who took part, and filling
-- it with browsers would quietly corrupt the one number the feedback loop exists
-- to inform: turnout.
--
-- So the page asks THIS first. It answers "would self-registration succeed?"
-- without writing, the questions render on a yes, and the row is created at
-- SUBMIT — the moment the person actually becomes a respondent.
--
-- The alternative, discovering ineligibility only at submit, was rejected: a
-- student would fill in every answer before being told the form was never for
-- them. That is the same wall this whole change exists to remove, moved later.
--
-- The predicates below are the same ones 20260909230000 applies, in the same
-- order, minus the INSERT. They are restated rather than shared because the
-- writing twin needs each verdict as a separate early return with its own local
-- variables, and a single shared SQL expression would have to recompute the form
-- and event lookups anyway. If either file's rules change, change both — the
-- comment on each names the other.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_can_self_register_for_event_feedback(p_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH f AS (
    SELECT id, event_id, starts_at
    FROM public.event_feedback_forms
    WHERE id = p_form_id
  ),
  me AS (
    SELECT pr.id, pr.institution_id, pr.learner_id
    FROM public.profiles pr
    WHERE pr.id = (SELECT auth.uid())
  )
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM f)
    AND public.fn_event_feedback_form_open(p_form_id)
    -- Already a participant: nothing to self-register, so this is false and the
    -- page uses the registration it already has.
    AND NOT EXISTS (
      SELECT 1
      FROM public.events_registrations r, f, me
      WHERE r.event_id = f.event_id
        AND r.status NOT IN ('cancelled', 'disqualified')
        AND (r.profile_id = me.id OR (r.learner_id IS NOT NULL AND r.learner_id = me.learner_id))
    )
    -- Audience: mirrors events_auth_read, plus the all_jkkn scope, and refuses
    -- events that are not running.
    AND EXISTS (
      SELECT 1
      FROM public.events e, f, me
      WHERE e.id = f.event_id
        AND e.status NOT IN ('draft', 'cancelled')
        AND (e.scope = 'all_jkkn' OR e.institution_id = me.institution_id)
    )
    -- Attendance was taken before the window opened: only people already marked
    -- present may answer, so a new registration could never answer anyway.
    AND NOT EXISTS (
      SELECT 1
      FROM public.events_registrations r, f
      WHERE r.event_id = f.event_id
        AND r.checked_in
        AND f.starts_at IS NOT NULL
        AND r.checked_in_at IS NOT NULL
        AND r.checked_in_at < f.starts_at
    );
$$;

COMMENT ON FUNCTION public.fn_can_self_register_for_event_feedback(uuid) IS
  'Would fn_self_register_for_event_feedback succeed for the caller on this form? Read-only, so the respond page can render the questions without minting a registration for anyone who only looked. False when the caller is already registered, the form is closed, the event is outside their audience or not running, or attendance was taken before the form opened. Keep in step with 20260909230000. See 20260909240000.';

REVOKE EXECUTE ON FUNCTION public.fn_can_self_register_for_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_self_register_for_event_feedback(uuid) TO authenticated;
