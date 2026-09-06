-- 20260704110000_live_poll_engine_phase_b_class_session.sql
-- Phase B of the Live Poll Engine generalization — the class_session context.
-- Spec: specs/live-poll-engine-generalization-2026-07-04.md
-- Director decision (2026-07-04): FULL flexible builder for classes + BRIDGE the
-- loop-relevant answers back into session_feedback so the live SCF loop keeps being
-- fed (escalation #1623 / carry-forward #1624 / self-improving #1625 unchanged).
--
-- ── How the class context maps onto the shared engine ───────────────────────────
--   context_type = 'class_session'
--   context_id   = scf_live_pulse.id   (the EXISTING #1626 class anchor: it already
--                  holds timetable_id / attendance_date / period_id / institution /
--                  faculty_email / lifecycle — so no new lookup table is needed)
--   can_manage   = the class's assigned faculty OR an HOD/admin with institution
--                  access  (mirrors fn_scf_open_pulse's authority exactly)
--   can_answer   = a learner marked PRESENT in that class's attendance blob
--                  (mirrors #1626's present-gate exactly — stricter than "section
--                  students", and it keeps the display and the loop consistent)
--
-- ── The loop bridge (the whole point of the Director's choice) ───────────────────
-- The rich engine records every answer as a vote in induction_session_poll_vote.
-- For class polls we ALSO feed the loop: three questions are tagged with a loop_role
-- so the bridge knows what each maps to —
--     loop_role='understood' : a 1..5 scale question   -> session_feedback.understood
--     loop_role='free_text'  : a wordcloud/text question-> session_feedback.free_text
--     loop_role='checklist'  : a multi question whose options carry option_key
--                              (= session_feedback_checklist_config.item_key)
--                                                        -> session_feedback.checklist
-- After a learner submits, the bridge reconstructs their FULL current state from
-- their votes and calls fn_scf_submit_feedback(...,'live_poll') — the loop's ONLY
-- write path — so it inherits the present-gate, the latest-wins (student,date,period)
-- dedup, and the full downstream loop. The loop feed is understood-gated: nothing is
-- written until the learner has rated understanding (understood is NOT NULL there).
-- Extra facilitator questions (loop_role NULL) are display-only; they never touch
-- session_feedback. INDUCTION behavior is untouched — every induction branch below
-- is byte-for-byte the Phase-A-verified version; only additive class branches are new.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Schema: allow non-induction polls; tag loop roles + checklist option keys.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.induction_session_poll ALTER COLUMN event_id   DROP NOT NULL;

ALTER TABLE public.induction_session_poll_question
  ADD COLUMN IF NOT EXISTS loop_role text;
ALTER TABLE public.induction_session_poll_question
  DROP CONSTRAINT IF EXISTS induction_session_poll_question_loop_role_chk;
ALTER TABLE public.induction_session_poll_question
  ADD CONSTRAINT induction_session_poll_question_loop_role_chk
  CHECK (loop_role IS NULL OR loop_role IN ('understood','free_text','checklist'));

ALTER TABLE public.induction_session_poll_option
  ADD COLUMN IF NOT EXISTS option_key text;

-- One class poll per class anchor (multiple NULL session_ids are allowed by the
-- existing UNIQUE(session_id), so we need a separate guard for the class context).
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_poll_class_context
  ON public.induction_session_poll (context_id)
  WHERE context_type = 'class_session';

-- Refine the context trigger: only induction backfills context_id from session_id.
CREATE OR REPLACE FUNCTION public.fn_live_poll_set_context()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.context_type IS NULL THEN NEW.context_type := 'induction_session'; END IF;
  IF NEW.context_id IS NULL AND NEW.context_type = 'induction_session' THEN
    NEW.context_id := NEW.session_id;
  END IF;
  RETURN NEW;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Dispatchers — add the class_session branch (induction branch unchanged).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_can_manage(p_context_type text, p_context_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_p public.scf_live_pulse;
BEGIN
  IF auth.uid() IS NULL OR p_context_id IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      RETURN public._fn_induction_can_manage_session_pulse(p_context_id);
    WHEN 'class_session' THEN
      -- class anchor = scf_live_pulse row; authority mirrors fn_scf_open_pulse:
      -- the assigned faculty OR a privileged role WITH access to the institution.
      SELECT * INTO v_p FROM public.scf_live_pulse WHERE id = p_context_id;
      IF v_p.id IS NULL THEN RETURN false; END IF;
      SELECT lower(pr.email),
             (pr.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
              OR pr.is_super_admin = true)
        INTO v_email, v_role_ok
      FROM public.profiles pr WHERE pr.id = auth.uid();
      IF v_email IS NULL THEN RETURN false; END IF;
      RETURN (lower(v_p.faculty_email) IS NOT DISTINCT FROM v_email)
          OR (COALESCE(v_role_ok,false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_p.institution_id)));
    -- 'cdc_training_session' -> Phase C (trainer)
    -- 'hr_training_session'  -> Phase C (trainer)
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_live_poll_can_answer(p_context_type text, p_context_id uuid, p_learner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p public.scf_live_pulse;
BEGIN
  IF p_context_id IS NULL OR p_learner IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.event_sessions es
        JOIN public.induction_enrollment ie ON ie.event_id = es.event_id AND ie.learner_id = p_learner
        WHERE es.id = p_context_id
          AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id));
    WHEN 'class_session' THEN
      -- present-gate: the learner must be marked Present in the anchor's class.
      SELECT * INTO v_p FROM public.scf_live_pulse WHERE id = p_context_id;
      IF v_p.id IS NULL THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.student_attendance sa,
             jsonb_array_elements(COALESCE(sa.attendance_data -> v_p.period_id -> 'students','[]'::jsonb)) st
        WHERE sa.timetable_id = v_p.timetable_id
          AND sa.attendance_date = v_p.attendance_date
          AND sa.attendance_data ? v_p.period_id
          AND (st ->> 'student_id')::uuid = p_learner
          AND st ->> 'status' = 'Present');
    -- 'cdc_training_session' -> Phase C (cdc_training_enrollments)
    -- 'hr_training_session'  -> Phase C (hr_training_enrollments)
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Class entry points. The generic poll-keyed RPCs (close/set_current/totals/
--    responders/submit/get_for_answering) already route through the dispatchers
--    (Phase A), so they work for class polls once the branch above exists. Only
--    the CREATE, OPEN and learner-DISCOVERY paths are class-specific.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a) Ensure the class anchor exists (idempotent, authorized) and return its id.
CREATE OR REPLACE FUNCTION public._fn_live_poll_ensure_class_anchor(
  p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_pv jsonb; v_inst uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
          OR p.is_super_admin = true)
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no such session'; END IF;

  IF NOT ((lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS NOT DISTINCT FROM v_email)
          OR (COALESCE(v_role_ok,false) AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: only the assigned faculty or an HOD/admin of this institution';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));
  SELECT id INTO v_id FROM public.scf_live_pulse
  WHERE timetable_id = p_timetable_id AND attendance_date = p_attendance_date AND period_id = p_period_id
  ORDER BY issued_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.scf_live_pulse (institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by)
  VALUES (v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name', v_pv -> 'assigned_faculty' ->> 'faculty_email',
    false, now(), now() + interval '240 minutes', auth.uid())   -- anchor only; not open yet
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date, uuid, text) TO authenticated;

-- 3b) Upsert the class poll structure (draft). Mirrors fn_induction_upsert_session_poll's
--     question/option handling, plus loop_role + option_key. Idempotent on the anchor.
CREATE OR REPLACE FUNCTION public.fn_live_poll_upsert_class_poll(
  p_attendance_date date, p_timetable_id uuid, p_period_id text, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid; v_kind text; v_role text;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  v_anchor := public._fn_live_poll_ensure_class_anchor(p_attendance_date, p_timetable_id, p_period_id);
  SELECT institution_id INTO v_inst FROM public.scf_live_pulse WHERE id = v_anchor;

  INSERT INTO public.induction_session_poll (context_type, context_id, institution_id, created_by, status)
  VALUES ('class_session', v_anchor, v_inst, auth.uid(), 'draft')
  ON CONFLICT (context_id) WHERE context_type = 'class_session'
    DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions,'[]'::jsonb)) LOOP
    v_kind := coalesce(q->>'kind','single');
    v_role := nullif(q->>'loop_role','');
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      IF EXISTS (SELECT 1 FROM public.induction_session_poll_vote WHERE question_id = v_qid)
         AND v_kind IS DISTINCT FROM (SELECT kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = v_poll_id) THEN
        RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: cannot change the kind of question % after it has votes', v_qid;
      END IF;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = v_kind, position = coalesce((q->>'position')::int,0),
          scale_min_label = nullif(q->>'scale_min_label',''), scale_max_label = nullif(q->>'scale_max_label',''),
          loop_role = v_role
      WHERE id = v_qid AND poll_id = v_poll_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: question id % is not in this poll', v_qid; END IF;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position, scale_min_label, scale_max_label, loop_role)
      VALUES (v_poll_id, q->>'prompt', v_kind, coalesce((q->>'position')::int,0),
              nullif(q->>'scale_min_label',''), nullif(q->>'scale_max_label',''), v_role)
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    IF v_kind = 'wordcloud' THEN
      DELETE FROM public.induction_session_poll_option o
       WHERE o.question_id = v_qid
         AND NOT EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.option_id = o.id);
      CONTINUE;
    END IF;

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0), option_key = nullif(o->>'option_key','')
        WHERE id = v_oid AND question_id = v_qid;
        IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: option id % is not in this question', v_oid; END IF;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position, option_key)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0), nullif(o->>'option_key',''))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.induction_session_poll_option opt
               JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
               WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))) THEN
      RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));

    -- The understood question feeds session_feedback.understood via a
    -- label -> smallint(1..5) parse at submit time. Enforce it HERE so a
    -- misconfigured scale fails LOUDLY for the teacher at save time, rather than
    -- silently dropping the whole SCF loop feed when a learner votes.
    IF v_role = 'understood' THEN
      IF v_kind <> 'scale' THEN
        RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: the understood question must be a 1-5 scale';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.induction_session_poll_option opt
        WHERE opt.question_id = v_qid
          AND coalesce(nullif(regexp_replace(opt.label, '\D', '', 'g'), '')::int, 0) NOT BETWEEN 1 AND 5
      ) THEN
        RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: every understood scale option must map to 1..5';
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.induction_session_poll_question qq
             JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
             WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))) THEN
    RAISE EXCEPTION 'fn_live_poll_upsert_class_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_upsert_class_poll(date, uuid, text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_upsert_class_poll(date, uuid, text, jsonb) TO authenticated;

