-- ============================================================================
-- Fresher Induction — a mentee can see who their Senior Peer Mentor is
-- File: 20261117000000_induction_my_mentor_card.sql | Date: 2026-09-07
--
-- Why: the assignment side of the SPM programme is complete — a coordinator
-- appoints mentors, assigns freshers, rebalances, and sets temporary covers,
-- and prod carries 809 mentee assignments across 68 active mentors. The
-- FRESHER side of that same edge is invisible. Measured against prod, an
-- assigned fresher today sees their mentor's name in exactly two places:
--
--   1. mentor-month-feedback-card.tsx — the name is embedded inside a rating
--      question ("did <name> help you this month?"), and the whole card is
--      hidden until a kind='mentor_checkin' session has come due. First beat
--      is 15 Aug 2026, so for most of induction it renders nothing.
--   2. struggling-note-card.tsx (class-feedback, not induction) — only when
--      an AI "struggling" note exists for that learner.
--
-- So a fresher who has a mentor is not told they have one, is never given a
-- way to contact them, and is not told when a stand-in is covering. The
-- programme's whole premise is that a fresher in trouble reaches out to a
-- named senior; they cannot reach someone they have not been told about.
--
-- Scope: ONE new read, fn_induction_my_mentor_for_event(p_event_id).
--
-- WHY A NEW FUNCTION RATHER THAN WIDENING fn_induction_my_mentor():
-- fn_induction_my_mentor() (20260709003000) resolves the caller as
--     SELECT lp.id FROM learners_profiles lp WHERE lp.profile_id = auth.uid()
-- and learners_profiles.profile_id is populated for 1 of the 809 assigned
-- mentees in prod. The other 634 with a working login link the OTHER way
-- (profiles.learner_id -> learner), which is what get_my_learner_id() reads.
-- That function therefore returns no row for ~99% of the people it exists to
-- serve. It is left ALONE here — struggling-note-card.tsx is its only caller
-- and changing a shared function's resolution is a separate, wider blast
-- radius. This new read uses get_my_learner_id() FIRST (635/809) and keeps
-- the profile_id lookup as a fallback (the remaining 1), so it resolves every
-- mentee that either chain can reach.
--
-- The remaining 174 of 809 have NO auth account by either chain and see
-- nothing regardless — an enrolment/account-provisioning gap, not a read bug.
--
-- Event-scoped (like fn_induction_my_mentor_checkins, unlike the unscoped
-- fn_induction_my_mentor) because the fresher page already knows its
-- event_id, and a learner who goes through induction twice must not be shown
-- last year's mentor.
--
-- STABLE, not VOLATILE: this is a student page read and must not carry the
-- fn_induction_expire_mentor_covers() side effect the admin console runs.
-- An unswept expired cover is surfaced honestly instead — is_cover stays true
-- and cover_until carries the date, because volunteer_id still points at the
-- stand-in until the sweep runs, so the stand-in IS still the mentee's mentor.
--
-- CONTACT DETAIL — this returns the MENTOR's mobile and college email to the
-- freshers assigned to that mentor. That is the opposite direction from the
-- fresher mobiles deliberately withheld from the mentor console: this is an
-- appointed support role's contact, shown only to the ~12 people that mentor
-- was appointed to support, and being reachable is the point of the role.
-- Both are 68/68 populated in prod. college_email is preferred over
-- student_email so the institutional address wins where both exist.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_my_mentor_for_event(uuid);

CREATE FUNCTION public.fn_induction_my_mentor_for_event(p_event_id uuid)
RETURNS TABLE (
  mentor_learner_id     uuid,
  mentor_name           text,
  mentor_ident          text,
  mentor_program        text,
  mentor_mobile         text,
  mentor_email          text,
  mentor_photo_url      text,
  is_cover              boolean,
  cover_until           date,
  original_mentor_name  text,
  assigned_at           timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_mentor_for_event: not authenticated';
  END IF;

  -- Resolve the caller's learner row. get_my_learner_id() (profiles.learner_id)
  -- first because it is the chain that actually carries the data — 635 of 809
  -- assigned mentees in prod. learners_profiles.profile_id is the fallback for
  -- the handful linked only that way.
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    SELECT lp.id INTO v_learner
    FROM public.learners_profiles lp
    WHERE lp.profile_id = auth.uid()
    LIMIT 1;
  END IF;

  -- No learner row, or a learner with no assignment on this event: return an
  -- empty set, never an exception. A fresher whose college has not run the SPM
  -- programme is not an error case, and this read sits on a page every fresher
  -- loads.
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT mlp.id,
         btrim(coalesce(mlp.first_name,'') || ' ' || coalesce(mlp.last_name,''))::text,
         -- Same identifier fallback the mentor/assigner reads use
         -- (20261116000000): register -> roll -> application_id, each
         -- nullif(btrim(...),'') so a blank string cannot beat a real id below it.
         coalesce(nullif(btrim(mlp.register_number),''),
                  nullif(btrim(mlp.roll_number),''),
                  nullif(btrim(mlp.application_id),''))::text,
         pr.program_name::text,
         nullif(btrim(mlp.student_mobile),'')::text,
         coalesce(nullif(btrim(mlp.college_email),''),
                  nullif(btrim(mlp.student_email),''))::text,
         nullif(btrim(mlp.student_photo_url),'')::text,
         (g.covering_for_volunteer_id IS NOT NULL),
         g.cover_until,
         btrim(coalesce(olp.first_name,'') || ' ' || coalesce(olp.last_name,''))::text,
         g.created_at
  FROM public.induction_feedback_volunteer_group g
  JOIN public.induction_feedback_volunteers v
    ON v.id = g.volunteer_id AND v.is_active
  JOIN public.learners_profiles mlp ON mlp.id = v.learner_id
  JOIN public.learners_profiles me  ON me.id  = v_learner
  LEFT JOIN public.programs pr ON pr.id = mlp.program_id
  -- The mentor being stood in FOR, when this row is a cover.
  LEFT JOIN public.induction_feedback_volunteers ov ON ov.id = g.covering_for_volunteer_id
  LEFT JOIN public.learners_profiles olp ON olp.id = ov.learner_id
  WHERE g.event_id = p_event_id
    AND g.learner_id = v_learner
    -- Tenant guard, mirroring fn_induction_my_mentor: mentor and mentee must
    -- share an institution. Defense-in-depth against a malformed group row.
    AND mlp.institution_id = me.institution_id
  -- ifvg_event_learner_uniq (event_id, learner_id) makes this at most one row;
  -- the LIMIT is belt-and-braces so a future constraint change cannot turn a
  -- single-mentor card into a list.
  LIMIT 1;
END $function$;

-- Anon-lock: SECURITY DEFINER functions get EXECUTE granted to anon by default
-- in Supabase, and this one reads a named student's contact details.
REVOKE ALL ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
