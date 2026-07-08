-- 20260731100000_spm_hardening_audit.sql
-- Senior Peer Mentor hardening fixes from the 2026-07-06 adversarial audit.
-- Applied to production via the Management API; committed here for the record.
--   #1 appoint must never stamp a NULL academic_year_id (immortal-mentorship guard)
--   #5 count_monthly_checkins must gate like every sibling read RPC
--   #2 new self-scoped read so the attendance dialog can seed prior marks (no clobber)
--   #3 new module-access helper so appointed event coordinators reach the induction UI

-- ===== #1: appoint must never stamp a NULL academic year =====
CREATE OR REPLACE FUNCTION public.fn_induction_appoint_feedback_volunteer(p_event_id uuid, p_learner_id uuid, p_capacity integer DEFAULT 20)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_id UUID; v_ay UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not authorized';
  END IF;
  IF p_learner_id IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: learner_id required'; END IF;
  IF EXISTS (SELECT 1 FROM public.induction_enrollment ie
             WHERE ie.event_id = p_event_id AND ie.learner_id = p_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is a fresher in this induction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = p_learner_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is not a member of this college';
  END IF;

  v_ay := public.fn_induction_mentorship_academic_year(p_event_id);
  -- HARDENING (audit 2026-07-06 #1): a NULL academic_year_id defeats BOTH the lifecycle
  -- gate (its LEFT JOIN never matches) and the rollover cron (its equijoin never matches),
  -- producing an immortal mentorship that never ends and never releases its freshers.
  -- Fail closed exactly like the sibling fn_induction_generate_monthly_checkins.
  IF v_ay IS NULL THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: could not resolve the induction''s academic year (set the college''s academic years / admission year first)';
  END IF;

  INSERT INTO public.induction_feedback_volunteers
    (event_id, learner_id, institution_id, capacity, is_active, appointed_by, academic_year_id)
  VALUES (p_event_id, p_learner_id, v_inst, LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200), true, auth.uid(), v_ay)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    is_active = true,
    capacity  = LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200),
    ended_at = NULL,
    ended_reason = NULL,
    academic_year_id = COALESCE(EXCLUDED.academic_year_id, public.induction_feedback_volunteers.academic_year_id),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid,uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid,uuid,integer) TO authenticated;

-- ===== #5: count_monthly_checkins must gate like every sibling read RPC =====
CREATE OR REPLACE FUNCTION public.fn_induction_count_monthly_checkins(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_count_monthly_checkins: not authorized';
  END IF;
  RETURN (SELECT count(*)::int FROM public.event_sessions
          WHERE event_id = p_event_id AND kind = 'mentor_checkin');
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_count_monthly_checkins(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_count_monthly_checkins(uuid) TO authenticated;

-- ===== #2: a mentor can read their OWN group's existing attendance for a session =====
CREATE OR REPLACE FUNCTION public.fn_induction_my_session_attendance(p_session_id uuid)
RETURNS TABLE(learner_id uuid, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_my_learner UUID; v_vol UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_session_attendance: not authenticated'; END IF;
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_my_session_attendance: session not found'; END IF;
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_my_session_attendance: not a learner'; END IF;
  SELECT v.id INTO v_vol FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_my_session_attendance: not an assigned Senior Peer Mentor for this induction'; END IF;

  RETURN QUERY
  SELECT a.learner_id, a.status::text
  FROM public.event_session_attendance a
  JOIN public.induction_feedback_volunteer_group grp
    ON grp.volunteer_id = v_vol AND grp.learner_id = a.learner_id
  WHERE a.session_id = p_session_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_session_attendance(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_session_attendance(uuid) TO authenticated;

-- ===== #3: is the current user a coordinator of ANY induction event? (module route-access) =====
-- Per-event authorization stays enforced server-side by can_manage_training on every RPC,
-- so letting a coordinator into the module UI leaks nothing.
CREATE OR REPLACE FUNCTION public.fn_induction_is_any_event_coordinator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.induction_event_coordinators WHERE user_id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_is_any_event_coordinator() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_any_event_coordinator() TO authenticated;
