-- ============================================================================
-- Fresher Induction — the mentee's mentor card drops the mentor's contact details
-- File: 20261118000000_induction_my_mentor_no_contact.sql | Date: 2026-09-08
--
-- 20261117000000 shipped fn_induction_my_mentor_for_event returning the
-- mentor's student_mobile and college_email, so a fresher could tap to call or
-- mail the senior assigned to them. That was flagged at the time as the one
-- policy call in the change, and the call has come back: DON'T publish a
-- mentor's phone number and email to their mentees.
--
-- Removed at the RPC, not hidden in the card. Deleting the buttons from
-- my-mentor-card.tsx would leave both values in the PostgREST response, and
-- any authenticated fresher can read that straight out of the browser
-- devtools network tab or by calling the RPC themselves. UI that "hides" a
-- field the server still sends has not hidden anything — the mentor's mobile
-- would still be sitting in a response body on 635 students' devices.
--
-- This matches the data-minimisation line the sibling read already holds:
-- fn_induction_my_mentor returns the mentor's NAME only, deliberately
-- withholding register number and other peer PII until a consumer actually
-- needs it (deep-review #1902 LOW).
--
-- What a mentee still sees, unchanged: who their mentor is (name, photo,
-- programme, identifier), and whether that mentor is a temporary stand-in.
-- Knowing who to look for was the point; the contact route is a separate
-- decision the Director can revisit without re-plumbing this read.
--
-- DROP-then-CREATE (not CREATE OR REPLACE): removing OUT columns changes the
-- return type, which REPLACE refuses. Grants are re-applied because DROP takes
-- them with it. Everything else — the auth gate, the two-chain learner
-- resolution, the tenant guard, the cover columns, STABLE — is 20261117000000
-- verbatim minus the two SELECT expressions.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_my_mentor_for_event(uuid);

CREATE FUNCTION public.fn_induction_my_mentor_for_event(p_event_id uuid)
RETURNS TABLE (
  mentor_learner_id     uuid,
  mentor_name           text,
  mentor_ident          text,
  mentor_program        text,
  -- REMOVED: mentor_mobile, mentor_email. See header.
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
-- in Supabase.
REVOKE ALL ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_my_mentor_for_event(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
