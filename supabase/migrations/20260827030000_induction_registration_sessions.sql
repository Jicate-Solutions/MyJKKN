-- ============================================================================
-- Fresher Induction — REGISTRATION sessions (the fresher registration desk)
-- File: 20260827030000_induction_registration_sessions.sql | Date: 2026-08-27
--
-- WHAT: a session whose kind is 'registration'. It is an ordinary induction
-- session in every respect — day, time, venue, batch, the same attendance
-- roster UI — with two differences:
--
--   • NO resource person is needed. Registration is a desk, not a talk, so the
--     coordinator form hides the speaker picker for it.
--   • SENIOR PEER MENTORS may take it. They are the people physically at the
--     desk on day 1, so they mark the WHOLE roster (not just their own assigned
--     group) and they may do it BEFORE their mentor training is recorded.
--
-- WHY those two mentor relaxations are safe on THIS kind and nowhere else:
--   • whole roster — at registration nobody is assigned yet (auto-balance runs
--     after the cohort is known; today every mentor on this induction has 0
--     assigned freshers, so the own-group rule would show them an empty list and
--     let them mark nobody).
--   • no training gate — registration happens on day 1, typically before mentor
--     training. The gate still applies to feedback capture and to attendance on
--     every non-registration session.
-- Everything else a mentor is bound by still holds on registration sessions:
-- they must be an ACTIVE mentor of THIS event, the mentorship must not have
-- ended for the academic year, the fresher must be ENROLLED (and in the
-- session's batch when the session is batch-specific), ineligible rows are
-- SKIPPED rather than aborting the save, and the ANTI-CLOBBER rule stands — a
-- mentor never overwrites a mark made by staff or by another user.
--
-- `kind` already exists on event_sessions (NULL for normal sessions,
-- 'mentor_checkin' for the monthly mentor check-ins), so this adds no column and
-- no table — 'registration' is simply a third value. No CHECK constraint is
-- added: kind is written only by these DEFINER RPCs, and fn_induction_upsert_session
-- below validates its own input.
--
-- Signature changes (DROP-then-CREATE, not CREATE OR REPLACE):
--   fn_induction_upsert_session      + p_kind        (new DEFAULT arg)
--   fn_induction_list_sessions       + kind          (new OUT column)
--   fn_induction_my_volunteer_sessions + kind, batch_id (new OUT columns)
-- Postgres cannot REPLACE a function whose OUT columns change, and an added
-- DEFAULT arg would otherwise leave two ambiguous overloads.
--
-- All bodies below are the LIVE definitions (pg_get_functiondef) with ONLY the
-- marked lines added.
-- ============================================================================

-- ── 1. Session authoring — persist the kind ──────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_induction_upsert_session(
  uuid, uuid, integer, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb, integer, uuid);

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(
  p_event_id uuid,
  p_session_id uuid,
  p_day_number integer,
  p_batch_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_title text,
  p_description text DEFAULT NULL::text,
  p_venue_text text DEFAULT NULL::text,
  p_speaker_text text DEFAULT NULL::text,
  p_outcome_text text DEFAULT NULL::text,
  p_resource_links jsonb DEFAULT '[]'::jsonb,
  p_session_order integer DEFAULT 1,
  p_venue_resource_id uuid DEFAULT NULL::uuid,
  p_kind text DEFAULT NULL::text   -- ADDED: NULL = leave as-is, '' = clear, 'registration' = registration desk
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_sid           UUID;
  v_existing_res  UUID;
  v_existing_text TEXT;
  v_venue_text    TEXT;
  v_res_name      TEXT;
  v_res_status    TEXT;
  v_res_inst      UUID;
  v_res_is_venue  BOOLEAN;
  v_kind          TEXT;   -- ADDED
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: not authorized';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'fn_induction_upsert_session: title required'; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: end must be after start';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.induction_batches b WHERE b.id = p_batch_id AND b.event_id = p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: batch does not belong to this induction';
  END IF;
  -- ADDED: this RPC authors normal and registration sessions only. 'mentor_checkin'
  -- is owned by fn_induction_create_training_session and must not be settable here.
  v_kind := NULLIF(btrim(COALESCE(p_kind, '')), '');
  IF v_kind IS NOT NULL AND v_kind <> 'registration' THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: unsupported session kind %', v_kind;
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;
  ELSE
    SELECT r.name,
           r.status,
           r.institution_id,
           EXISTS (
             SELECT 1 FROM public.resource_parent_categories pc
             WHERE pc.id = r.parent_category_id
               AND lower(btrim(pc.name)) = 'spaces & venues'
           )
      INTO v_res_name, v_res_status, v_res_inst, v_res_is_venue
    FROM public.resources r
    WHERE r.id = p_venue_resource_id;

    IF v_res_name IS NULL THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue resource not found';
    END IF;
    IF NOT v_res_is_venue THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: resource is not a Spaces & Venues room';
    END IF;
    IF v_res_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue is not available';
    END IF;
    -- NOT touched: this gates whether the caller may use THIS VENUE (its own
    -- institution), an unrelated concern from "can this caller manage this induction."
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by, kind)                                    -- ADDED: kind
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid(),
       v_kind)                                                               -- ADDED
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      -- ADDED: p_kind NULL leaves kind untouched (so a caller that doesn't know
      -- about kinds — or a mentor_checkin row — is never silently reclassified);
      -- '' clears it back to a normal session; 'registration' sets the desk.
      kind = CASE WHEN p_kind IS NULL THEN kind ELSE v_kind END,
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  uuid, uuid, integer, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb, integer, uuid, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  uuid, uuid, integer, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb, integer, uuid, text)
  TO authenticated;

