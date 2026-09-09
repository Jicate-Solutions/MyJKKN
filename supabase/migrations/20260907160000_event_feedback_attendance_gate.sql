-- ci:allow-secdef-authenticated  fn_my_event_feedback_registration is callable
-- by every authenticated user ON PURPOSE, and cannot be used to reach another
-- person's data. It is the attendance-aware twin of fn_my_event_registration,
-- which carries this same marker in event_feedback_forms.sql for the same
-- reason, and it is self-scoped in its own WHERE clause exactly as that one is:
-- every identity branch is pinned to (SELECT auth.uid()) — directly via
-- profile_id, or via the caller's own profiles.learner_id. Its ONLY argument
-- names a FORM, never a user, so there is no parameter through which a caller
-- can ask about anybody else. The most it can return is the caller's OWN
-- events_registrations.id, for a form id they already held.
--
-- It is SECURITY DEFINER for the same reason its sibling is: it must read
-- events_registrations past that table's own SELECT policy, which is what lets
-- a participant be recognised at all.
--
-- The one extra fact it exposes beyond its sibling is a BOOLEAN about the
-- event, not a person — "was anyone checked in before this form opened" —
-- which is the same class of disclosure fn_event_feedback_form_open already
-- makes about a form's own window.
--
-- The guard's own rule still applies to anything added to this file later:
-- a predicate that IDENTIFIES a caller is not a predicate that AUTHORISES one.
-- ============================================================================
-- Event feedback: only people who actually turned up may rate the event,
-- with a fallback so a forgotten check-in cannot silence everybody.
-- Director decision, 2026-09-07.
-- ============================================================================
-- TODAY: event_feedback_responses_insert admits any registrant --
--   (registration_id = fn_my_event_registration(event_id))
--    AND fn_event_feedback_form_open(form_id)
-- Neither fn_my_event_registration nor the policy looks at checked_in, so a
-- person who signed up and never came can rate the speaker. With turnout as the
-- loop's launch metric that is not cosmetic: the same population feeds both the
-- verdict and its counter-metric.
--
-- THE FALLBACK, AND WHY IT IS NOT "no check-ins right now":
-- The naive rule "allow everyone when the event has zero check-ins" has a trap.
-- It is re-evaluated on every insert, so if ANY person is checked in while the
-- form is collecting -- a coordinator tidying records days later, one late
-- walk-in scanned by hand -- the door slams shut on every other registrant
-- mid-window, and the earlier answers stay while the rest are refused. The
-- population would then be decided by a stray edit.
--
-- So the fallback is frozen at the form's OPENING time: it asks whether anyone
-- had been checked in BEFORE the form opened (checked_in_at < starts_at). That
-- instant is in the past for the whole life of the window, so the answer cannot
-- change underneath a respondent. Late check-ins are still honoured for the
-- strict branch (they let that person in); they can no longer lock others out.
--
-- A form with a NULL starts_at has no such instant. It is treated as "no
-- attendance was taken", i.e. the permissive branch -- open to registrants -- so
-- that a coordinator who never set a window still collects something.
--
-- Net effect:
--   attendance WAS taken  -> only people marked present may answer
--   attendance was NOT    -> any live registrant may answer (as today)
-- ============================================================================

-- ── the gate ────────────────────────────────────────────────────────────────
-- Returns the caller's OWN registration id when they are entitled to answer
-- THIS form, else NULL. Mirrors fn_my_event_registration's identity handling
-- (profile_id, or the caller's profiles.learner_id) rather than re-deriving it,
-- so the two can never drift on who counts as a participant.
--
-- SECURITY DEFINER for the same reason its sibling is: it must read
-- events_registrations past that table's own SELECT policy. It is self-scoped —
-- every identity branch is pinned to (SELECT auth.uid()) and no argument names
-- another user, so the most a caller learns is whether THEY may answer a form
-- id they already hold.
CREATE OR REPLACE FUNCTION public.fn_my_event_feedback_registration(p_form_id uuid)
RETURNS uuid
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
  -- Was attendance being taken before this window opened? NULL starts_at =>
  -- no instant to freeze on => treat as "not taken" (permissive branch).
  attendance_taken AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.events_registrations r, f
      WHERE r.event_id = f.event_id
        AND r.checked_in
        AND f.starts_at IS NOT NULL
        AND r.checked_in_at IS NOT NULL
        AND r.checked_in_at < f.starts_at
    ) AS taken
  )
  SELECT r.id
  FROM public.events_registrations r, f, attendance_taken a
  WHERE r.event_id = f.event_id
    AND r.status NOT IN ('cancelled', 'disqualified')
    AND (
      r.profile_id = (SELECT auth.uid())
      OR (
        r.learner_id IS NOT NULL
        AND r.learner_id = (
          SELECT p.learner_id FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
        )
      )
    )
    -- strict when attendance was taken; open when it was not
    AND (NOT a.taken OR r.checked_in)
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_my_event_feedback_registration(uuid) IS
  'Caller''s own registration id if they may answer this feedback form, else NULL. '
  'Strict (checked-in only) when attendance was being taken before the form opened; '
  'open to any live registrant when it was not, so a forgotten check-in cannot '
  'silence an entire event. Director decision 2026-09-07.';

-- Supabase''s ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- SEPARATELY from PUBLIC, so revoking PUBLIC alone leaves it callable with the
-- anon key that ships in every browser bundle. Revoke anon explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_my_event_feedback_registration(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_event_feedback_registration(uuid) TO authenticated;

-- Answering depends on who was checked in, so it must not be cached across
-- statements the way a STABLE fn in a policy could be misread as being; the
-- index below keeps the EXISTS cheap.
CREATE INDEX IF NOT EXISTS idx_events_registrations_event_checked_in
  ON public.events_registrations (event_id, checked_in_at)
  WHERE checked_in;

-- ── policies ────────────────────────────────────────────────────────────────
-- INSERT and UPDATE swap fn_my_event_registration for the gate. SELECT and
-- DELETE are deliberately NOT changed: a person who answered before attendance
-- was taken must keep being able to read their own row back, and a coordinator''s
-- delete is unaffected by attendance.
--
-- Read-vs-write asymmetry matters here: PostgREST''s .insert().select() is
-- INSERT ... RETURNING, and PostgreSQL applies SELECT policies as WITH CHECK
-- OPTIONS on the returned row -- a SELECT policy narrower than the INSERT policy
-- raises 42501 and rolls the insert back rather than filtering it. The existing
-- SELECT policy (own registration OR can-manage) stays WIDER than this gate, so
-- the returning row is always visible to its author.
DROP POLICY IF EXISTS event_feedback_responses_insert ON public.event_feedback_responses;
CREATE POLICY event_feedback_responses_insert
  ON public.event_feedback_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    registration_id = public.fn_my_event_feedback_registration(form_id)
    AND public.fn_event_feedback_form_open(form_id)
  );

DROP POLICY IF EXISTS event_feedback_responses_update ON public.event_feedback_responses;
CREATE POLICY event_feedback_responses_update
  ON public.event_feedback_responses
  FOR UPDATE TO authenticated
  USING (
    registration_id = public.fn_my_event_feedback_registration(form_id)
    AND public.fn_event_feedback_form_open(form_id)
  )
  WITH CHECK (
    registration_id = public.fn_my_event_feedback_registration(form_id)
    AND public.fn_event_feedback_form_open(form_id)
  );
