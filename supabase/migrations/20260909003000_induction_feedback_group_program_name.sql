-- ============================================================================
-- Fresher Induction — mentor's group read gains program_name
-- File: 20260909003000_induction_feedback_group_program_name.sql | Date: 2026-08-20
--
-- Why: the Senior Peer Mentor's own attendance dialog (AttendanceCheckinDialog,
-- "<session> — attendance") printed only `register_number ?? '—'` under each
-- name. register_number is still NULL for most freshers at induction time, so
-- the mentor sees a column of em-dashes and cannot tell two same-name freshers
-- apart. The coordinator's roster already solves this by showing the PROGRAMME
-- (fn_induction_session_roster, 20260817120000) — department cannot, because
-- every engineering fresher sits in the shared first-year "Science and
-- Humanities" department. This adds the same field to the mentor-scoped read.
--
-- The auth check and the row set are UNCHANGED — this is the live body with one
-- LEFT JOIN and one SELECT column added. program_name is appended LAST so the
-- positional ORDER BY 5, 6, 2 keeps meaning what it meant.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): adding an OUT column changes the
-- return type, which REPLACE refuses. Grants are re-applied because DROP takes
-- them with it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_my_feedback_group(uuid);

CREATE FUNCTION public.fn_induction_my_feedback_group(p_session_id UUID)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  has_account     BOOLEAN,
  captured        BOOLEAN,
  capture_method  TEXT,
  program_name    TEXT   -- ADDED
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_my_learner UUID; v_vol UUID; v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  -- #1694 r6 (LOW): guard NULL like the sibling RPCs. Without it, has_account's
  -- institution-scoped EXISTS (... institution_id = v_inst) is false for everyone,
  -- mislabeling every fresher as 'no account'. Fail closed on a missing-program session.
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an induction session'; END IF;

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not a learner'; END IF;
  SELECT v.id INTO v_vol
  FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an assigned feedback volunteer'; END IF;

  RETURN QUERY
  SELECT lp.id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         -- has_account institution-scoped via EXISTS (no profiles JOIN -> no duplicate
         -- rows, and a profile in ANOTHER college doesn't count -- review #1694 round 2).
         EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = lp.id AND p.institution_id = v_inst) AS has_account,
         (f.id IS NOT NULL) AS captured,
         f.capture_method::text,
         pr.program_name::text        -- ADDED
  FROM public.induction_feedback_volunteer_group g
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = v_event AND ie.learner_id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id            -- ADDED
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN public.event_session_feedback f ON f.session_id = p_session_id AND f.learner_id = g.learner_id
  WHERE g.volunteer_id = v_vol
    AND (v_sbatch IS NULL OR ie.batch_id = v_sbatch)   -- batch-specific session -> only its batch
  ORDER BY 5, 6, 2;  -- no-account first (col5 has_account), then uncaptured (col6), then name (col2)
END $function$;

-- Anon-lock (SECURITY DEFINER -- Supabase grants anon EXECUTE by default).
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_feedback_group(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_feedback_group(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
