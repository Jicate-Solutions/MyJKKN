-- ============================================================================
-- Fresher Induction — a fresher row carries the identifier it ACTUALLY has
-- File: 20261116000000_induction_fresher_identifier_fallback.sql | Date: 2026-09-07
--
-- Why: the three induction reads that print a fresher all ask for exactly one
-- identifier — register_number — and it is empty for nearly every fresher at
-- induction time. Measured against prod, per induction event:
--
--   Fresher Induction 2026                    435 freshers  429 register  434 roll
--   Fresher Induction 2026 - Engineering      225 freshers    0 register    1 roll
--   Fresher Induction - 2026 - Pharmacy       134 freshers    0 register    0 roll
--   Fresher Induction program - 2026           79 freshers    0 register    0 roll
--   Fresher Induction - 2026 - Allied Health   44 freshers    0 register    0 roll
--
-- Four cohorts out of five have NO register number and NO roll number, so the
-- mentor console and the mentor's own lane render a name and nothing else —
-- the coordinator assigning a fresher, and the mentor calling one out of a
-- group of thirteen, have no id to go on. 20261115000000 added the programme
-- as a disambiguator; it narrows a group to "the BSC (Nursing) one", which is
-- not enough when eight of thirteen share it.
--
-- What every fresher DOES have is learners_profiles.application_id
-- (JKKN-CNR-469) — minted at application, months before a register or roll
-- number is allocated. That is already what the rest of the app falls back to
-- (learners/analytics incomplete-profiles column, admission group dashboard).
--
-- Scope: ONE appended column per read, the first identifier the fresher
-- actually has:
--     register_number -> roll_number -> application_id
-- register first because it is the university's official number once it
-- exists; roll next because it is the college's; application_id last because
-- it always exists and is therefore the floor, never the preference. Each is
-- nullif(btrim(...),'') so a blank string does not win over a real id below it
-- — register_number is blank, not NULL, for some of the 435-fresher cohort.
--
--   1. fn_induction_admin_mentor_mentees      -> fresher_ident   (assigner)
--   2. fn_induction_admin_unassigned_freshers -> fresher_ident   (assigner)
--   3. fn_induction_my_feedback_group         -> ident           (mentor)
--
-- fresher_register / register_number are LEFT IN PLACE and unchanged. The new
-- column is additive: nothing that reads the old one changes meaning, and the
-- column is appended LAST so every positional ORDER BY keeps pointing at the
-- same expression it did before (3, 2, and "5, 6, 2" respectively).
--
-- The auth gates, the cover sweep, the batch scoping and the row sets are the
-- live bodies verbatim — each function here is its current definition plus one
-- SELECT expression.
--
-- DELIBERATELY NOT INCLUDED (still): student_mobile / father_mobile on either
-- of these reads. Both TS types declare them and both UIs already render a
-- tap-to-call link from them, so they stay blank — putting freshers' phone
-- numbers in front of a wider audience is a policy call, not a rendering fix,
-- and it is being taken separately.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): adding an OUT column changes the
-- return type, which REPLACE refuses. Grants are re-applied because DROP takes
-- them with it.
-- ============================================================================

-- The one definition of "the id this fresher actually has". Written out at
-- each call site rather than as a helper function: these are SECURITY DEFINER
-- reads and a helper would be one more object to grant, revoke and keep in
-- step for three lines of coalesce.


-- ── 1. A mentor's assigned freshers (assigner console) ──────────────────────
DROP FUNCTION IF EXISTS public.fn_induction_admin_mentor_mentees(uuid);

CREATE FUNCTION public.fn_induction_admin_mentor_mentees(p_event_id uuid)
RETURNS TABLE(mentor_learner_id uuid, fresher_learner_id uuid, fresher_name text,
              fresher_register text, has_feedback boolean,
              is_cover boolean, cover_until date,
              original_mentor_learner_id uuid, original_mentor_name text,
              program_name text,
              -- ADDED — the identifier that is actually populated.
              fresher_ident text)
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
         pr.program_name::text,
         coalesce(nullif(btrim(lp.register_number),''),          -- ADDED
                  nullif(btrim(lp.roll_number),''),
                  nullif(btrim(lp.application_id),''))::text
  FROM public.induction_feedback_volunteers v
  JOIN public.induction_feedback_volunteer_group g ON g.volunteer_id = v.id
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.induction_feedback_volunteers ov ON ov.id = g.covering_for_volunteer_id
  LEFT JOIN public.learners_profiles olp ON olp.id = ov.learner_id
  WHERE v.event_id = p_event_id AND v.is_active
  ORDER BY 3;
END $function$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) TO authenticated;


-- ── 2. The unassigned pool (assigner console) ───────────────────────────────
--
-- The list a coordinator picks from when placing a fresher with a mentor.
-- Stays STABLE — it sweeps nothing.
DROP FUNCTION IF EXISTS public.fn_induction_admin_unassigned_freshers(uuid);

CREATE FUNCTION public.fn_induction_admin_unassigned_freshers(p_event_id uuid)
RETURNS TABLE(fresher_learner_id uuid, fresher_name text, fresher_register text,
              program_name text,
              fresher_ident text)   -- ADDED
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
         pr.program_name::text,
         coalesce(nullif(btrim(lp.register_number),''),          -- ADDED
                  nullif(btrim(lp.roll_number),''),
                  nullif(btrim(lp.application_id),''))::text
  FROM public.induction_enrollment ie
  JOIN public.learners_profiles lp ON lp.id = ie.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
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


-- ── 3. The mentor's OWN group (mentor lane) ─────────────────────────────────
--
-- Same fresher, read by the person who has to find them in a crowd. The
-- mentor-scoped gate (must be an active volunteer on this event) and the
-- batch scoping are unchanged.
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
  program_name    TEXT,
  ident           TEXT   -- ADDED
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
         pr.program_name::text,
         coalesce(nullif(btrim(lp.register_number),''),          -- ADDED
                  nullif(btrim(lp.roll_number),''),
                  nullif(btrim(lp.application_id),''))::text
  FROM public.induction_feedback_volunteer_group g
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = v_event AND ie.learner_id = g.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
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
