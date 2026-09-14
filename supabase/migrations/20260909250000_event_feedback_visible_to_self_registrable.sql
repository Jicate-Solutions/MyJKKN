-- ============================================================================
-- A form nobody can SEE cannot be answered, however open the write path is
-- ============================================================================
-- 20260909230000 lets an attendee create their own registration so an event run
-- without collecting sign-ups can still be rated, and 20260909240000 lets the
-- page ask whether that would work. Both address the WRITE. Neither is reachable,
-- because the three SELECT policies below all read:
--
--     fn_can_manage_event_feedback(event_id)
--     OR fn_my_event_registration(event_id) IS NOT NULL
--
-- A student with no registration therefore sees no form, no section and no
-- question — listForms() returns an empty array, the respond page reports "no
-- feedback is being collected", and the event console's card hides itself. The
-- self-registration path would never be offered, so the previous two migrations
-- alone fix nothing that a person can observe.
--
-- Each policy gains the same third branch: someone who MAY join in order to
-- answer may also read what they would be answering. The predicate is exactly
-- the one that decides the write, so the read can never be wider than the write
-- — a caller who can see the questions can always submit, and one who cannot
-- submit never sees them.
--
-- SCOPE — read only, and only these three tables. event_feedback_responses is
-- NOT touched: its SELECT policy is "your own registration, or you can manage",
-- and by the time anyone has a response they have a registration, so nothing
-- there is unreachable. The _manage policies are untouched: this changes who may
-- READ a questionnaire, never who may write one, and a student remains barred
-- from the builder by 20260909210000/220000.
--
-- COST: one extra STABLE function call per row on a path that already called
-- two. fn_can_self_register_for_event_feedback short-circuits on the caller
-- already holding a registration, which is the common case for an event that DID
-- collect them, so the ordinary path pays only the OR.
-- ============================================================================

DROP POLICY IF EXISTS "event_feedback_forms_select" ON public.event_feedback_forms;
CREATE POLICY "event_feedback_forms_select" ON public.event_feedback_forms
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
    -- The form's OWN id — this table is the one the predicate is keyed on.
    OR public.fn_can_self_register_for_event_feedback(id)
  );

DROP POLICY IF EXISTS "event_feedback_sections_select" ON public.event_feedback_sections;
CREATE POLICY "event_feedback_sections_select" ON public.event_feedback_sections
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
    OR public.fn_can_self_register_for_event_feedback(form_id)
  );

DROP POLICY IF EXISTS "event_feedback_questions_select" ON public.event_feedback_questions;
CREATE POLICY "event_feedback_questions_select" ON public.event_feedback_questions
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
    OR public.fn_can_self_register_for_event_feedback(form_id)
  );