-- ── 2. Session list — expose the kind so the UI can badge + gate on it ───────
DROP FUNCTION IF EXISTS public.fn_induction_list_sessions(uuid);

CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text,
              start_at timestamp with time zone, end_at timestamp with time zone, title text,
              description text, venue_text text, venue_resource_id uuid, speaker_text text,
              outcome_text text, resource_links jsonb, status text,
              kind text)   -- ADDED
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

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text,
         s.kind::text   -- ADDED
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    AND (v_is_coordinator OR v_is_speaker OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_list_sessions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_sessions(uuid) TO authenticated;

-- ── 3. Roster — a mentor may read the WHOLE roster of a registration session ─
CREATE OR REPLACE FUNCTION public.fn_induction_session_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text,
              program_name text, father_mobile text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_batch UUID; v_inst UUID; v_kind TEXT;  -- ADDED: v_kind
BEGIN
  SELECT s.event_id, s.batch_id, s.kind INTO v_event, v_batch, v_kind  -- ADDED: s.kind
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())
          -- ADDED: registration desk — an ACTIVE Senior Peer Mentor of this event
          -- reads the whole roster (that is the point of a desk). Untrained is
          -- fine for reading; the write RPC applies its own registration rules.
          OR (v_kind = 'registration' AND EXISTS (
                SELECT 1 FROM public.induction_feedback_volunteers v
                WHERE v.event_id = v_event
                  AND v.learner_id = get_my_learner_id()
                  AND v.is_active
                  AND v.ended_at IS NULL))) THEN
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text,
         pr.program_name::text,
         lp.father_mobile::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $function$;

-- ── 4. Mentor attendance write — registration rules ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_mark_attendance(p_session_id uuid, p_marks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_inst UUID; v_my_learner UUID; v_vol UUID; v_n INTEGER;
        v_is_registration BOOLEAN;   -- ADDED
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id, (s.kind = 'registration')                    -- ADDED: s.kind
    INTO v_event, v_sbatch, v_is_registration
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an induction session'; END IF;
  v_is_registration := COALESCE(v_is_registration, false);                    -- ADDED

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not a learner'; END IF;
  SELECT v.id INTO v_vol FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an assigned Senior Peer Mentor for this induction';
  END IF;

  -- P2c LIFECYCLE GATE: mentorship ends at the freshers's first-year end.
  -- (Applies to registration too — an ended mentor is not on the desk.)
  IF EXISTS (
    SELECT 1 FROM public.induction_feedback_volunteers v
    LEFT JOIN public.academic_years ay ON ay.id = v.academic_year_id
    WHERE v.id = v_vol
      AND (v.ended_at IS NOT NULL OR (ay.end_date IS NOT NULL AND ay.end_date < CURRENT_DATE))
  ) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: this Senior Peer Mentor assignment has ended for the academic year';
  END IF;

  -- P2b TRAINING GATE — WAIVED on the registration desk (day 1 runs before
  -- mentor training); still enforced on every other session.
  IF NOT v_is_registration                                                    -- ADDED
     AND NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers WHERE id = v_vol AND is_trained) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: your Senior Peer Mentor training is not complete yet';
  END IF;

  WITH valid AS (
    SELECT DISTINCT ON ((e->>'learner_id')::uuid)
           (e->>'learner_id')::uuid AS learner_id, (e->>'status') AS status
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'status') IN ('present','absent','excused','od')
      -- ADDED: own-group scoping is skipped on the registration desk — a mentor
      -- checks in whoever reaches the desk, and groups are not assigned yet.
      AND (v_is_registration
           OR EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                      WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid))
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = v_event AND ie.learner_id = (e->>'learner_id')::uuid
                    AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch))
    ORDER BY (e->>'learner_id')::uuid
  )
  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, v.learner_id, v_inst, v.status, auth.uid(), now()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now()
  WHERE public.event_session_attendance.marked_by IS NULL
     OR public.event_session_attendance.marked_by = auth.uid();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END $function$;

-- ── 5. Mentor's own session list — carry kind + batch so the desk is findable ─
-- The mentor page hides sessions where the mentor owns no freshers (group_size
-- = 0). A registration session must survive that filter, because at registration
-- time NOBODY is assigned yet — hence `kind` in the output.
DROP FUNCTION IF EXISTS public.fn_induction_my_volunteer_sessions();

CREATE OR REPLACE FUNCTION public.fn_induction_my_volunteer_sessions()
RETURNS TABLE(event_id uuid, event_name text, institution_name text, session_id uuid,
              session_title text, day_number integer, start_at timestamp with time zone,
              end_at timestamp with time zone, group_size integer, captured integer,
              kind text)   -- ADDED
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_my_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_volunteer_sessions: not authenticated'; END IF;
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RETURN; END IF;  -- not a learner → empty

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
         -- of those (within the session's batch), how many already have a rating —
         -- same batch guard as group_size so captured can never exceed it (review #1694 r2)
         (SELECT count(*)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.induction_enrollment ie
              ON ie.event_id = v.event_id AND ie.learner_id = g.learner_id
            JOIN public.event_session_feedback f
              ON f.session_id = s.id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id
              AND (s.batch_id IS NULL OR ie.batch_id = s.batch_id)),
         s.kind::text   -- ADDED
  FROM public.induction_feedback_volunteers v
  JOIN public.events ev ON ev.id = v.event_id
  LEFT JOIN public.institutions inst ON inst.id = v.institution_id
  JOIN public.event_sessions s ON s.event_id = v.event_id
  WHERE v.learner_id = v_my_learner AND v.is_active
  ORDER BY ev.name, s.day_number NULLS LAST, s.start_at;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_volunteer_sessions() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_volunteer_sessions() TO authenticated;

NOTIFY pgrst, 'reload schema';
