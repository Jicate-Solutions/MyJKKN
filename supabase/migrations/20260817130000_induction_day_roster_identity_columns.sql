-- ============================================================================
-- Fresher Induction — DAY roster gains identity columns (program + father mobile)
-- File: 20260817130000_induction_day_roster_identity_columns.sql | Date: 2026-08-17
--
-- Sibling of 20260817120000 (session roster). Same reason: the Day-1 bulk-mark
-- sheet carries the whole joining cohort (225 freshers) and register_number is
-- still NULL pre-enrolment, so the marker has nothing to tell two same-name
-- freshers apart. Adds program_name (via learners_profiles.program_id) and
-- father_mobile so DayAttendanceDialog can display and search on them.
--
-- The auth check is UNCHANGED — this is the current live body (per
-- 20260730140000_induction_coordinator_retrofit_event_batch1.sql: super/admin,
-- induction.view + institution access, or a per-event coordinator; day-level
-- marking is event-wide so resource persons are deliberately NOT on this gate)
-- with only the two SELECT columns and one LEFT JOIN added.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): adding OUT columns changes the
-- function's return type, which REPLACE refuses. Grants are re-applied below
-- because DROP takes them with it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_day_roster(uuid, integer);

CREATE FUNCTION public.fn_induction_day_roster(p_event_id uuid, p_day_number integer)
RETURNS TABLE(
  learner_id      uuid,
  name            text,
  register_number text,
  batch_label     text,
  status          text,
  is_mixed        boolean,
  program_name    text,   -- ADDED
  father_mobile   text    -- ADDED
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1,
         pr.program_name::text,    -- ADDED
         lp.father_mobile::text    -- ADDED
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id          -- ADDED
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $function$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default). service_role
-- is re-granted deliberately: the live grant carried it (batch1 retrofit, line 616) and
-- DROP would otherwise revoke it out from under any server-side caller.
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
