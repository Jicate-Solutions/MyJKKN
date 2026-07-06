-- ============================================================================
-- Fresher Induction — resource-person (session speaker) access model
-- File: 20260702150000_induction_resource_person_session_access.sql | Date: 2026-07-02
--
-- Bug: a user assigned as a session RESOURCE PERSON (event_session_speakers)
-- saw NO sessions on /events/induction/[id] — fn_induction_list_sessions only
-- authorized super/admin, induction.view holders, per-event coordinators, and
-- enrolled learners. Poll/pulse hosting already honored speakers
-- (_fn_induction_can_manage_session_pulse), but a speaker could never reach the
-- session list to use it.
--
-- Access model implemented here:
--   • Resource person → VIEW the whole event they speak at: all sessions,
--     feedback summaries, program config + batches (RLS). OPERATE only on
--     their ASSIGNED sessions: roster, attendance, feedback kiosk (polls/pulse
--     already speaker-aware).
--   • Per-event coordinator → full manage. Also closes the one gate the July
--     coordinator retrofit missed: _fn_induction_can_manage_session_pulse
--     (the shared gate for ALL poll + pulse host RPCs) now honors event
--     coordinators too.
--
-- Function bodies below are the CURRENT LIVE definitions (pg_get_functiondef)
-- with only the marked lines added.
-- ============================================================================

-- ── 0. Helper: is the caller a credited resource person anywhere in this event? ─
-- SECURITY DEFINER so RLS policies can call it without recursing into
-- event_sessions/event_session_speakers RLS.
CREATE OR REPLACE FUNCTION public.fn_induction_is_event_speaker(p_event_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_session_speakers sp
    JOIN public.event_sessions es ON es.id = sp.session_id
    WHERE es.event_id = p_event_id AND sp.profile_id = p_user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_is_event_speaker(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_event_speaker(uuid, uuid) TO authenticated;

-- ── 1. Session list — a resource person sees ALL sessions of their event ─────
CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text, start_at timestamp with time zone, end_at timestamp with time zone, title text, description text, venue_text text, venue_resource_id uuid, speaker_text text, outcome_text text, resource_links jsonb, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst UUID;
  v_is_coordinator BOOLEAN;
  v_is_speaker BOOLEAN;  -- ADDED
  v_my_learner UUID;
  v_my_batch UUID;
  v_enrolled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not an induction event'; END IF;

  v_is_coordinator := is_super_admin() OR is_admin()
    OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
    OR public.fn_induction_is_event_coordinator(p_event_id);

  v_is_speaker := public.fn_induction_is_event_speaker(p_event_id);  -- ADDED

  v_my_learner := get_my_learner_id();
  SELECT true, ie.batch_id INTO v_enrolled, v_my_batch
  FROM public.induction_enrollment ie
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_my_learner;

  IF NOT v_is_coordinator AND NOT v_is_speaker AND NOT COALESCE(v_enrolled, false) THEN  -- ADDED: v_is_speaker
    RAISE EXCEPTION 'fn_induction_list_sessions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    AND (v_is_coordinator OR v_is_speaker OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)  -- ADDED: v_is_speaker
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;

-- ── 2. Event-level feedback summaries — same view grant (badges on the list) ─
CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_summary(p_event_id uuid)
RETURNS TABLE(session_id uuid, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          OR public.fn_induction_is_event_speaker(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.session_id::uuid, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_session_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.session_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id uuid)
RETURNS TABLE(day_number integer, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          OR public.fn_induction_is_event_speaker(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id uuid)
RETURNS TABLE(avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          OR public.fn_induction_is_event_speaker(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $function$;

-- ── 3. Per-session operations — assigned resource person ONLY ────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_batch UUID; v_inst UUID;
BEGIN
  SELECT s.event_id, s.batch_id INTO v_event, v_batch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())) THEN  -- ADDED: assigned resource person
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_attendance(p_session_id uuid, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID; v_n INTEGER;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())) THEN  -- ADDED: assigned resource person
    RAISE EXCEPTION 'fn_induction_mark_attendance: not authorized';
  END IF;

  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, (m->>'learner_id')::uuid, v_inst, (m->>'status'), auth.uid(), now()
  FROM jsonb_array_elements(p_marks) m
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_induction_recompute_completion(v_event);
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, rating integer, comment text, capture_method text, is_self boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())) THEN  -- ADDED: assigned resource person
    RAISE EXCEPTION 'fn_induction_session_feedback_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.learner_id::uuid, f.rating::int, f.comment::text,
         f.capture_method::text, (f.submitted_by IS NULL)::boolean
  FROM public.event_session_feedback f
  WHERE f.session_id = p_session_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_submit_feedback_proxy(p_session_id uuid, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID; v_sbatch UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authenticated'; END IF;

  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not an induction session'; END IF;

  -- coordinator gate (identical to the attendance writer)
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())) THEN  -- ADDED: assigned resource person
    RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authorized';
  END IF;

  -- FILTER (don't abort): a row with an invalid rating / un-enrolled learner / wrong
  -- batch is silently skipped, so one stale pick on a SHARED device never loses the
  -- rest of the batch. DISTINCT ON dedupes a learner repeated in the payload (else
  -- ON CONFLICT "cannot affect row a second time" would abort the whole save). #1694 r3.
  WITH cleaned AS (
    SELECT (m->>'learner_id')::uuid AS learner_id,
           (m->>'rating')::int       AS rating,
           NULLIF(btrim(m->>'comment'), '') AS comment
    FROM jsonb_array_elements(p_marks) m
    WHERE (m->>'learner_id') IS NOT NULL
      AND (m->>'rating') IS NOT NULL
      AND (m->>'rating')::int BETWEEN 1 AND 5
  ),
  valid AS (
    SELECT DISTINCT ON (c.learner_id) c.learner_id, c.rating, c.comment
    FROM cleaned c
    WHERE EXISTS (   -- enrolled + (batch-specific session → only its batch)
      SELECT 1 FROM public.induction_enrollment ie
      WHERE ie.event_id = v_event AND ie.learner_id = c.learner_id
        AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch)
    )
    ORDER BY c.learner_id
  )
  -- ANTI-CLOBBER: the ON CONFLICT UPDATE only fires when the EXISTING submitted_by IS
  -- NOT NULL (a prior kiosk row). A fresher's own-login row (submitted_by IS NULL)
  -- makes the predicate false → Postgres silently skips it; a self-vote is never lost.
  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  SELECT p_session_id, v.learner_id, v_event, v_inst, v.rating, v.comment, 'volunteer_kiosk', auth.uid()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    capture_method = 'volunteer_kiosk', submitted_by = EXCLUDED.submitted_by, updated_at = now()
  WHERE public.event_session_feedback.submitted_by IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- refresh value_score_avg for each picked learner (idempotent; a skipped self-row
  -- recomputes to the same value, so this is safe for clobber-skipped rows too).
  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  SELECT v_event, picked.learner_id, v_inst,
         (SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
            WHERE f.event_id = v_event AND f.learner_id = picked.learner_id), now()
  -- #1694 r6 (MEDIUM): refresh value_score_avg ONLY for learners that actually have a
  -- feedback row for this event. An enrolled-but-FILTERED pick (invalid rating / wrong
  -- batch, dropped from `valid`) with no feedback row would otherwise upsert
  -- value_score_avg = NULL (avg over an empty set) — polluting the leading metric and
  -- creating a spurious completion row. The feedback-row EXISTS re-aligns `picked` with `valid`.
  FROM (SELECT DISTINCT (m->>'learner_id')::uuid AS learner_id
        FROM jsonb_array_elements(p_marks) m
        WHERE EXISTS (SELECT 1 FROM public.induction_enrollment ie
                      WHERE ie.event_id = v_event AND ie.learner_id = (m->>'learner_id')::uuid)
          AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                      WHERE f.event_id = v_event AND f.learner_id = (m->>'learner_id')::uuid)) picked
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_n;
END $function$;

