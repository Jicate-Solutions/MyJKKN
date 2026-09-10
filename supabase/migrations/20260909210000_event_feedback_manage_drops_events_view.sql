-- ============================================================================
-- fn_can_manage_event_feedback must not accept a READ permission as WRITE
-- authority
-- ============================================================================
-- Reported 2026-09-09: a student opening an event saw "Manage feedback" and
-- could open the question builder. Hiding the button would have been a lie —
-- the database really did permit the writes, because this function's last
-- branch was:
--
--     public.user_has_permission('events.view')
--     AND EXISTS (SELECT 1 FROM events e WHERE e.id = p_event_id
--                   AND (e.scope = 'all_jkkn'
--                        OR public.role_has_institution_access(e.institution_id)))
--
-- `events.view` is labelled "View Events Landing" in
-- lib/constants/permissions.ts, and a scan of all 104 custom_roles shows it
-- granted to: student, faculty, event_coordinator, principal,
-- digital_coordinator, ceo, coo, managing_director, sports_coordinator,
-- jicate_staff. Every student in an institution therefore held
-- create/update/delete on that institution's event_feedback_forms,
-- event_feedback_sections and event_feedback_questions, plus SELECT on every
-- other attendee's responses — this function is the USING/WITH CHECK of all
-- the event_feedback_*_manage policies and of the responses SELECT policy's
-- manager branch.
--
-- The function's own header comment claimed it reused "the same OR-chain the
-- event_registration_form*_manage policies already use ... verbatim so the two
-- builders can never drift apart". It did not. Those policies gate on
-- `sports.tournaments.manage`, a manage-grade key held by two roles. The
-- substitution of `events.view` for it is the entire defect.
--
-- THE REPLACEMENT (Director decision, 2026-09-09): owner + in-charge. The last
-- branch becomes the events_auth_update rule — creator, or a creator-less row
-- in your own institution — which is the rule the application already uses to
-- decide who may edit the event itself (canEditEvent() in
-- app/(routes)/events/_components/event-display.tsx). fn_is_event_incharge is
-- KEPT ahead of it, and is the reason this is not simply canEditEvent(): the
-- appointed coordinator in events.config->'incharges' is neither the creator
-- nor a super admin, and is precisely the person the builder exists for.
--
-- Consequence, stated plainly: a faculty member or principal who neither
-- created the event nor is named in its in-charge list LOSES the ability to
-- manage its feedback. Adding them to the event's in-charge list restores it.
-- That is the intended trade — institution-wide write on a survey was never the
-- thing `events.view` was granted for.
--
-- No permission key is added or seeded. `events.view` keeps its correct use as
-- a SELECT gate elsewhere (event_number_counters, event_target_classes,
-- event_academic_types, event_impact_categories) — this was its only use as
-- write authority in the whole schema.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_can_manage_event_feedback(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND (
          e.created_by = auth.uid()
          OR (
            -- Imported / system-created rows carry no creator. events_auth_update
            -- treats those as owned by the institution; matched clause for clause
            -- so the two cannot drift.
            e.created_by IS NULL
            AND e.institution_id IN (
              SELECT p.institution_id
              FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.institution_id IS NOT NULL
            )
          )
        )
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_feedback(uuid) IS
  'Authority to create/edit/delete an event''s feedback forms and questions, and to read its responses. Super admin, admin, event in-charge (events.config->incharges), or the events_auth_update owner rule (creator, or a creator-less row in your institution). Deliberately does NOT accept events.view: that is a read key held by students and faculty. See 20260909210000_event_feedback_manage_drops_events_view.sql.';

-- Lock the function from anon. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase grants anon on top, so a new SECURITY DEFINER function is callable by
-- an unauthenticated client unless this is stated. Every branch of the gate above
-- resolves through auth.uid(), which is NULL for anon, so the function already
-- fails closed in-body — but an unauthenticated caller should not reach the body.
-- service_role is granted explicitly so the REVOKE below cannot strip it.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) TO authenticated, service_role;
