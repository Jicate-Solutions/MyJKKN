-- ci:allow-secdef-authenticated  fn_my_pending_event_feedback is callable by
-- every authenticated user ON PURPOSE and cannot be used to reach another
-- person's data. It takes NO argument at all — there is no parameter through
-- which a caller could name somebody else — and every row it returns is gated on
-- fn_my_event_feedback_registration / fn_can_self_register_for_event_feedback,
-- both of which pin their identity branches to (SELECT auth.uid()). It is
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
--     /learners/my-event-feedback page, which reads
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
-- WHY starts_at = now() AND NOT the event's end time. starts_at is load-bearing
-- beyond the window: fn_my_event_feedback_registration (20260907160000) freezes
-- the attendance question at the form's OPENING instant — "was anyone checked in
-- before starts_at". Backdating starts_at to the event's end would put the
-- opening instant BEFORE the check-ins, so an event where attendance WAS taken
-- would read as "attendance not taken" and every registered no-show could rate
-- it. Opening at now() keeps the Director's 2026-09-07 decision intact: where
-- check-ins happened, only people marked present may answer; where they did not,
-- any live registrant may, and a non-registrant may self-register.
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
-- is gated on the SAME two functions the write path uses:
--   fn_my_event_feedback_registration  -> attendance-aware; NULL means "you may
--                                         not answer", including the case where
--                                         attendance was taken and you were not
--                                         marked present.
--   fn_can_self_register_for_event_feedback -> would self-registration succeed?
-- needs_self_register tells the page which of the two got the caller in, so the
-- respond form's existing self-registration path is reached knowingly.
--
-- COST CONTROL. Both gate functions are STABLE but not free, so the cheap
-- predicates run first — the form must be enabled and inside its window, and the
-- event must be running and in the caller's audience (same institution, or
-- all_jkkn — the same test events_auth_read applies). Only survivors of that
-- reach the per-row function calls.
CREATE OR REPLACE FUNCTION public.fn_my_pending_event_feedback()
RETURNS TABLE (
  form_id             uuid,
  form_name           text,
  form_slug           text,
  event_id            uuid,
  event_name          text,
  event_type          text,
  event_ended_at      timestamptz,
  closes_at           timestamptz,
  needs_self_register boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT pr.id, pr.institution_id
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
    r.ends_at AS closes_at,
    (r.my_registration_id IS NULL) AS needs_self_register
  FROM resolved r
  WHERE (
      r.my_registration_id IS NOT NULL
      OR public.fn_can_self_register_for_event_feedback(r.form_id)
    )
    -- Already answered => not pending. Only checkable when they hold a
    -- registration; a self-registrable caller has none, so by definition has no
    -- response either.
    AND NOT EXISTS (
      SELECT 1
      FROM public.event_feedback_responses resp
      WHERE resp.form_id = r.form_id
        AND r.my_registration_id IS NOT NULL
        AND resp.registration_id = r.my_registration_id
    )
  -- Soonest to close first: that is the one the caller loses if they wait.
  ORDER BY r.ends_at ASC NULLS LAST, r.event_ended_at DESC NULLS LAST
  LIMIT 50;
$$;

COMMENT ON FUNCTION public.fn_my_pending_event_feedback() IS
  'Event feedback forms the CALLER may answer right now and has not answered yet, soonest-to-close first (cap 50). Self-scoped: takes no argument, and each row is admitted only by fn_my_event_feedback_registration (attendance-aware) or fn_can_self_register_for_event_feedback, both pinned to auth.uid(). needs_self_register=true means the caller holds no registration and the respond page must call fn_self_register_for_event_feedback at submit. Backs /learners/my-event-feedback.';

REVOKE EXECUTE ON FUNCTION public.fn_my_pending_event_feedback() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_pending_event_feedback() TO authenticated;

-- ── 3. The trigger, registered where this repo actually registers them ──────
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
