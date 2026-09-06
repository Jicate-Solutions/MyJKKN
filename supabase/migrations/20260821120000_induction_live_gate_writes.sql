-- Induction lifecycle gate, part 1 of 2: WRITES.
--
-- Why this exists. The Draft <-> Live model shipped 2026-08-18 (types/events.ts
-- INDUCTION_STATUS_TRANSITIONS + InductionEventService) as a DISPLAY and
-- TRANSITION layer only. INDUCTION_ACTIVE_STATUS was referenced in exactly two
-- places -- the constant itself and a badge colour -- and not one of the ~130
-- fn_induction_* RPCs ever compared events.status to 'live'. So a Draft
-- induction behaved identically to a Live one: freshers saw it, coordinators
-- marked attendance on it, volunteers captured feedback for it.
--
-- Measured on production 2026-08-21, BEFORE this migration:
--   3 Draft inductions holding 317 enrolled learners,
--   83 attendance rows and 19 feedback rows already recorded against them.
-- Those rows are left in place -- this guard is about new writes, and deleting
-- captured feedback is not a migration's call.
--
-- WHY A TRIGGER AND NOT A CHECK IN EACH RPC. Seven SECURITY DEFINER functions
-- write these four tables:
--   event_session_attendance  <- mark_attendance, mark_day_attendance,
--                                volunteer_mark_attendance
--   event_session_feedback    <- submit_feedback, submit_feedback_proxy,
--                                volunteer_submit_feedback
--   event_day_feedback        <- submit_day_feedback
--   event_program_feedback    <- submit_program_feedback
-- Editing seven bodies means seven chances for the predicate to drift, and the
-- eighth writer added next month would arrive ungated. The table is the real
-- boundary, so the guard belongs on the table.
--
-- WHAT IS DELIBERATELY *NOT* GATED. Draft is the build phase and must stay
-- usable: fn_induction_auto_enroll (enrolling the cohort),
-- fn_induction_upsert_session (writing the schedule), mentor/volunteer
-- appointment, and fn_induction_training_mark_attended (peer mentors are
-- trained BEFORE the programme opens). Gating those would block legitimate
-- preparation. The line drawn here is: Draft = build it, Live = run it.

-- ---------------------------------------------------------------------------
-- The predicate, in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assert_live(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  -- SECURITY DEFINER is load-bearing: this runs inside a learner's INSERT, and
  -- a learner cannot necessarily SELECT the events row. Reading it as the
  -- caller would return NOT FOUND and the guard would fail OPEN -- the exact
  -- failure mode it exists to prevent.
  --
  -- The join to induction_programs scopes the guard to INDUCTIONS. These four
  -- tables are named event_* and today carry induction rows only (verified
  -- 2026-08-21: 5,162 attendance / 12,419 feedback rows, all induction), but a
  -- marathon or tournament writing them later must not inherit this rule.
  SELECT e.status
    INTO v_status
    FROM public.events e
    JOIN public.induction_programs ip ON ip.event_id = e.id
   WHERE e.id = p_event_id;

  IF NOT FOUND THEN
    RETURN;  -- not an induction; not this guard's business
  END IF;

  -- IS DISTINCT FROM, never <>: `v_status <> 'live'` is NULL when the status is
  -- NULL, and a NULL condition in plpgsql takes the ELSE branch -- the guard
  -- would pass silently on exactly the rows most likely to be malformed.
  IF v_status IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION
      'This induction is %. Attendance and feedback can only be recorded while it is Live -- change its status to Live first.',
      COALESCE(initcap(v_status), 'not yet activated')
      USING ERRCODE = 'check_violation';
  END IF;
END
$function$;

COMMENT ON FUNCTION public.fn_induction_assert_live(uuid) IS
  'Raises unless the given induction event is Live. No-op for non-induction events. Guards attendance/feedback writes.';

-- ---------------------------------------------------------------------------
-- Two trigger adapters: one resolves the event via session_id, one reads it
-- straight off the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_induction_require_live_by_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event uuid;
BEGIN
  SELECT s.event_id INTO v_event
    FROM public.event_sessions s
   WHERE s.id = NEW.session_id;

  IF v_event IS NOT NULL THEN
    PERFORM public.fn_induction_assert_live(v_event);
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.trg_induction_require_live_by_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_induction_assert_live(NEW.event_id);
  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- The four triggers.
--
-- Named trg_a_* on purpose. Postgres fires row triggers in ALPHABETICAL name
-- order, and these tables already carry trg_induction_completion_* and
-- trg_touch_updated_at. Sorting first means the refusal happens before any
-- sibling trigger does work that would only be rolled back.
--
-- BEFORE INSERT OR UPDATE, not INSERT alone: every writer here uses
-- ON CONFLICT ... DO UPDATE, so the UPDATE arm is the re-mark path and is just
-- as much a write to a Draft induction as the first one.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_session_attendance;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_session();

DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_session_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();

DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_day_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_day_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();

DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_program_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_program_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();
