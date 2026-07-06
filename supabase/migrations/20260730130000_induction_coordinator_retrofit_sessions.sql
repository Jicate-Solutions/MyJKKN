-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 1: 6 session-scoped RPCs
-- File: 20260730130000_induction_coordinator_retrofit_sessions.sql | Date: 2026-07-30
-- Adds `OR fn_induction_is_event_coordinator(event_id)` to each function's
-- existing auth check. Every body below is the CURRENT LIVE definition
-- (fetched via pg_get_functiondef, not reconstructed from migration files) with
-- exactly the one marked line added — nothing else changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_delete_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_event UUID;  -- ADDED: v_event
BEGIN
  SELECT s.event_id, ip.institution_id INTO v_event, v_inst  -- ADDED: s.event_id, v_event
  FROM public.event_sessions s
  JOIN public.induction_programs ip ON ip.event_id = s.event_id
  WHERE s.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_delete_session: session not found / not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_delete_session: not authorized';
  END IF;
  DELETE FROM public.event_sessions WHERE id = p_session_id;
  RETURN true;
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
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
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
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_feedback_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.learner_id::uuid, f.rating::int, f.comment::text,
         f.capture_method::text, (f.submitted_by IS NULL)::boolean
  FROM public.event_session_feedback f
  WHERE f.session_id = p_session_id;
END $function$;

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
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
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

CREATE OR REPLACE FUNCTION public.fn_induction_set_session_speakers(p_session_id uuid, p_profile_ids uuid[], p_source_label text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_count integer; v_event uuid;  -- ADDED: v_event
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authenticated';
  END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst  -- ADDED: es.event_id, v_event
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not an induction session';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authorized';
  END IF;

  DELETE FROM public.event_session_speakers WHERE session_id = p_session_id;

  INSERT INTO public.event_session_speakers (session_id, profile_id, source_label, created_by)
  SELECT p_session_id, pid, p_source_label, auth.uid()
  FROM unnest(COALESCE(p_profile_ids, ARRAY[]::uuid[])) AS pid
  -- only real users the caller can access: prevents linking a profile from an
  -- institution the coordinator has no access to (cross-tenant link injection).
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pid
                AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id)))
  ON CONFLICT (session_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

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
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
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

NOTIFY pgrst, 'reload schema';
