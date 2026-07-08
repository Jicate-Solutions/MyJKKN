-- Migration: 20260710150000_fix_induction_mentor_captured_count.sql
-- Fix the mentor-roster "captured" count in fn_induction_list_feedback_volunteers.
-- It counted event_session_feedback JOIN rows (one per session × fresher), so a
-- fresher who rated many sessions was counted many times → nonsensical badges like
-- "188/22 captured". Now it counts DISTINCT freshers with >=1 feedback for the
-- event, so captured <= group_size (e.g. 16/22). Only the captured subquery
-- changed; every other line is preserved from the live definition.

CREATE OR REPLACE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id uuid)
 RETURNS TABLE(learner_id uuid, full_name text, register_number text, capacity integer, is_active boolean, group_size integer, captured integer, guide_read boolean, self_ack boolean, admin_trained boolean, is_trained boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'list_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'list_feedback_volunteers: not authorized';
  END IF;
  RETURN QUERY
    SELECT v.learner_id,
           btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
           lp.register_number::text,
           v.capacity, v.is_active,
           (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g WHERE g.volunteer_id = v.id),
           (SELECT count(DISTINCT g.learner_id)::int FROM public.induction_feedback_volunteer_group g
             WHERE g.volunteer_id = v.id
               AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                           WHERE f.learner_id = g.learner_id AND f.event_id = v.event_id)),
           v.guide_read_at IS NOT NULL, v.self_ack_at IS NOT NULL, v.admin_trained_at IS NOT NULL, v.is_trained
    FROM public.induction_feedback_volunteers v
    JOIN public.learners_profiles lp ON lp.id = v.learner_id
    WHERE v.event_id = p_event_id
    ORDER BY 2;
END $function$

;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) TO authenticated;
