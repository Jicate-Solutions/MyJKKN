-- ci:allow-secdef-authenticated  fn_self_register_for_event_feedback is callable
-- by every authenticated user ON PURPOSE, and cannot be used to act as anybody
-- else. Its ONLY argument names a FORM, never a user: every field of the row it
-- writes is read from the CALLER's own profile via (SELECT auth.uid()), so there
-- is no parameter through which a caller can register a third party. It is
-- SECURITY DEFINER because it must INSERT into events_registrations past that
-- table's own INSERT policy, which is written for a coordinator enrolling
-- somebody, not for a participant enrolling themselves.
--
-- The guard's own rule still applies to anything added to this file later:
-- a predicate that IDENTIFIES a caller is not a predicate that AUTHORISES one.
-- ============================================================================
-- Event feedback: an attendee of an event that never collected registrations
-- can still answer its feedback form
-- ============================================================================
-- THE REPORT (2026-09-09): a coordinator opened a feedback form on "Skill
-- Development Program", said it was open to all arts students, and no student
-- could see it. The form was enabled with no window, so it was open; the event
-- had ZERO rows in events_registrations.
--
-- WHY THAT SILENCES EVERYONE. A feedback response keys on
-- events_registrations.id, not on a profile — deliberately, because
-- events_registrations also holds participant_type='external' rows (marathon
-- runners, outside guests) that have no auth.users account at all, so the
-- registration row is the only identity every respondent across all four event
-- types actually has. It doubles as the dedup key: UNIQUE (form_id,
-- registration_id) is what makes "one response per participant" a database fact
-- rather than a UI convention. See the header of event_feedback_forms.sql.
--
-- But REGISTRATION IS OPTIONAL when an event is created — "Registration window:
-- Not set" is an ordinary, supported state, and a lecture announced to a
-- department is routinely run without collecting sign-ups. Nobody reconciled the
-- two decisions, so "we did not collect registrations" silently became "nobody
-- may ever rate this event". The event's audience settings (scope, visibility,
-- is_public) govern who may SEE it and were never consulted by the feedback
-- path at all.
--
-- THE FIX: let the attendee create their own registration at the moment they
-- open the form, instead of loosening what a response keys on. The schema, the
-- dedup key, the attendance gate and the coordinator's response list all keep
-- working unchanged, and the row this writes is a real registration that shows
-- up in the event's participant list like any other.
--
-- WHAT IT REFUSES, and why each one matters:
--
--   * a closed form — fn_event_feedback_form_open is asked FIRST, so a closed
--     form cannot be used to manufacture registrations on a finished event.
--
--   * an event the caller cannot see — mirrors events_auth_read: same
--     institution, or an all_jkkn event. Without this, any authenticated user
--     could enrol themselves in any institution's event.
--
--   * a draft or cancelled event — those are not running; nothing about them
--     should be self-joinable.
--
--   * an event where ATTENDANCE WAS TAKEN before the form opened. This is the
--     load-bearing one. The Director's 2026-09-07 decision
--     (20260907160000_event_feedback_attendance_gate.sql) is that when a
--     coordinator recorded check-ins, only people marked present may rate the
--     event. Self-registration would hand exactly those absentees a way back in
--     — the new row is not checked_in, so fn_my_event_feedback_registration
--     would reject it anyway, and writing it would only litter the participant
--     list with rows that can never answer. So this refuses up front and the
--     caller keeps the honest "this form is for people who attended" message.
--
-- IDEMPOTENT: a caller who already holds a live registration gets that same id
-- back and no second row. Two taps on a slow connection therefore cannot produce
-- a duplicate participant, which the UNIQUE (form_id, registration_id) dedup key
-- would not have caught — it constrains responses, not registrations.
--
-- NOT COVERED HERE: an external participant with no login. They have no
-- auth.uid() to read a profile from, and the coordinator enrolling them is the
-- existing supported path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_self_register_for_event_feedback(p_form_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := (SELECT auth.uid());
  v_event_id     uuid;
  v_form_starts  timestamptz;
  v_existing     uuid;
  v_new_id       uuid;
  v_attendance   boolean;
  p              record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT f.event_id, f.starts_at INTO v_event_id, v_form_starts
  FROM public.event_feedback_forms f
  WHERE f.id = p_form_id;

  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- A closed form may not mint registrations.
  IF NOT public.fn_event_feedback_form_open(p_form_id) THEN
    RETURN NULL;
  END IF;

  -- Already a participant? Hand back the same row — never a second one.
  -- Deliberately NOT filtered on checked_in: this is "do you already have a
  -- registration", not "may you answer". The latter stays
  -- fn_my_event_feedback_registration's question, asked by the RLS policy.
  SELECT r.id INTO v_existing
  FROM public.events_registrations r
  WHERE r.event_id = v_event_id
    AND r.status NOT IN ('cancelled', 'disqualified')
    AND (
      r.profile_id = v_uid
      OR (
        r.learner_id IS NOT NULL
        AND r.learner_id = (SELECT pr.learner_id FROM public.profiles pr WHERE pr.id = v_uid)
      )
    )
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Audience: mirrors events_auth_read (same institution) plus the all_jkkn
  -- scope, and refuses events that are not running.
  SELECT e.id INTO v_new_id
  FROM public.events e
  WHERE e.id = v_event_id
    AND e.status NOT IN ('draft', 'cancelled')
    AND (
      e.scope = 'all_jkkn'
      OR e.institution_id = (SELECT pr.institution_id FROM public.profiles pr WHERE pr.id = v_uid)
    );

  IF v_new_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Attendance was being taken before this window opened: only people already
  -- marked present may answer, so a new row would be unanswerable. Refuse
  -- rather than write one. Same predicate as fn_my_event_feedback_registration.
  SELECT EXISTS (
    SELECT 1
    FROM public.events_registrations r
    WHERE r.event_id = v_event_id
      AND r.checked_in
      AND v_form_starts IS NOT NULL
      AND r.checked_in_at IS NOT NULL
      AND r.checked_in_at < v_form_starts
  ) INTO v_attendance;

  IF v_attendance THEN
    RETURN NULL;
  END IF;

  SELECT pr.id, pr.full_name, pr.email, pr.institution_id, pr.learner_id
    INTO p
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  INSERT INTO public.events_registrations (
    event_id, profile_id, learner_id, participant_type, participant_name,
    participant_email, institution_id, status, source, registered_by
  )
  VALUES (
    v_event_id, v_uid, p.learner_id, 'internal',
    COALESCE(NULLIF(TRIM(p.full_name), ''), p.email, 'Participant'),
    p.email, p.institution_id, 'registered',
    -- Distinguishes these from coordinator-entered rows, so a turnout figure can
    -- exclude them if it ever needs to.
    'feedback_self', v_uid
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.fn_self_register_for_event_feedback(uuid) IS
  'Creates the caller''s OWN events_registrations row for the event behind an open feedback form, so an event that never collected registrations can still be rated. Returns the existing registration when there is one, else the new id, else NULL when the form is closed, the event is not in the caller''s audience, the event is draft/cancelled, or attendance was taken before the form opened. Self-scoped: every written field comes from the caller''s profile. See 20260909230000.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- SEPARATELY from PUBLIC, so revoking PUBLIC alone leaves it callable with the
-- anon key that ships in every browser bundle. Revoke anon explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_self_register_for_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_self_register_for_event_feedback(uuid) TO authenticated;

-- ── Re-assert the anon lock on the function 20260909210000/220000 replaced ──
-- CREATE OR REPLACE preserves a function's ACL, so fn_can_manage_event_feedback
-- kept whatever it already had. That is not the same as being locked, and the
-- "New SECURITY DEFINER functions lock anon" gate reads the migration text, not
-- the live ACL. Stated here explicitly so the two agree and neither is trusting
-- the other's memory.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_feedback(uuid) TO authenticated;
