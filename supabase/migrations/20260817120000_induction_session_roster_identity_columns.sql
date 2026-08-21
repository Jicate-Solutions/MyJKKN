-- ============================================================================
-- Fresher Induction — session roster gains identity columns (program + father mobile)
-- File: 20260817120000_induction_session_roster_identity_columns.sql | Date: 2026-08-17
--
-- Why: a 225-fresher Inauguration roster is unusable when the only identifier is
-- a name and a register_number that is still NULL pre-enrolment. The marker needs
-- to tell two "AKASH"es apart, and the parent contact is the field they actually
-- verify against. Adds two columns to the roster read — program_name (via
-- learners_profiles.program_id) and father_mobile — so the dialog can display
-- them and search on them client-side.
--
-- The auth check is UNCHANGED: this is the current live body (per
-- 20260702150000_induction_resource_person_session_access.sql — super/admin,
-- induction.view + institution access, per-event coordinator, or an assigned
-- resource person of THIS session) with only the two SELECT columns added.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): adding OUT columns changes the
-- function's return type, which REPLACE refuses. Grants are re-applied below
-- because DROP takes them with it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_session_roster(uuid);

CREATE FUNCTION public.fn_induction_session_roster(p_session_id uuid)
RETURNS TABLE(
  learner_id      uuid,
  name            text,
  register_number text,
  batch_label     text,
  status          text,
  program_name    text,   -- ADDED
  father_mobile   text    -- ADDED
)
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
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid())) THEN
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text,
         pr.program_name::text,    -- ADDED
         lp.father_mobile::text    -- ADDED
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id          -- ADDED
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $function$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_roster(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_roster(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
