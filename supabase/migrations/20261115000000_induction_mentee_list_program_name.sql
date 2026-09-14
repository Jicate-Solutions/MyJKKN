-- ============================================================================
-- Fresher Induction — the Senior Peer Mentor's mentee list gains the programme
-- File: 20261115000000_induction_mentee_list_program_name.sql | Date: 2026-09-07
--
-- Why: the peer-mentor console's fresher rows printed only the name and the
-- register number. register_number is still NULL for most freshers at induction
-- time, so a coordinator reading a mentor's group (and the mentor reading their
-- own) sees a name over an em-dash and cannot tell two same-name freshers apart,
-- nor find one fresher in a group of twelve.
--
-- The PROGRAMME is the right disambiguator, not the department: every
-- engineering fresher's department_id resolves to the shared first-year
-- "Science and Humanities" row, so department cannot tell EEE from CSE.
-- programs.program_name is what a fresher means when they say "my department".
-- The coordinator's session roster (fn_induction_session_roster, 20260817120000)
-- and the mentor's own group read (fn_induction_my_feedback_group,
-- 20260909003000) already carry it; this closes the last read that does not.
--
-- Scope: program_name, and ONLY program_name, on the two reads that lacked it —
--   1. fn_induction_admin_mentor_mentees
--   2. fn_induction_admin_unassigned_freshers
-- The auth gates, the cover sweep and the row sets are the live bodies,
-- untouched; each is that body plus one LEFT JOIN and one SELECT column. The
-- column is appended LAST so the positional ORDER BYs keep meaning what they
-- meant (3 = fresher_name, 2 = fresher_name respectively).
--
-- DELIBERATELY NOT INCLUDED: student_mobile / father_mobile. The admin console
-- already renders a tap-to-call link from them and the TS type already declares
-- them, so they read as blank today — but putting freshers' phone numbers in
-- front of a wider audience is a policy decision, not a rendering fix, and it is
-- being taken separately. Adding them later is another DROP/CREATE like this one.
--
-- This is the definition 20260920000000_induction_spm_incremental_balance_and_
-- cover_reassign.sql already intends for this function — that migration has not
-- reached prod (it is absent from supabase_migrations.schema_migrations), and
-- the admin console UI has been rendering these three fields as blanks ever
-- since. Re-applying that migration later is a no-op against this.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): adding OUT columns changes the
-- return type, which REPLACE refuses. Grants are re-applied because DROP takes
-- them with it.
-- ============================================================================

-- ── 1. A mentor's assigned freshers ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_induction_admin_mentor_mentees(uuid);

CREATE FUNCTION public.fn_induction_admin_mentor_mentees(p_event_id uuid)
RETURNS TABLE(mentor_learner_id uuid, fresher_learner_id uuid, fresher_name text,
              fresher_register text, has_feedback boolean,
              is_cover boolean, cover_until date,
              original_mentor_learner_id uuid, original_mentor_name text,
              -- ADDED — the identity aid, for the same reason the attendance
              -- roster carries it.
              program_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not authorized';
  END IF;

  -- VOLATILE by design: sweep expired covers before reading, so the console can
  -- never show a cover that ended yesterday as though it were still running.
  PERFORM public.fn_induction_expire_mentor_covers(p_event_id);

  RETURN QUERY
  SELECT v.learner_id,
         g.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         EXISTS (SELECT 1 FROM public.event_session_feedback f
                 WHERE f.event_id = v.event_id AND f.learner_id = g.learner_id),
         (g.covering_for_volunteer_id IS NOT NULL),
         g.cover_until,
         ov.learner_id,
         btrim(coalesce(olp.first_name,'') || ' ' || coalesce(olp.last_name,''))::text,
         pr.program_name::text       -- ADDED
  FROM public.induction_feedback_volunteers v
  JOIN public.induction_feedback_volunteer_group g ON g.volunteer_id = v.id
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id          -- ADDED
  LEFT JOIN public.induction_feedback_volunteers ov ON ov.id = g.covering_for_volunteer_id
  LEFT JOIN public.learners_profiles olp ON olp.id = ov.learner_id
  WHERE v.event_id = p_event_id AND v.is_active
  ORDER BY 3;
END $function$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) TO authenticated;


-- ── 2. The unassigned pool ──────────────────────────────────────────────────
--
-- Same page, same problem: this is the list a coordinator picks from when
-- placing a fresher with a mentor, and it showed a name over a bare em-dash.
-- Stays STABLE — it sweeps nothing.
DROP FUNCTION IF EXISTS public.fn_induction_admin_unassigned_freshers(uuid);

CREATE FUNCTION public.fn_induction_admin_unassigned_freshers(p_event_id uuid)
RETURNS TABLE(fresher_learner_id uuid, fresher_name text, fresher_register text,
              program_name text)   -- ADDED
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_unassigned_freshers: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_unassigned_freshers: not authorized';
  END IF;

  RETURN QUERY
  SELECT ie.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         pr.program_name::text                                  -- ADDED
  FROM public.induction_enrollment ie
  JOIN public.learners_profiles lp ON lp.id = ie.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id         -- ADDED
  WHERE ie.event_id = p_event_id
    AND NOT EXISTS (
      SELECT 1 FROM public.induction_feedback_volunteer_group g
      JOIN public.induction_feedback_volunteers v ON v.id = g.volunteer_id AND v.is_active
      WHERE v.event_id = p_event_id AND g.learner_id = ie.learner_id)
  ORDER BY 2;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_admin_unassigned_freshers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_unassigned_freshers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_unassigned_freshers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
