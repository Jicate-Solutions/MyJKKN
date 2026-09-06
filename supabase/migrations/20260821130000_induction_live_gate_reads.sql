-- Induction lifecycle gate, part 2 of 2: READS (learner visibility).
--
-- A trigger cannot filter a SELECT, so the read side is patched in the five
-- learner-facing RPCs. CREATE OR REPLACE throughout -- never DROP + CREATE:
-- DROP FUNCTION discards the function's grants and EXECUTE silently reverts to
-- PUBLIC. Signatures are unchanged, so REPLACE is sufficient.
--
-- fn_induction_my_enrollments is the master switch. /learners/my-induction
-- takes rows[0] and renders its empty state when that is null, so filtering
-- here makes the whole page go dark for a Draft induction; the other four are
-- defence in depth for the banners and the peer-mentor lane, which fetch
-- independently of the enrollment call.
--
-- FUTURE STATUSES. The predicate is `= 'live'` because Draft <-> Live are the
-- only two states this module has (verified 2026-08-21: 8 inductions, 3 draft,
-- 5 live, none in a legacy status). If inductions ever gain a post-completion
-- state such as 'archived', THIS READ PREDICATE MUST WIDEN -- otherwise a
-- fresher loses their own induction history the moment it is closed out. The
-- WRITE guard in the companion migration must stay `= 'live'` regardless.

-- ---------------------------------------------------------------------------
-- 1. The master switch: a learner's own enrollments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_enrollments()
 RETURNS TABLE(event_id uuid, event_name text, institution_id uuid, institution_name text, start_date date, end_date date, status text, batch_id uuid, batch_label text, sessions_total integer, sessions_attended integer, attendance_pct numeric, participation_complete boolean, value_score_avg numeric, advocacy_score numeric, is_profile_complete boolean, profile_fields_total integer, profile_fields_filled integer, feedback_day_enabled boolean, feedback_program_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    c.advocacy_score::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer,
    COALESCE(ip.feedback_day_enabled, false)::boolean,
    COALESCE(ip.feedback_program_enabled, false)::boolean
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b  ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c  ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  LEFT JOIN public.induction_programs   ip ON ip.event_id = ie.event_id
  WHERE ie.learner_id = v_learner
    -- Lifecycle gate. Enrollment happens during Draft (fn_induction_auto_enroll
    -- is prep work), so being enrolled must NOT by itself reveal the programme.
    AND e.status = 'live'
  ORDER BY e.start_date DESC NULLS LAST;
END $function$;

-- ---------------------------------------------------------------------------
-- 2. The day-by-day schedule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
 RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text, start_at timestamp with time zone, end_at timestamp with time zone, title text, description text, venue_text text, venue_resource_id uuid, speaker_text text, outcome_text text, resource_links jsonb, status text, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst UUID;
  v_is_coordinator BOOLEAN;
  v_is_speaker BOOLEAN;
  v_my_learner UUID;
  v_my_batch UUID;
  v_enrolled BOOLEAN;
  v_event_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not an induction event'; END IF;

  v_is_coordinator := is_super_admin() OR is_admin()
    OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
    OR public.fn_induction_is_event_coordinator(p_event_id);

  v_is_speaker := public.fn_induction_is_event_speaker(p_event_id);

  v_my_learner := get_my_learner_id();
  SELECT true, ie.batch_id INTO v_enrolled, v_my_batch
  FROM public.induction_enrollment ie
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_my_learner;

  IF NOT v_is_coordinator AND NOT v_is_speaker AND NOT COALESCE(v_enrolled, false) THEN
    RAISE EXCEPTION 'fn_induction_list_sessions: not authorized';
  END IF;

  -- Lifecycle gate, learners only. Coordinators and resource persons keep full
  -- Draft access -- Draft is precisely where the schedule is built and
  -- previewed, so gating them would break the authoring flow this module needs.
  IF NOT v_is_coordinator AND NOT v_is_speaker THEN
    SELECT e.status INTO v_event_status FROM public.events e WHERE e.id = p_event_id;
    IF v_event_status IS DISTINCT FROM 'live' THEN
      RAISE EXCEPTION 'fn_induction_list_sessions: this induction is not live yet';
    END IF;
  END IF;

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text,
         s.kind::text
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    AND (v_is_coordinator OR v_is_speaker OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;

-- ---------------------------------------------------------------------------
-- 3 & 4. The two learner banners. Both already join events, so the gate is one
-- predicate each.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_for_learner()
 RETURNS TABLE(poll_id uuid, session_id uuid, event_id uuid, event_name text, title text, day_number integer, auto_close_at timestamp with time zone, already_answered boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_learner)
  FROM public.induction_session_poll p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = v_learner
  WHERE p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
    AND ev.status = 'live'   -- lifecycle gate
  ORDER BY p.issued_at DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_pulse_for_learner()
 RETURNS TABLE(pulse_id uuid, session_id uuid, event_id uuid, event_name text, title text, day_number integer, auto_close_at timestamp with time zone, already_answered boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_pulse_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;  -- not a learner -> no pulses

  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (
           SELECT 1 FROM public.event_session_feedback f
           WHERE f.session_id = p.session_id AND f.learner_id = v_learner
         ) AS already_answered
  FROM public.induction_session_pulse p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie
    ON ie.event_id = p.event_id AND ie.learner_id = v_learner          -- I am enrolled
  WHERE p.is_open = true
    AND p.auto_close_at > now()
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)             -- session is for my batch
    AND ev.status = 'live'                                             -- lifecycle gate
  ORDER BY p.issued_at DESC;
END $function$;

-- ---------------------------------------------------------------------------
-- 5. The peer-mentor / feedback-volunteer lane (/my-induction-feedback).
-- Without this a Senior Peer Mentor still sees a Draft programme's sessions and
-- opens the check-in and group-capture dialogs on them -- the writes would now
-- be refused by the trigger, but the lane should not offer them at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_volunteer_sessions()
 RETURNS TABLE(event_id uuid, event_name text, institution_name text, session_id uuid, session_title text, day_number integer, start_at timestamp with time zone, end_at timestamp with time zone, group_size integer, captured integer, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_my_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_volunteer_sessions: not authenticated'; END IF;
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RETURN; END IF;  -- not a learner -> empty

  RETURN QUERY
  SELECT v.event_id,
         ev.name::text,
         inst.name::text,
         s.id,
         s.title::text,
         s.day_number,
         s.start_at,
         s.end_at,
         -- my group size for THIS session (respect batch-specific sessions)
         (SELECT count(*)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.induction_enrollment ie
              ON ie.event_id = v.event_id AND ie.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id
              AND (s.batch_id IS NULL OR ie.batch_id = s.batch_id)),
         -- of those (within the session's batch), how many already have a rating --
         -- same batch guard as group_size so captured can never exceed it (review #1694 r2)
         (SELECT count(*)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.induction_enrollment ie
              ON ie.event_id = v.event_id AND ie.learner_id = g.learner_id
            JOIN public.event_session_feedback f
              ON f.session_id = s.id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id
              AND (s.batch_id IS NULL OR ie.batch_id = s.batch_id)),
         s.kind::text
  FROM public.induction_feedback_volunteers v
  JOIN public.events ev ON ev.id = v.event_id
  LEFT JOIN public.institutions inst ON inst.id = v.institution_id
  JOIN public.event_sessions s ON s.event_id = v.event_id
  WHERE v.learner_id = v_my_learner AND v.is_active
    AND ev.status = 'live'   -- lifecycle gate
  ORDER BY ev.name, s.day_number NULLS LAST, s.start_at;
END $function$;