-- ── 4. Pulse/poll gate — the coordinator clause the July retrofit missed ─────
-- Gates ALL induction poll + pulse host RPCs. Speakers already pass; a per-event
-- coordinator without the global induction.manage permission did NOT.
CREATE OR REPLACE FUNCTION public._fn_induction_can_manage_session_pulse(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_event uuid; v_is_speaker boolean;  -- ADDED: v_event
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst  -- ADDED: es.event_id, v_event
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RETURN false; END IF;  -- not an induction session

  SELECT EXISTS (
    SELECT 1 FROM public.event_session_speakers sp
    WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid()
  ) INTO v_is_speaker;

  RETURN v_is_speaker
      OR is_super_admin() OR is_admin()
      OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
      OR public.fn_induction_is_event_coordinator(v_event);  -- ADDED
END $function$;

-- ── 5. Additive RLS — let a resource person read the event shell the page needs ─
-- events: the detail page header (name/status/dates). Also lets a cross-college
-- speaker see the induction on the landing list.
DROP POLICY IF EXISTS events_induction_speaker_read ON public.events;
CREATE POLICY events_induction_speaker_read ON public.events
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(id));

-- induction_programs: admission year, feedback scopes (getFeedbackScopes reads
-- this table directly) — without it the page shows a misleading "no induction
-- config row" warning for speakers.
DROP POLICY IF EXISTS induction_programs_speaker_view ON public.induction_programs;
CREATE POLICY induction_programs_speaker_view ON public.induction_programs
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(event_id));

-- induction_batches: batch chips/KPIs on the detail page.
DROP POLICY IF EXISTS induction_batches_speaker_view ON public.induction_batches;
CREATE POLICY induction_batches_speaker_view ON public.induction_batches
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(event_id));

NOTIFY pgrst, 'reload schema';