-- 3c) Open the class poll: poll -> open AND sync the anchor pulse is_open (so the
--     bridge's honest source label + learner discovery see it as live).
CREATE OR REPLACE FUNCTION public.fn_live_poll_open_class_poll(p_poll_id uuid)
 RETURNS public.induction_session_poll
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not authenticated'; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_cid IS NULL OR v_ctype <> 'class_session' THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not a class poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_live_poll_open_class_poll: add at least one question first'; END IF;

  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes',
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;

  UPDATE public.scf_live_pulse SET is_open=true, issued_at=now(), auto_close_at = now() + interval '240 minutes', updated_at=now()
  WHERE id = v_cid;

  RETURN v_row;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_open_class_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_open_class_poll(uuid) TO authenticated;

-- 3d) Get the class poll structure for the host builder (by class grain).
CREATE OR REPLACE FUNCTION public.fn_live_poll_get_class_poll(
  p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_anchor uuid; v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_get_class_poll: not authenticated'; END IF;
  SELECT id INTO v_anchor FROM public.scf_live_pulse
  WHERE timetable_id = p_timetable_id AND attendance_date = p_attendance_date AND period_id = p_period_id
  ORDER BY issued_at DESC LIMIT 1;
  IF v_anchor IS NULL THEN RETURN NULL; END IF;         -- no anchor yet -> no poll
  IF NOT public.fn_live_poll_can_manage('class_session', v_anchor) THEN
    RAISE EXCEPTION 'fn_live_poll_get_class_poll: not authorized'; END IF;

  SELECT * INTO v_p FROM public.induction_session_poll
  WHERE context_type='class_session' AND context_id = v_anchor;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position, 'loop_role', q.loop_role,
           'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position,'option_key',o.option_key) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'context_id', v_p.context_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_get_class_poll(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_get_class_poll(date, uuid, text) TO authenticated;

-- 3e) Learner discovery: the open class poll for a session the caller is Present in.
CREATE OR REPLACE FUNCTION public.fn_live_poll_class_poll_for_learner()
 RETURNS TABLE(poll_id uuid, context_id uuid, timetable_id uuid, attendance_date date, period_id text,
               course_code text, course_name text, auto_close_at timestamptz, already_answered boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_class_poll_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.context_id, a.timetable_id, a.attendance_date, a.period_id,
         a.course_code, a.course_name, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_lp)
  FROM public.induction_session_poll p
  JOIN public.scf_live_pulse a ON a.id = p.context_id
  WHERE p.context_type = 'class_session'
    AND p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND EXISTS (
      SELECT 1 FROM public.student_attendance sa,
           jsonb_array_elements(COALESCE(sa.attendance_data -> a.period_id -> 'students','[]'::jsonb)) st
      WHERE sa.timetable_id = a.timetable_id AND sa.attendance_date = a.attendance_date
        AND sa.attendance_data ? a.period_id
        AND (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present')
  ORDER BY p.issued_at DESC;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_class_poll_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_class_poll_for_learner() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) The BRIDGE — extend the generic submit RPC so a class answer also feeds the
--    SCF loop. Induction path is byte-for-byte the Phase-A version; the ONLY change
--    is: resolve context up front, and after votes are written, if class_session,
--    reconstruct the learner's full loop state from their votes and call
--    fn_scf_submit_feedback (the loop's only write path).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid; a jsonb; v_qid uuid; v_kind text; v_opts uuid[]; v_oid uuid; v_word text;
  v_ctype text; v_cid uuid;
  v_understood smallint; v_free_text text; v_checklist jsonb;
  v_cdate date; v_ctt uuid; v_cperiod text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_live_poll_learner_can_answer(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) LOOP
    v_qid := (a->>'question_id')::uuid;
    SELECT kind INTO v_kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = p_poll_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: question not in poll'; END IF;

    IF v_kind = 'wordcloud' THEN
      v_word := left(btrim(regexp_replace(coalesce(a->>'text',''), '\s+', ' ', 'g')), 40);
      IF v_word = '' THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: empty word'; END IF;

      INSERT INTO public.induction_session_poll_option AS opt (question_id, label, position, is_wordcloud)
      VALUES (v_qid, v_word, (SELECT count(*) FROM public.induction_session_poll_option WHERE question_id = v_qid), true)
      ON CONFLICT (question_id, lower(label)) WHERE is_wordcloud
        DO UPDATE SET label = opt.label
      RETURNING opt.id INTO v_oid;

      DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner)
      ON CONFLICT (question_id, learner_id, option_id) DO NOTHING;
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
    FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

    IF v_kind IN ('single','scale') AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

    IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
               WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

    DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
    FOREACH v_oid IN ARRAY v_opts LOOP
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner)
      ON CONFLICT (question_id, learner_id, option_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ── CLASS BRIDGE ──────────────────────────────────────────────────────────
  -- Feed the SCF loop from the learner's current votes. Understood-gated: nothing
  -- is written until they've rated understanding (fn_scf_submit_feedback requires
  -- understood 1..5). Full-state each time -> latest-wins, no field is clobbered.
  IF v_ctype = 'class_session' THEN
    SELECT nullif(regexp_replace(o.label, '\D', '', 'g'), '')::smallint INTO v_understood
    FROM public.induction_session_poll_question q
    JOIN public.induction_session_poll_vote v ON v.question_id = q.id AND v.learner_id = v_learner
    JOIN public.induction_session_poll_option o ON o.id = v.option_id
    WHERE q.poll_id = p_poll_id AND q.loop_role = 'understood'
    LIMIT 1;

    IF v_understood IS NOT NULL AND v_understood BETWEEN 1 AND 5 THEN
      SELECT o.label INTO v_free_text
      FROM public.induction_session_poll_question q
      JOIN public.induction_session_poll_vote v ON v.question_id = q.id AND v.learner_id = v_learner
      JOIN public.induction_session_poll_option o ON o.id = v.option_id
      WHERE q.poll_id = p_poll_id AND q.loop_role = 'free_text'
      LIMIT 1;

      SELECT coalesce(jsonb_object_agg(o.option_key, true) FILTER (WHERE o.option_key IS NOT NULL), '{}'::jsonb)
        INTO v_checklist
      FROM public.induction_session_poll_question q
      JOIN public.induction_session_poll_vote v ON v.question_id = q.id AND v.learner_id = v_learner
      JOIN public.induction_session_poll_option o ON o.id = v.option_id
      WHERE q.poll_id = p_poll_id AND q.loop_role = 'checklist';

      SELECT lp.attendance_date, lp.timetable_id, lp.period_id INTO v_cdate, v_ctt, v_cperiod
      FROM public.scf_live_pulse lp WHERE lp.id = v_cid;

      IF v_ctt IS NOT NULL THEN
        -- Isolate the loop-bridge write: a failure here must NOT roll back the
        -- learner's already-recorded poll votes (vote persistence is independent
        -- of loop-write success). Surface the failure as a warning instead.
        BEGIN
          PERFORM public.fn_scf_submit_feedback(
            v_cdate, v_ctt, v_cperiod, v_understood,
            coalesce(v_checklist, '{}'::jsonb), v_free_text, 'live_poll');
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'class poll loop bridge failed (votes kept): %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Context-aware totals denominator. Induction path unchanged (enrolled_count
--    from induction_enrollment); class path uses the present_count from attendance.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_questions jsonb; v_anchor public.scf_live_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: no such poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_p.context_type, v_p.context_id) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_totals: not authorized'; END IF;

  IF v_p.status = 'open' AND v_p.auto_close_at IS NOT NULL AND v_p.auto_close_at < now() THEN
    UPDATE public.induction_session_poll SET status='closed', updated_at=now() WHERE id = v_p.id;
    v_p.status := 'closed';
    IF v_p.context_type = 'class_session' THEN
      UPDATE public.scf_live_pulse SET is_open=false, updated_at=now() WHERE id = v_p.context_id;
    END IF;
  END IF;

  IF v_p.context_type = 'class_session' THEN
    SELECT * INTO v_anchor FROM public.scf_live_pulse WHERE id = v_p.context_id;
    SELECT count(*)::int INTO v_enrolled
    FROM public.student_attendance sa,
         jsonb_array_elements(COALESCE(sa.attendance_data -> v_anchor.period_id -> 'students','[]'::jsonb)) st
    WHERE sa.timetable_id = v_anchor.timetable_id AND sa.attendance_date = v_anchor.attendance_date
      AND sa.attendance_data ? v_anchor.period_id AND st ->> 'status' = 'Present';
  ELSE
    SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
    SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
    WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);
  END IF;

  SELECT count(DISTINCT learner_id)::int INTO v_responses
  FROM public.induction_session_poll_vote WHERE poll_id = v_p.id;

  SELECT coalesce(jsonb_agg(qx.obj ORDER BY qx.position),'[]'::jsonb) INTO v_questions FROM (
    SELECT q.position,
      jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
        'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
        'response_count', q_resp.cnt,
        'options', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label,
            -- k>=3 anonymity floor (spec #20): in a CLASS poll with <3 distinct
            -- responders, never ship per-option counts — they de-anonymize students
            -- to the teacher at low N. Wordcloud keeps its own per-option >=3 gate.
            'count', CASE WHEN v_p.context_type = 'class_session' AND v_responses < 3
                            AND q.kind <> 'wordcloud' THEN NULL ELSE oc.cnt END
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o
          CROSS JOIN LATERAL (SELECT count(*)::int AS cnt
                              FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) oc
          WHERE o.question_id = q.id
            AND (q.kind <> 'wordcloud' OR oc.cnt >= 3))
      ) AS obj
    FROM public.induction_session_poll_question q
    CROSS JOIN LATERAL (
      SELECT count(DISTINCT v.learner_id)::int AS cnt
      FROM public.induction_session_poll_vote v WHERE v.question_id = q.id
    ) q_resp
    WHERE q.poll_id = v_p.id
  ) qx;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses,
    'suppressed', (v_p.context_type = 'class_session' AND v_responses < 3),
    'questions', v_questions);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
