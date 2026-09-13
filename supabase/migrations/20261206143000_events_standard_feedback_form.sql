-- ci:allow-secdef-authenticated  fn_my_pending_event_feedback is callable by
-- every authenticated user ON PURPOSE and cannot be used to reach another
-- person's data. It takes NO argument at all — there is no parameter through
-- which a caller could name somebody else — and every row it returns is gated on
-- fn_my_event_feedback_registration, which pins every identity branch to
-- (SELECT auth.uid()). It is
-- SECURITY DEFINER for the same reason its two siblings are: it must read
-- events_registrations past that table's own SELECT policy, which is what lets a
-- participant be recognised at all. The most it discloses is a list of forms the
-- CALLER may answer.
--
-- The guard's own rule still applies to anything added to this file later:
-- a predicate that IDENTIFIES a caller is not a predicate that AUTHORISES one.
-- ============================================================================
-- Every event asks its attendees how it went — Director's ruling, 13 Sep 2026
-- ============================================================================
-- THE STATE THIS REPLACES. One event in 55 has ever collected feedback: 4 forms,
-- 27 questions, 38 responses, all on a single lecture. Nothing is broken in the
-- feedback module — it works, and the 2026-09-09 self-registration wave made it
-- reachable for attendees who were never on a registration list. What is missing
-- is that SOMEBODY HAS TO BUILD A FORM BY HAND, per event, after the event, and
-- nobody does. A capability that needs an act of voluntary administration to
-- exist is a capability with a 1.8% hit rate.
--
-- TWO HALVES, both required, neither sufficient alone:
--
--   (1) THE FORM EXISTS WITHOUT ANYONE BUILDING IT. A daily routine opens one
--       standard short form on every event that has ended and has none.
--
--   (2) THE SAME QUESTIONS EVERY TIME. fn_events_open_standard_feedback writes a
--       FIXED question set with FIXED question_keys. That is the whole point: a
--       per-event bespoke form measures one event, a shared key measures the
--       institution. event_feedback_responses.answers is keyed by question_key,
--       so 'overall_rating' means the same thing on a seminar in June and a
--       sports day in December, and a mean across both is a real number rather
--       than an average of different questions.
--
-- WHY THE QUESTIONS ARE HARDCODED HERE and are NOT a platform_policies row,
-- against the standing "every policy decision = a config row" rule. The rule's
-- purpose is that an operator can change a decision without a deploy. Here the
-- decision IS that nobody changes it: a question set an operator can edit is a
-- question set that will differ between two events, and cross-event comparison
-- silently stops meaning anything on the day somebody reworded question three.
-- Same reasoning as the k=5 floor in 20260726160000 ("a floor an operator can
-- lower to 1 is not a floor"). A coordinator who wants to ask something extra
-- still builds their own form in the existing builder; this one is the spine.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   * It NEVER writes a second form on an event that already has one. A
--     coordinator who built their own is not second-guessed, and no attendee is
--     asked twice. The cost is stated honestly: those events stay outside the
--     comparable set.
--   * It NEVER touches induction events. Induction runs its own three feedback
--     channels (session / day / programme, 16,025 ratings) reached from
--     /learners/my-induction; a fourth ask on the same event is noise.
--   * It SENDS NOTHING. No notification, no email, no push. It writes form,
--     section and question rows and stops. Attendees find the form on the new
--     /my-event-feedback page, which reads
--     fn_my_pending_event_feedback below.
--   * It does NOT backfill history. Only events that ended inside the lookback
--     window are touched, so applying this does not reopen 2024.
--
-- HOW "THE EVENT HAS ENDED" IS DECIDED, and why it is the LATER of two clocks.
-- public.events stores the same moment twice and nothing keeps the copies equal
-- (see scripts/ci/check-event-time-consistency.mjs and the 2026-09-07 seminar
-- that said 14:00 on the page and 13:00 to the scheduler):
--     end_date   timestamptz   what scheduling logic reads
--     event_date date + end_time time   the wall clock shown to attendees
-- Taking either alone can open a feedback form while people are still in the
-- room. GREATEST() of the two (Postgres GREATEST ignores NULLs) picks whichever
-- says the event ran longer, so the form can only ever be late, never early. An
-- event where BOTH are NULL has no knowable end and is skipped rather than
-- guessed at.
--
-- A DECLARED INVERSION: is_enabled = true ON EVERY ROW THIS WRITES.
-- event_feedback_forms.is_enabled is `NOT NULL DEFAULT false` and the table's own
-- migration says why: "a new form starts CLOSED so creating one never begins
-- collecting by surprise." That default protects a HUMAN drafting a form in the
-- builder — they set the questions first and open it when they are ready. This
-- writer has no draft stage and no human to come back: it composes the whole
-- form in one statement and its entire purpose is that nobody has to remember
-- to open it. A row written with the default would be invisible to every
-- attendee, and this routine would be an elaborate way of creating nothing.
--
-- The consequence, stated rather than implied: from the day this is applied,
-- an event ending inside the lookback window BEGINS COLLECTING ANSWERS with no
-- human approving that event in particular. That is the decision, not an
-- accident of the insert. Three things bound it: the form asks the same four
-- fixed questions on every event, so there is nothing event-specific for anyone
-- to get wrong; it is answerable only by people the event already recorded as
-- participants (see fn_my_pending_event_feedback below); and the routine itself
-- can be switched off at /admin/ai-routines with no deploy, which stops every
-- future form. Forms already opened stay open until their 14 days run out —
-- switching the routine off does not close them, and closing one early is the
-- coordinator's existing per-form control.
--
-- WHY starts_at = now() AND NOT the event's end time. starts_at is load-bearing
-- beyond the window: fn_my_event_feedback_registration (20260907160000) freezes
-- the attendance question at the form's OPENING instant — "was anyone checked in
-- before starts_at". Backdating starts_at to the event's end would put the
-- opening instant BEFORE the check-ins, so an event where attendance WAS taken
-- would read as "attendance not taken" and every registered no-show could rate
-- it. Opening at now() keeps the Director's 2026-09-07 decision intact: where
-- check-ins happened, only people marked present may answer; where they did not,
-- any live registrant may.
--
-- ONE KNOWN EDGE, disclosed rather than hidden: an event whose check-ins are
-- reconciled AFTER the 06:45 sweep has no check-in earlier than its form's
-- starts_at, so it reads as "attendance not taken" for the whole 14 days and
-- every live registrant may answer, including registered no-shows. There is no
-- repair path — starts_at is never revised. It is inherent to freezing the
-- question at the opening instant (the alternative, re-evaluating it, lets one
-- late hand-entered check-in slam the door on everyone else mid-window, which is
-- why 20260907160000 froze it). It is bounded to REGISTRANTS of that event, not
-- the institution, because this page lists nobody else. Coordinators who take
-- attendance on the day are unaffected; the fix for the rest is to record
-- check-ins before the next morning.
-- ============================================================================

-- ── 1. The routine: open the standard form on events that have ended ────────
-- service_role only. It is the cron's function; no human calls it and no
-- authenticated grant exists, so it is out of scope for the guard-less-function
-- assertion by construction rather than by hatch.
CREATE OR REPLACE FUNCTION public.fn_events_open_standard_feedback(
  p_lookback_days integer DEFAULT 7,
  p_open_days     integer DEFAULT 14,
  p_limit         integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event      record;
  v_form_id    uuid;
  v_section_id uuid;
  v_created    integer := 0;
  v_scanned    integer := 0;
BEGIN
  IF p_lookback_days IS NULL OR p_lookback_days < 1
     OR p_open_days IS NULL OR p_open_days < 1
     OR p_limit IS NULL OR p_limit < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_arguments');
  END IF;

  FOR v_event IN
    SELECT e.id, e.name
    FROM public.events e
    WHERE e.status NOT IN ('draft', 'cancelled')
      -- The later of the two clocks; NULL when the event never said when it ended.
      AND GREATEST(
            e.end_date,
            CASE
              WHEN e.event_date IS NOT NULL
              THEN ((e.event_date + COALESCE(e.end_time, TIME '23:59'))
                      AT TIME ZONE 'Asia/Kolkata')
            END
          ) IS NOT NULL
      AND GREATEST(
            e.end_date,
            CASE
              WHEN e.event_date IS NOT NULL
              THEN ((e.event_date + COALESCE(e.end_time, TIME '23:59'))
                      AT TIME ZONE 'Asia/Kolkata')
            END
          ) < now()
      AND GREATEST(
            e.end_date,
            CASE
              WHEN e.event_date IS NOT NULL
              THEN ((e.event_date + COALESCE(e.end_time, TIME '23:59'))
                      AT TIME ZONE 'Asia/Kolkata')
            END
          ) >= now() - make_interval(days => p_lookback_days)
      -- Never a second form. A coordinator's own form wins; nobody is asked twice.
      AND NOT EXISTS (
        SELECT 1 FROM public.event_feedback_forms f WHERE f.event_id = e.id
      )
      -- Induction has its own three feedback channels on the same event row.
      AND NOT EXISTS (
        SELECT 1 FROM public.induction_programs ip WHERE ip.event_id = e.id
      )
    ORDER BY e.id
    LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;

    INSERT INTO public.event_feedback_forms (
      event_id, name, slug, description, is_enabled, display_order,
      is_anonymous, starts_at, ends_at
    )
    VALUES (
      v_event.id,
      'Event Feedback',
      'event-feedback',
      'A few short questions about how this event went. Your answers help the '
        || 'organisers run the next one better.',
      true,
      0,
      false,
      now(),
      now() + make_interval(days => p_open_days)
    )
    RETURNING id INTO v_form_id;

    INSERT INTO public.event_feedback_sections (form_id, event_id, title, display_order)
    VALUES (v_form_id, v_event.id, 'How it went', 0)
    RETURNING id INTO v_section_id;

    -- THE FIXED SET. question_key is the cross-event join key — changing one
    -- here orphans every answer already given to it on every past event, exactly
    -- as reworking a question_key does inside one form. Add a question if the
    -- Director rules a new one in; never rename or repurpose an existing key.
    INSERT INTO public.event_feedback_questions (
      section_id, form_id, event_id, question_key, question_label,
      question_type, is_required, display_order, rating_scale, placeholder
    )
    VALUES
      (v_section_id, v_form_id, v_event.id, 'overall_rating',
       'Overall, how would you rate this event?', 'rating', true, 0, 5, NULL),
      (v_section_id, v_form_id, v_event.id, 'usefulness_rating',
       'How useful was it to you?', 'rating', true, 1, 5, NULL),
      (v_section_id, v_form_id, v_event.id, 'organisation_rating',
       'How well was it organised?', 'rating', true, 2, 5, NULL),
      (v_section_id, v_form_id, v_event.id, 'what_to_improve',
       'What would you change about it?', 'textarea', false, 3, NULL,
       'Optional — one line is plenty');

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'events_eligible', v_scanned,
    'forms_created', v_created,
    'lookback_days', p_lookback_days,
    'open_days', p_open_days,
    -- The dispatcher's summarize() allowlist reads a numeric 'count'.
    'count', v_created
  );
END;
$$;

COMMENT ON FUNCTION public.fn_events_open_standard_feedback(integer, integer, integer) IS
  'Opens ONE standard short feedback form (fixed question_keys overall_rating / usefulness_rating / organisation_rating / what_to_improve) on every event that has ENDED inside the lookback window, is not draft/cancelled, is not an induction programme, and has no feedback form of its own. Never writes a second form, never backfills beyond the window, and SENDS NOTHING. "Ended" = the later of events.end_date and events.event_date+end_time (IST), because those two columns can disagree. starts_at = now() so the attendance freeze in fn_my_event_feedback_registration keeps working. Idempotent: re-running the same day creates nothing new. service_role only — fired by the ai-routine dispatcher row ''events-standard-feedback-forms''.';

REVOKE EXECUTE ON FUNCTION public.fn_events_open_standard_feedback(integer, integer, integer)
  FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_events_open_standard_feedback(integer, integer, integer)
  TO service_role;

-- ── 2. The attendee's way in: what am I being asked about? ──────────────────
-- Without this there is no learner-side surface at all. /events/<id>/feedback/
-- respond exists but has no navigation entry and no list — you reach it only if
-- somebody pastes you the link, which is the other half of why 54 events have no
-- data. This is the general-events equivalent of /learners/my-induction.
--
-- IT LISTS ONLY WHAT THE CALLER CAN ACTUALLY SUBMIT. Showing a form that RLS
-- will refuse at submit time repeats the failure one screen later, so each row
-- is gated on the SAME function the write path uses:
--   fn_my_event_feedback_registration  -> attendance-aware; NULL means "you may
--                                         not answer", including the case where
--                                         attendance was taken and you were not
--                                         marked present.
--
-- IT LISTS ONLY EVENTS THE CALLER IS ON THE LIST FOR, and that is a decision,
-- not an oversight. The obvious wider rule — admit anyone
-- fn_can_self_register_for_event_feedback would let in — reads as "be generous"
-- and is measured as a broadcast. That function contains no attendance test and
-- no invitation test: it returns TRUE for ANY signed-in profile in the event's
-- audience who holds no registration (e.scope = 'all_jkkn' OR
-- e.institution_id = mine), provided nobody was checked in before the form
-- opened. Read against production today (13 Sep 2026): 55 events, of which 2
-- have any check-in at all and 8 have any registration, against 7,664 profiles.
-- Pair that with a routine that opens a form on EVERY ended event and the queue
-- of an all_jkkn event becomes every profile on the platform, each asked to rate
-- something they may never have heard of.
--
-- Three things break if that ships, and the third is the whole design:
--   * Noise. Up to the LIMIT 50 below, mostly events the reader did not attend.
--   * Turnout. Answering MINTS an events_registrations row at submit, so a
--     non-attendee who answers is counted as a participant — the exact
--     corruption 20260909240000's own header says its read-only twin exists to
--     prevent. That guard held while self-registration was reachable only by a
--     pasted link handed to somebody who was actually there.
--   * The number itself. The fixed question_keys exist so one event's rating is
--     comparable with another's. A mean over people who were not in the room is
--     not a worse measurement of the event; it is not a measurement of the event.
-- Self-registration is NOT removed — the respond page still offers it exactly as
-- it does today to anyone handed the link, which is the case it was built for.
-- It is simply not something this page BROADCASTS. The cost, stated plainly: an
-- event with no participant list collects nothing here until somebody records
-- who came or shares the link. 47 of 55 events are in that state today, and the
-- lever for them is recording attendance, not asking 7,664 people.
--
-- COST CONTROL. The gate function is STABLE but not free, so the cheap
-- predicates run first — the form must be enabled and inside its window, the
-- event must be running and in the caller's audience, and the caller must hold
-- a live registration on it (the indexed EXISTS below, which is also what bounds
-- the scan: without it the candidate set is every open form in the institution
-- and grows by one per event per day). Only survivors of that reach the per-row
-- function call, which stays the authority on WHICH registration and on
-- attendance.
-- The OUT columns are part of the signature and CREATE OR REPLACE cannot change
-- them, so an edit to this list would fail on a re-run against a database that
-- already has the earlier shape. Dropped first, then recreated and re-granted
-- below; nothing depends on it (no view, no policy, no default).
DROP FUNCTION IF EXISTS public.fn_my_pending_event_feedback();

CREATE OR REPLACE FUNCTION public.fn_my_pending_event_feedback()
RETURNS TABLE (
  form_id             uuid,
  form_name           text,
  form_slug           text,
  event_id            uuid,
  event_name          text,
  event_type          text,
  event_ended_at      timestamptz,
  closes_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT pr.id, pr.institution_id, pr.learner_id
    FROM public.profiles pr
    WHERE pr.id = (SELECT auth.uid())
  ),
  candidate AS (
    SELECT
      f.id   AS form_id,
      f.name AS form_name,
      f.slug AS form_slug,
      f.ends_at,
      e.id   AS event_id,
      e.name AS event_name,
      e.event_type,
      GREATEST(
        e.end_date,
        CASE
          WHEN e.event_date IS NOT NULL
          THEN ((e.event_date + COALESCE(e.end_time, TIME '23:59'))
                  AT TIME ZONE 'Asia/Kolkata')
        END
      ) AS event_ended_at
    FROM public.event_feedback_forms f
    JOIN public.events e ON e.id = f.event_id
    CROSS JOIN me
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND f.is_enabled
      AND (f.starts_at IS NULL OR now() >= f.starts_at)
      AND (f.ends_at   IS NULL OR now() <= f.ends_at)
      AND e.status NOT IN ('draft', 'cancelled')
      AND (e.scope = 'all_jkkn' OR e.institution_id = me.institution_id)
      -- On the list for this event. Identity is matched the same two ways
      -- fn_my_event_feedback_registration matches it (profile_id, or the
      -- caller's own profiles.learner_id) so the pre-filter can never admit
      -- somebody the gate would then reject, or reject somebody it would admit.
      -- This is a cheap indexed EXISTS, not the verdict: the gate below still
      -- decides WHICH registration and whether attendance shuts them out.
      AND EXISTS (
        SELECT 1
        FROM public.events_registrations r
        WHERE r.event_id = e.id
          AND r.status NOT IN ('cancelled', 'disqualified')
          AND (
            r.profile_id = me.id
            OR (r.learner_id IS NOT NULL AND r.learner_id = me.learner_id)
          )
      )
  ),
  resolved AS (
    SELECT
      c.*,
      public.fn_my_event_feedback_registration(c.form_id) AS my_registration_id
    FROM candidate c
  )
  SELECT
    r.form_id,
    r.form_name,
    r.form_slug,
    r.event_id,
    r.event_name,
    r.event_type,
    r.event_ended_at,
    r.ends_at AS closes_at
  FROM resolved r
  -- NULL is a refusal, and it carries the attendance verdict: the caller is
  -- registered (the pre-filter proved that) but attendance WAS being taken
  -- before this form opened and they were not marked present. Listing it anyway
  -- would move the refusal to the submit button.
  WHERE r.my_registration_id IS NOT NULL
    -- Already answered => not pending.
    AND NOT EXISTS (
      SELECT 1
      FROM public.event_feedback_responses resp
      WHERE resp.form_id = r.form_id
        AND resp.registration_id = r.my_registration_id
    )
  -- Soonest to close first: that is the one the caller loses if they wait.
  ORDER BY r.ends_at ASC NULLS LAST, r.event_ended_at DESC NULLS LAST
  LIMIT 50;
$$;

COMMENT ON FUNCTION public.fn_my_pending_event_feedback() IS
  'Event feedback forms the CALLER may answer right now and has not answered yet, soonest-to-close first (cap 50). Self-scoped: takes no argument, and every row is admitted by fn_my_event_feedback_registration (attendance-aware), pinned to auth.uid(). DELIBERATELY listing only events the caller holds a live registration on: fn_can_self_register_for_event_feedback carries no attendance or invitation test, so admitting it here would ask every profile in the audience (7,664 platform-wide on an all_jkkn event) to rate events they never attended, inflate turnout at submit, and break the cross-event comparability the fixed question_keys exist to create. Self-registration is unchanged on the respond page for anyone handed the link. Backs /my-event-feedback.';

REVOKE EXECUTE ON FUNCTION public.fn_my_pending_event_feedback() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_pending_event_feedback() TO authenticated;

-- The candidate pre-filter's EXISTS matches a registration by profile_id or by
-- the caller's learner_id. Both are single-column lookups on a table that grows
-- with every registration on every event; neither had an index (the only ones
-- are form_id and the partial event_id/checked_in_at from 20260907160000).
CREATE INDEX IF NOT EXISTS idx_events_registrations_profile_event
  ON public.events_registrations (profile_id, event_id)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_registrations_learner_event
  ON public.events_registrations (learner_id, event_id)
  WHERE learner_id IS NOT NULL;

-- ── 3. Prove the grants actually took ───────────────────────────────────────
-- Stating REVOKE/GRANT is not the same as landing them, and the failure is
-- silent in both directions: Supabase's ALTER DEFAULT PRIVILEGES hands anon a
-- direct EXECUTE on every new function separately from PUBLIC, so a missed
-- revoke leaves a function callable with the anon key that ships in every
-- browser bundle; and a missed grant leaves a function no signed-in user can
-- call, which reads as "the page is broken" and never as "the grant is absent".
-- Same standard as the sibling migration 20261205083000, which asserts its
-- table grants with has_table_privilege.
DO $$
BEGIN
  -- The cron's writer: service_role ONLY. No human may open forms.
  IF NOT has_function_privilege('service_role',
       'public.fn_events_open_standard_feedback(integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_events_open_standard_feedback: service_role is missing EXECUTE — the routine cannot open any form';
  END IF;
  IF has_function_privilege('authenticated',
       'public.fn_events_open_standard_feedback(integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_events_open_standard_feedback: authenticated still holds EXECUTE — any signed-in user could mint feedback forms';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_events_open_standard_feedback(integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_events_open_standard_feedback: anon still holds EXECUTE — callable with the public anon key';
  END IF;

  -- The attendee's read: every signed-in user, never anon.
  IF NOT has_function_privilege('authenticated',
       'public.fn_my_pending_event_feedback()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_my_pending_event_feedback: authenticated is missing EXECUTE — /my-event-feedback would be empty for everyone';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_my_pending_event_feedback()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_my_pending_event_feedback: anon still holds EXECUTE — callable with the public anon key';
  END IF;
END;
$$;

-- ── 4. The trigger, registered where this repo actually registers them ──────
-- NOT vercel.json. That file is at 68 crons against a hard platform cap and the
-- 2026-08 cron-cap wave moved every daily rules-based sweep onto the AI-routine
-- dispatcher, which fires GET <triggerPath> with Authorization: Bearer
-- CRON_SECRET every 15 minutes for whatever is due. A seeded row here is dead on
-- arrival unless lib/ai-routines/platform-ops.ts carries a matching routine id —
-- __tests__/lib/ai-routines/registry-cron-wiring.test.ts asserts exactly that
-- and will fail this migration if the registry entry is missing.
--
-- minute_of_day is IST, on 15-minute marks (the dispatcher's tick granularity).
-- 06:45 IST: after the previous day has closed everywhere, well before the
-- morning traffic, and off the 05:00-06:00 block the accreditation snapshots
-- already occupy.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('events-standard-feedback-forms', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 405)
ON CONFLICT (routine_id) DO NOTHING;
