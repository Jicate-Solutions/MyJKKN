-- Migration: 20260710140000_induction_spm_admin_management.sql
-- Admin management console for Senior Peer Mentors — read + manage every mentor
-- AND their assigned mentee-freshers from one page. Backs the dedicated
-- /events/induction/[id]/mentors console.
--
-- The mentor roster (fn_induction_list_feedback_volunteers) + appoint / remove /
-- mark-trained / auto-balance already exist. These four add the missing mentee
-- half: see each mentor's freshers, see the unassigned pool, and manually
-- assign / move / unassign a fresher. A fresher belongs to exactly one mentor
-- per event (UNIQUE (event_id, learner_id) on the group table), so assign is an
-- upsert that moves the fresher to the new mentor. All admin-gated + anon-locked.

-- ── 1. Each mentor's mentees (one row per mentor↔fresher) ────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_admin_mentor_mentees(p_event_id uuid)
RETURNS TABLE(
  mentor_learner_id uuid,
  fresher_learner_id uuid,
  fresher_name text,
  fresher_register text,
  has_feedback boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not an induction event'; END IF;
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_mentor_mentees: not authorized';
  END IF;

  RETURN QUERY
  SELECT v.learner_id,
         g.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         EXISTS (SELECT 1 FROM public.event_session_feedback f
                 WHERE f.event_id = v.event_id AND f.learner_id = g.learner_id)
  FROM public.induction_feedback_volunteers v
  JOIN public.induction_feedback_volunteer_group g ON g.volunteer_id = v.id
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  WHERE v.event_id = p_event_id AND v.is_active
  ORDER BY 3;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_admin_mentor_mentees(uuid) TO authenticated;

-- ── 2. Freshers enrolled but not assigned to any mentor ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_admin_unassigned_freshers(p_event_id uuid)
RETURNS TABLE(fresher_learner_id uuid, fresher_name text, fresher_register text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
         lp.register_number::text
  FROM public.induction_enrollment ie
  JOIN public.learners_profiles lp ON lp.id = ie.learner_id
  WHERE ie.event_id = p_event_id
    AND NOT EXISTS (
      SELECT 1 FROM public.induction_feedback_volunteer_group g
      JOIN public.induction_feedback_volunteers v ON v.id = g.volunteer_id AND v.is_active
      WHERE v.event_id = p_event_id AND g.learner_id = ie.learner_id)
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_admin_unassigned_freshers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_admin_unassigned_freshers(uuid) TO authenticated;

-- ── 3. Assign / move a fresher to a mentor ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_admin_assign_fresher(
  p_event_id uuid, p_mentor_learner_id uuid, p_fresher_learner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_vol uuid;
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_assign_fresher: not authorized';
  END IF;
  -- target mentor must be an ACTIVE Senior Peer Mentor on this induction
  SELECT id INTO v_vol FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND learner_id = p_mentor_learner_id AND is_active;
  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'fn_induction_admin_assign_fresher: target is not an active Senior Peer Mentor for this induction';
  END IF;
  -- the fresher must be enrolled in THIS induction
  IF NOT EXISTS (SELECT 1 FROM public.induction_enrollment
                 WHERE event_id = p_event_id AND learner_id = p_fresher_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_assign_fresher: that learner is not a fresher in this induction';
  END IF;

  -- one mentor per fresher (UNIQUE event_id, learner_id) → upsert moves them.
  INSERT INTO public.induction_feedback_volunteer_group (volunteer_id, event_id, learner_id)
  VALUES (v_vol, p_event_id, p_fresher_learner_id)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET volunteer_id = EXCLUDED.volunteer_id, updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_admin_assign_fresher(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_admin_assign_fresher(uuid, uuid, uuid) TO authenticated;

-- ── 4. Unassign a fresher (back to the pool) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_admin_unassign_fresher(
  p_event_id uuid, p_fresher_learner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_admin_unassign_fresher: not authorized';
  END IF;
  DELETE FROM public.induction_feedback_volunteer_group g
  USING public.induction_feedback_volunteers v
  WHERE g.volunteer_id = v.id AND v.event_id = p_event_id AND g.learner_id = p_fresher_learner_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_admin_unassign_fresher(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_admin_unassign_fresher(uuid, uuid) TO authenticated;
