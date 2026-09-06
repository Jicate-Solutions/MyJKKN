-- Events delete guard — count induction learners, not just registrations.
--
-- THE HOLE THIS CLOSES. `events` has 46 FKs pointing at it, 43 ON DELETE
-- CASCADE (see 20260806_events_delete_permission_gate_and_cascade_guard).
-- Thirteen of them are induction_* tables: induction_enrollment,
-- induction_completion, induction_batches, induction_session_poll,
-- induction_session_pulse, induction_feedback_volunteers,
-- induction_event_coordinators, induction_programs, …
--
-- Both the blocker RPC and the BEFORE DELETE trigger counted ONLY
-- events_registrations and event_payment_transactions. An induction never
-- writes either — freshers arrive through fn_induction_auto_enroll into
-- induction_enrollment, not through the public registration form. So every
-- induction reported `blocked: false` with a dialog that read "Nothing is
-- registered against this event, so it can be removed cleanly", and the
-- delete then cascaded away the whole programme. Verified 2026-08-18 against
-- production: all 5 inductions had 0 registrations and 0 payments while
-- holding 435 / 225 / 130 / 79 / 44 enrolled learners respectively.
--
-- WHY induction_enrollment IS THE SIGNAL and the other twelve are not.
-- Enrollment is the irreplaceable half — a learner's place in the programme,
-- their batch, their attendance and feedback all hang off it. The rest
-- (coordinators, the induction_programs config row, an empty batch) is setup
-- that a re-create reproduces in a minute. Gating on any of those would make a
-- mis-created induction undeletable the moment someone appointed a
-- coordinator, which is the deadlock shape this repo has hit before
-- (see the 'cancelled'-status note in the original guard).
--
-- CREATE OR REPLACE, not DROP + CREATE: dropping discards EXECUTE grants and
-- the trigger function's grants were deliberately revoked from anon after
-- get_advisors flagged it. Replacing keeps them.

-- ── 1. The reporting RPC the confirm dialog reads ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_event_delete_blockers(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_found          boolean;
  v_registrations  integer;
  v_payments       integer;
  v_induction      integer;
BEGIN
  SELECT e.institution_id, true
    INTO v_institution_id, v_found
    FROM public.events e
   WHERE e.id = p_event_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Event % not found', p_event_id USING ERRCODE = 'P0002';
  END IF;

  -- Self-authorizing: both child tables are RLS-gated, so a browser-side count
  -- returns 0 for anyone who cannot see the rows — a false "safe to delete".
  IF NOT (
    public.user_has_permission('events.delete')
    AND public.role_has_institution_access(v_institution_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this event' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_registrations
    FROM public.events_registrations r WHERE r.event_id = p_event_id;

  SELECT count(*) INTO v_payments
    FROM public.event_payment_transactions t WHERE t.event_id = p_event_id;

  SELECT count(*) INTO v_induction
    FROM public.induction_enrollment ie WHERE ie.event_id = p_event_id;

  RETURN jsonb_build_object(
    'registrations',      v_registrations,
    'payments',           v_payments,
    'induction_learners', v_induction,
    'blocked',            (v_registrations > 0 OR v_payments > 0 OR v_induction > 0)
  );
END;
$function$;

-- ── 2. The guard that actually refuses the delete ───────────────────────────
-- This one is the authority, not the dialog: /rest/v1/events is directly
-- callable with a user's own JWT, which never opens a dialog at all.
CREATE OR REPLACE FUNCTION public.fn_events_block_delete_with_dependents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registrations integer;
  v_payments      integer;
  v_induction     integer;
BEGIN
  SELECT count(*) INTO v_registrations
    FROM public.events_registrations r WHERE r.event_id = OLD.id;

  SELECT count(*) INTO v_payments
    FROM public.event_payment_transactions t WHERE t.event_id = OLD.id;

  SELECT count(*) INTO v_induction
    FROM public.induction_enrollment ie WHERE ie.event_id = OLD.id;

  IF v_registrations > 0 OR v_payments > 0 THEN
    RAISE EXCEPTION
      'Cannot delete event "%": % registration(s) and % payment transaction(s) would be permanently destroyed by ON DELETE CASCADE. Remove or refund them first, or move the event to Draft to take it out of circulation.',
      OLD.name, v_registrations, v_payments
      USING ERRCODE = 'P0001';
  END IF;

  IF v_induction > 0 THEN
    RAISE EXCEPTION
      'Cannot delete induction "%": % enrolled learner(s) — along with their batches, attendance, feedback and completion records — would be permanently destroyed by ON DELETE CASCADE. Remove the enrolment first, or move the induction to Draft to take it out of circulation.',
      OLD.name, v_induction
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;
