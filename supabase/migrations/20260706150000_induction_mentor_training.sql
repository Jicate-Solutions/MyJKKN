-- 20260706150000_induction_mentor_training.sql
-- Senior Peer Mentor — P2b: training program + STRICT gate.
--
-- Four training mechanisms (Director: "all four", "every step required"):
--   guide (read) · self-'I understand' (ack) · admin 'Trained' mark · training session.
-- is_trained := guide_read_at AND self_ack_at AND admin_trained_at (ALL required).
-- A training SESSION is the admin's batch tool: marking attendance sets admin_trained
-- for the attendees. Manual per-mentor "Mark trained" covers exceptions.
--
-- GATE (Director: "sees group but attendance + feedback locked until trained"):
-- the two mentor WRITE RPCs (submit_feedback, mark_attendance) RAISE until is_trained.
-- The READ RPCs (my_volunteer_sessions, my_feedback_group) are untouched, so an
-- untrained mentor still SEES their group.
--
-- Grandfather note: this induction currently has 0 mentors, so no existing mentor is
-- retroactively locked. New mentors go through training from appointment.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Training-state columns + is_trained (strict, all steps).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_feedback_volunteers
  ADD COLUMN IF NOT EXISTS guide_read_at    timestamptz,
  ADD COLUMN IF NOT EXISTS self_ack_at      timestamptz,
  ADD COLUMN IF NOT EXISTS admin_trained_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_trained_by uuid;

ALTER TABLE public.induction_feedback_volunteers
  ADD COLUMN IF NOT EXISTS is_trained boolean
  GENERATED ALWAYS AS (guide_read_at IS NOT NULL AND self_ack_at IS NOT NULL AND admin_trained_at IS NOT NULL) STORED;

COMMENT ON COLUMN public.induction_feedback_volunteers.is_trained IS
  'STRICT: true only when guide read + self-ack + admin-mark are ALL set. The mentor write RPCs (attendance/feedback) require this; read RPCs do not (an untrained mentor still SEES their group).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Training session table (the 4th mechanism). Writes flow through DEFINER RPCs;
--    RLS allows managers a direct read only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.induction_mentor_training_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  title          text NOT NULL,
  scheduled_at   timestamptz,
  venue          text,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.induction_mentor_training_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS imts_select ON public.induction_mentor_training_sessions;
CREATE POLICY imts_select ON public.induction_mentor_training_sessions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id))
);

-- shared authority helper: may this caller manage training for the event?
CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_training(p_event_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RETURN false; END IF;
  RETURN is_super_admin() OR is_admin()
      OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
      OR public.fn_induction_is_event_coordinator(p_event_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_training(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_manage_training(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Mentor self-training: read the guide + tap "I understand" (sets both).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_mentor_complete_self_training(p_event_id uuid)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_learner uuid; v_vol uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'complete_self_training: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'complete_self_training: not a learner'; END IF;
  SELECT id INTO v_vol FROM public.induction_feedback_volunteers
   WHERE event_id = p_event_id AND learner_id = v_learner AND is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'complete_self_training: not an assigned Senior Peer Mentor for this induction'; END IF;
  UPDATE public.induction_feedback_volunteers
     SET guide_read_at = COALESCE(guide_read_at, now()),
         self_ack_at   = COALESCE(self_ack_at, now()),
         updated_at    = now()
   WHERE id = v_vol;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mentor_complete_self_training(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mentor_complete_self_training(uuid) TO authenticated;

-- mentor reads their own per-event training status (drives the UI lock/unlock).
CREATE OR REPLACE FUNCTION public.fn_induction_my_training_status()
 RETURNS TABLE(event_id uuid, guide_read boolean, self_ack boolean, admin_trained boolean, is_trained boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'my_training_status: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT v.event_id, v.guide_read_at IS NOT NULL, v.self_ack_at IS NOT NULL,
           v.admin_trained_at IS NOT NULL, v.is_trained
    FROM public.induction_feedback_volunteers v
    WHERE v.learner_id = v_learner AND v.is_active;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_training_status() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_training_status() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Admin: mark a mentor trained/untrained; list mentors + their training state.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_admin_set_mentor_trained(p_event_id uuid, p_learner_id uuid, p_trained boolean)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'set_mentor_trained: not authorized';
  END IF;
  UPDATE public.induction_feedback_volunteers
     SET admin_trained_at = CASE WHEN p_trained THEN COALESCE(admin_trained_at, now()) ELSE NULL END,
         admin_trained_by = CASE WHEN p_trained THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE event_id = p_event_id AND learner_id = p_learner_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_admin_set_mentor_trained(uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_admin_set_mentor_trained(uuid, uuid, boolean) TO authenticated;

-- extend the admin roster read with training columns (drop+create: signature grows).
DROP FUNCTION IF EXISTS public.fn_induction_list_feedback_volunteers(uuid);
CREATE OR REPLACE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id uuid)
 RETURNS TABLE(learner_id uuid, full_name text, register_number text, capacity int, is_active boolean,
               group_size int, captured int,
               guide_read boolean, self_ack boolean, admin_trained boolean, is_trained boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
           (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
              JOIN public.event_session_feedback f ON f.learner_id = g.learner_id AND f.event_id = v.event_id
             WHERE g.volunteer_id = v.id),
           v.guide_read_at IS NOT NULL, v.self_ack_at IS NOT NULL, v.admin_trained_at IS NOT NULL, v.is_trained
    FROM public.induction_feedback_volunteers v
    JOIN public.learners_profiles lp ON lp.id = v.learner_id
    WHERE v.event_id = p_event_id
    ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Training sessions (create / list / mark attendance → trained).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_create_training_session(p_event_id uuid, p_title text, p_scheduled_at timestamptz DEFAULT NULL, p_venue text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid; v_id uuid;
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'create_training_session: not authorized';
  END IF;
  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'create_training_session: title required'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  INSERT INTO public.induction_mentor_training_sessions (event_id, institution_id, title, scheduled_at, venue)
  VALUES (p_event_id, v_inst, btrim(p_title), p_scheduled_at, NULLIF(btrim(coalesce(p_venue,'')),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_create_training_session(uuid, text, timestamptz, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_training_session(uuid, text, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_list_training_sessions(p_event_id uuid)
 RETURNS TABLE(id uuid, title text, scheduled_at timestamptz, venue text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'list_training_sessions: not authorized';
  END IF;
  RETURN QUERY
    SELECT s.id, s.title, s.scheduled_at, s.venue
    FROM public.induction_mentor_training_sessions s
    WHERE s.event_id = p_event_id ORDER BY s.scheduled_at NULLS LAST, s.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_training_sessions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_training_sessions(uuid) TO authenticated;

-- marking a mentor as having ATTENDED a training session sets admin_trained for them
-- (the "session" path to the admin-mark step). Batch, scoped to the session's event.
CREATE OR REPLACE FUNCTION public.fn_induction_training_mark_attended(p_session_id uuid, p_learner_ids uuid[])
 RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event uuid; v_n int;
BEGIN
  SELECT event_id INTO v_event FROM public.induction_mentor_training_sessions WHERE id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'training_mark_attended: session not found'; END IF;
  IF NOT public.fn_induction_can_manage_training(v_event) THEN
    RAISE EXCEPTION 'training_mark_attended: not authorized';
  END IF;
  UPDATE public.induction_feedback_volunteers v
     SET admin_trained_at = COALESCE(v.admin_trained_at, now()),
         admin_trained_by = auth.uid(), updated_at = now()
   WHERE v.event_id = v_event AND v.learner_id = ANY(p_learner_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_training_mark_attended(uuid, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_training_mark_attended(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
