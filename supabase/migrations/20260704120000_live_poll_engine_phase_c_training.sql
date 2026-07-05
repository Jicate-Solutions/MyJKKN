-- 20260704120000_live_poll_engine_phase_c_training.sql
-- Phase C of the Live Poll Engine generalization — the CDC-training and HR-training
-- contexts. Spec: specs/live-poll-engine-generalization-2026-07-04.md
--
-- Builds on Phase A (foundation + rewire) and Phase B (class_session). This migration
-- is ADDITIVE + BEHAVIOR-PRESERVING for the existing induction and class contexts:
-- every induction/class branch of a replaced function is copied byte-for-byte from the
-- LIVE prod definition (pulled with pg_get_functiondef before this was written); only
-- new CDC/HR branches and a polymorphic-answerer column are added.
--
-- ── How the two training contexts map onto the shared engine ─────────────────────
--   CDC training  (LEARNER-keyed — fits the engine as-is)
--     context_type = 'cdc_training_session'
--     context_id   = cdc_training_programmes.id          (the programme IS the anchor)
--     can_manage   = the programme's assigned trainer (staff.profile_id = auth.uid()
--                    for cdc_training_programmes.trainer_staff_id) OR a CDC admin
--                    (is_cdc_staff(), which already folds in super-admin) with access
--                    to the programme's institution — mirrors the programme table's own
--                    write RLS: is_cdc_staff() AND role_has_institution_access(inst).
--     can_answer   = a learner actively enrolled in cdc_training_enrollments (learner_id
--                    -> learners_profiles.id, same key the vote table uses). CDC trainees
--                    are learners, so they REUSE every learner-keyed answer RPC unchanged
--                    (get_for_answering / submit / question_totals_for_learner).
--
--   HR training   (STAFF-keyed — does NOT fit the learner-only vote table)
--     context_type = 'hr_training_session'
--     context_id   = hr_training_sessions.id
--     can_manage   = the session creator (created_by = auth.uid()) OR super/admin OR an
--                    HR editor (user_has_permission('hr.training.edit')) with institution
--                    access — mirrors hr_training_sessions' own UPDATE RLS.
--     can_answer   = a STAFF member (hr_training_enrollments.staff_id -> staff.id) with a
--                    live enrollment. HR trainees are STAFF, not learners.
--
-- ── Staff -> auth.uid() mapping (investigated 2026-07-04) ─────────────────────────
--   staff.profile_id -> profiles.id (= auth.uid()); 835/837 rows carry a profile_id,
--   all 837 carry an email. The canonical resolver mirrors the existing pattern used by
--   is_bos_chairman_of() etc.: JOIN staff s ON s.profile_id = auth.uid(). We add a
--   lower(email) fallback for the 2 staff without a profile_id. This is the FK target
--   for answerer_staff_id (staff.id), consistent with hr_training_enrollments.staff_id
--   and cdc_training_programmes.trainer_staff_id (both -> staff.id).
--
-- ── The HR polymorphic answerer (additive, proven zero-impact) ───────────────────
--   induction_session_poll_vote.learner_id is a hard FK to learners_profiles, so staff
--   cannot vote. We make learner_id NULLABLE, add answerer_staff_id (FK staff.id), and a
--   XOR CHECK so exactly one of (learner_id, answerer_staff_id) is set. All 2473 existing
--   rows have learner_id set + answerer_staff_id NULL, so the CHECK holds for every one
--   (asserted 0 violations in the dry-run). The induction unique key
--   UNIQUE(question_id, option_id, learner_id) is untouched; a parallel unique index on
--   (question_id, answerer_staff_id, option_id) provides the per-staff-per-question dedup
--   (NULL answerer_staff_id on every induction/class row is distinct under the index, so
--   it never collides — zero impact). HR has NO loop bridge (no session_feedback for
--   staff): staff votes are just recorded.
--
-- ── Verification (forced-rollback dry-run, DRYRUN_OK asserts) ─────────────────────
--   1. Whole migration compiles.
--   2. Induction answer-gate PARITY still holds: for every enrolled learner of every
--      existing induction poll, _fn_induction_learner_can_answer_poll ==
--      _fn_live_poll_learner_can_answer  -> 0 mismatches.
--   3. Existing votes satisfy the new XOR CHECK -> 0 violations.
--   4. The class bridge still writes session_feedback (Phase B sim, rolled back).
--   5. CDC create/open path runs against the one existing programme.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Polymorphic answerer on the vote table (additive).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll_vote ALTER COLUMN learner_id DROP NOT NULL;

ALTER TABLE public.induction_session_poll_vote
  ADD COLUMN IF NOT EXISTS answerer_staff_id uuid;

ALTER TABLE public.induction_session_poll_vote
  DROP CONSTRAINT IF EXISTS induction_session_poll_vote_answerer_staff_id_fkey;
ALTER TABLE public.induction_session_poll_vote
  ADD CONSTRAINT induction_session_poll_vote_answerer_staff_id_fkey
  FOREIGN KEY (answerer_staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- Exactly one answerer identity per vote (learner XOR staff). Existing rows all have
-- learner_id -> they satisfy this. `<>` on two booleans = XOR.
ALTER TABLE public.induction_session_poll_vote
  DROP CONSTRAINT IF EXISTS induction_session_poll_vote_one_answerer_chk;
ALTER TABLE public.induction_session_poll_vote
  ADD CONSTRAINT induction_session_poll_vote_one_answerer_chk
  CHECK ((learner_id IS NOT NULL) <> (answerer_staff_id IS NOT NULL));

-- Per-staff-per-question dedup, parallel to the induction UNIQUE(question_id,option_id,
-- learner_id). Non-partial: induction/class rows have answerer_staff_id NULL -> each such
-- tuple carries a NULL and is distinct, so this index never constrains them (zero impact).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ispv_staff
  ON public.induction_session_poll_vote (question_id, answerer_staff_id, option_id);
CREATE INDEX IF NOT EXISTS idx_ispv_poll_staff
  ON public.induction_session_poll_vote (poll_id, answerer_staff_id);

-- Per-context single-poll guards (parallel to Phase B's uq_live_poll_class_context).
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_poll_cdc_context
  ON public.induction_session_poll (context_id) WHERE context_type = 'cdc_training_session';
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_poll_hr_context
  ON public.induction_session_poll (context_id) WHERE context_type = 'hr_training_session';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Staff identity resolver: staff.id for the current auth.uid().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_live_poll_my_staff_id()
 RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id FROM public.staff s
  WHERE s.profile_id = (SELECT auth.uid())
     OR (s.profile_id IS NULL
         AND lower(s.email) = (SELECT lower(email) FROM public.profiles WHERE id = (SELECT auth.uid())))
  ORDER BY (s.profile_id = (SELECT auth.uid())) DESC NULLS LAST
  LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_my_staff_id() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_my_staff_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Dispatchers — add cdc_training_session + hr_training_session branches.
--    The induction_session + class_session branches are copied byte-for-byte from
--    the live prod definitions (Phase B).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_can_manage(p_context_type text, p_context_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_p public.scf_live_pulse;
        v_inst uuid; v_trainer uuid; v_creator uuid;
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
    WHEN 'cdc_training_session' THEN
      -- CDC programme is the anchor. Authority = the assigned trainer OR a CDC admin
      -- (is_cdc_staff() already folds in super-admin) with institution access. Mirrors
      -- cdc_training_programmes' write RLS (is_cdc_staff() AND role_has_institution_access).
      SELECT institution_id, trainer_staff_id INTO v_inst, v_trainer
        FROM public.cdc_training_programmes WHERE id = p_context_id;
      IF NOT FOUND THEN RETURN false; END IF;
      RETURN (v_trainer IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_trainer AND s.profile_id = auth.uid()))
          OR (public.is_cdc_staff() AND (v_inst IS NULL OR public.role_has_institution_access(v_inst)));
    WHEN 'hr_training_session' THEN
      -- HR session is the anchor. Authority mirrors hr_training_sessions' UPDATE RLS:
      -- the creator OR super/admin OR an HR editor with institution access.
      SELECT institution_id, created_by INTO v_inst, v_creator
        FROM public.hr_training_sessions WHERE id = p_context_id;
      IF NOT FOUND THEN RETURN false; END IF;
      RETURN (v_creator IS NOT NULL AND v_creator = auth.uid())
          OR public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('hr.training.edit')
              AND (v_inst IS NULL OR public.role_has_institution_access(v_inst)));
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
    WHEN 'cdc_training_session' THEN
      -- audience = a learner actively enrolled in the programme (p_learner = learners_profiles.id).
      RETURN EXISTS (SELECT 1 FROM public.cdc_training_enrollments e
                     WHERE e.programme_id = p_context_id AND e.learner_id = p_learner
                       AND e.status NOT IN ('dropped','cancelled'));
    WHEN 'hr_training_session' THEN
      -- audience = a STAFF member with a live enrollment. p_learner here is a staff.id
      -- (NOT a learner id) — HR trainees are staff. Excludes not-yet-approved / rejected
      -- / dropped enrollments.
      RETURN EXISTS (SELECT 1 FROM public.hr_training_enrollments e
                     WHERE e.session_id = p_context_id AND e.staff_id = p_learner
                       AND e.status NOT IN ('applied','rejected','dropped'));
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) TO authenticated;

-- Staff answer-gate wrapper (parallel to _fn_live_poll_learner_can_answer). Resolves the
-- poll's context + open state, then delegates the audience test to the dispatcher. Only
-- valid for the hr_training_session context (the only staff-keyed one).
CREATE OR REPLACE FUNCTION public._fn_live_poll_staff_can_answer(p_poll_id uuid, p_staff uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid;
BEGIN
  IF p_staff IS NULL THEN RETURN false; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid
  FROM public.induction_session_poll
  WHERE id = p_poll_id AND status = 'open' AND (auto_close_at IS NULL OR auto_close_at > now());
  IF v_cid IS NULL OR v_ctype <> 'hr_training_session' THEN RETURN false; END IF;
  RETURN public.fn_live_poll_can_answer(v_ctype, v_cid, p_staff);
END $function$;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_staff_can_answer(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_staff_can_answer(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Submit RPC — add the HR staff answerer path (early return); the induction +
--    class body below is byte-for-byte the Phase-B-verified live version.
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
  v_staff uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;

  -- ── HR TRAINING (STAFF ANSWERER) PATH ──────────────────────────────────────
  -- HR trainees are staff (no learner profile), so they cannot go through the
  -- learner gate below. Resolve the caller as a staff answerer and record votes
  -- keyed by answerer_staff_id. HR has NO loop bridge — votes only. Everything
  -- after this block is the induction/class code, byte-for-byte from Phase B.
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_ctype = 'hr_training_session' THEN
    v_staff := public._fn_live_poll_my_staff_id();
    IF v_staff IS NULL OR NOT public._fn_live_poll_staff_can_answer(p_poll_id, v_staff) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

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

        DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND answerer_staff_id = v_staff;
        INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, answerer_staff_id)
        VALUES (p_poll_id, v_qid, v_oid, v_staff)
        ON CONFLICT (question_id, answerer_staff_id, option_id) DO NOTHING;
        CONTINUE;
      END IF;

      SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
      FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

      IF v_kind IN ('single','scale') AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

      IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
                 WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
        RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

      DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND answerer_staff_id = v_staff;
      FOREACH v_oid IN ARRAY v_opts LOOP
        INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, answerer_staff_id)
        VALUES (p_poll_id, v_qid, v_oid, v_staff)
        ON CONFLICT (question_id, answerer_staff_id, option_id) DO NOTHING;
      END LOOP;
    END LOOP;
    RETURN;   -- HR has no loop bridge
  END IF;

  -- ── INDUCTION / CLASS PATH (byte-for-byte Phase B) ─────────────────────────
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
-- 5) Context-aware totals denominator + answerer-aware response counts. Induction
--    and class paths are behavior-identical (answerer_staff_id is NULL on every
--    induction/class vote, so coalesce(learner_id, answerer_staff_id) = learner_id).
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
  ELSIF v_p.context_type = 'cdc_training_session' THEN
    SELECT count(*)::int INTO v_enrolled FROM public.cdc_training_enrollments e
    WHERE e.programme_id = v_p.context_id AND e.status NOT IN ('dropped','cancelled');
  ELSIF v_p.context_type = 'hr_training_session' THEN
    SELECT count(*)::int INTO v_enrolled FROM public.hr_training_enrollments e
    WHERE e.session_id = v_p.context_id AND e.status NOT IN ('applied','rejected','dropped');
  ELSE
    SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
    SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
    WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);
  END IF;

  SELECT count(DISTINCT coalesce(learner_id, answerer_staff_id))::int INTO v_responses
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
      SELECT count(DISTINCT coalesce(v.learner_id, v.answerer_staff_id))::int AS cnt
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 6) CDC entry points (LEARNER-keyed). The programme id IS the context_id; there is
--    no separate anchor row. Answer/results reuse the shared learner-keyed RPCs
--    (get_for_answering / submit / question_totals_for_learner / totals / responders /
--    close / set_current), which route through the dispatcher CDC branch. Only CREATE
--    / OPEN / GET-by-programme / learner-DISCOVERY are CDC-specific.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_live_poll_upsert_cdc_poll(p_programme_id uuid, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid; v_kind text;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.cdc_training_programmes WHERE id = p_programme_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: no such programme'; END IF;
  IF NOT public.fn_live_poll_can_manage('cdc_training_session', p_programme_id) THEN
    RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (context_type, context_id, institution_id, created_by, status)
  VALUES ('cdc_training_session', p_programme_id, v_inst, auth.uid(), 'draft')
  ON CONFLICT (context_id) WHERE context_type = 'cdc_training_session'
    DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions,'[]'::jsonb)) LOOP
    v_kind := coalesce(q->>'kind','single');
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      IF EXISTS (SELECT 1 FROM public.induction_session_poll_vote WHERE question_id = v_qid)
         AND v_kind IS DISTINCT FROM (SELECT kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = v_poll_id) THEN
        RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: cannot change the kind of question % after it has votes', v_qid;
      END IF;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = v_kind, position = coalesce((q->>'position')::int,0),
          scale_min_label = nullif(q->>'scale_min_label',''), scale_max_label = nullif(q->>'scale_max_label','')
      WHERE id = v_qid AND poll_id = v_poll_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: question id % is not in this poll', v_qid; END IF;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position, scale_min_label, scale_max_label)
      VALUES (v_poll_id, q->>'prompt', v_kind, coalesce((q->>'position')::int,0),
              nullif(q->>'scale_min_label',''), nullif(q->>'scale_max_label',''))
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
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
        IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: option id % is not in this question', v_oid; END IF;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.induction_session_poll_option opt
               JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
               WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))) THEN
      RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.induction_session_poll_question qq
             JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
             WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))) THEN
    RAISE EXCEPTION 'fn_live_poll_upsert_cdc_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_upsert_cdc_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_upsert_cdc_poll(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_live_poll_open_cdc_poll(p_poll_id uuid)
 RETURNS public.induction_session_poll
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_open_cdc_poll: not authenticated'; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_cid IS NULL OR v_ctype <> 'cdc_training_session' THEN RAISE EXCEPTION 'fn_live_poll_open_cdc_poll: not a CDC poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN RAISE EXCEPTION 'fn_live_poll_open_cdc_poll: not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_live_poll_open_cdc_poll: add at least one question first'; END IF;

  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes',
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  RETURN v_row;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_open_cdc_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_open_cdc_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_live_poll_get_cdc_poll(p_programme_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_get_cdc_poll: not authenticated'; END IF;
  IF NOT public.fn_live_poll_can_manage('cdc_training_session', p_programme_id) THEN
    RAISE EXCEPTION 'fn_live_poll_get_cdc_poll: not authorized'; END IF;

  SELECT * INTO v_p FROM public.induction_session_poll
  WHERE context_type='cdc_training_session' AND context_id = p_programme_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'context_id', v_p.context_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_get_cdc_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_get_cdc_poll(uuid) TO authenticated;

-- Learner discovery: the open CDC poll for a programme the caller is enrolled in.
CREATE OR REPLACE FUNCTION public.fn_live_poll_cdc_poll_for_learner()
 RETURNS TABLE(poll_id uuid, context_id uuid, programme_id uuid, programme_name text,
               auto_close_at timestamptz, already_answered boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_cdc_poll_for_learner: not authenticated'; END IF;
  v_lp := get_my_learner_id();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.context_id, prog.id, prog.name, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_lp)
  FROM public.induction_session_poll p
  JOIN public.cdc_training_programmes prog ON prog.id = p.context_id
  WHERE p.context_type = 'cdc_training_session'
    AND p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND EXISTS (SELECT 1 FROM public.cdc_training_enrollments e
                WHERE e.programme_id = prog.id AND e.learner_id = v_lp AND e.status NOT IN ('dropped','cancelled'))
  ORDER BY p.issued_at DESC;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_cdc_poll_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_cdc_poll_for_learner() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7) HR entry points (STAFF-keyed). Host CREATE/OPEN/GET mirror the CDC ones; the
--    ANSWER side is staff-specific (get_for_answering / question_totals / responders /
--    discovery) because the shared learner RPCs resolve get_my_learner_id() (NULL for
--    staff). Host CLOSE / SET_CURRENT / TOTALS reuse the shared poll-keyed RPCs.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_live_poll_upsert_hr_poll(p_session_id uuid, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid; v_kind text;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.hr_training_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: no such session'; END IF;
  IF NOT public.fn_live_poll_can_manage('hr_training_session', p_session_id) THEN
    RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (context_type, context_id, institution_id, created_by, status)
  VALUES ('hr_training_session', p_session_id, v_inst, auth.uid(), 'draft')
  ON CONFLICT (context_id) WHERE context_type = 'hr_training_session'
    DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions,'[]'::jsonb)) LOOP
    v_kind := coalesce(q->>'kind','single');
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      IF EXISTS (SELECT 1 FROM public.induction_session_poll_vote WHERE question_id = v_qid)
         AND v_kind IS DISTINCT FROM (SELECT kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = v_poll_id) THEN
        RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: cannot change the kind of question % after it has votes', v_qid;
      END IF;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = v_kind, position = coalesce((q->>'position')::int,0),
          scale_min_label = nullif(q->>'scale_min_label',''), scale_max_label = nullif(q->>'scale_max_label','')
      WHERE id = v_qid AND poll_id = v_poll_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: question id % is not in this poll', v_qid; END IF;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position, scale_min_label, scale_max_label)
      VALUES (v_poll_id, q->>'prompt', v_kind, coalesce((q->>'position')::int,0),
              nullif(q->>'scale_min_label',''), nullif(q->>'scale_max_label',''))
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
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
        IF NOT FOUND THEN RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: option id % is not in this question', v_oid; END IF;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.induction_session_poll_option opt
               JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
               WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))) THEN
      RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.induction_session_poll_question qq
             JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
             WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))) THEN
    RAISE EXCEPTION 'fn_live_poll_upsert_hr_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_upsert_hr_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_upsert_hr_poll(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_live_poll_open_hr_poll(p_poll_id uuid)
 RETURNS public.induction_session_poll
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_open_hr_poll: not authenticated'; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_cid IS NULL OR v_ctype <> 'hr_training_session' THEN RAISE EXCEPTION 'fn_live_poll_open_hr_poll: not an HR poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN RAISE EXCEPTION 'fn_live_poll_open_hr_poll: not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_live_poll_open_hr_poll: add at least one question first'; END IF;

  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes',
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  RETURN v_row;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_open_hr_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_open_hr_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_live_poll_get_hr_poll(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_get_hr_poll: not authenticated'; END IF;
  IF NOT public.fn_live_poll_can_manage('hr_training_session', p_session_id) THEN
    RAISE EXCEPTION 'fn_live_poll_get_hr_poll: not authorized'; END IF;

  SELECT * INTO v_p FROM public.induction_session_poll
  WHERE context_type='hr_training_session' AND context_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'context_id', v_p.context_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_get_hr_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_get_hr_poll(uuid) TO authenticated;

-- Staff discovery: the open HR poll for a session the caller (staff) is enrolled in.
CREATE OR REPLACE FUNCTION public.fn_live_poll_hr_poll_for_staff()
 RETURNS TABLE(poll_id uuid, context_id uuid, session_id uuid, session_title text,
               auto_close_at timestamptz, already_answered boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_hr_poll_for_staff: not authenticated'; END IF;
  v_staff := public._fn_live_poll_my_staff_id();
  IF v_staff IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.context_id, s.id, s.title, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.answerer_staff_id = v_staff)
  FROM public.induction_session_poll p
  JOIN public.hr_training_sessions s ON s.id = p.context_id
  WHERE p.context_type = 'hr_training_session'
    AND p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND EXISTS (SELECT 1 FROM public.hr_training_enrollments e
                WHERE e.session_id = s.id AND e.staff_id = v_staff AND e.status NOT IN ('applied','rejected','dropped'))
  ORDER BY p.issued_at DESC;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_hr_poll_for_staff() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_hr_poll_for_staff() TO authenticated;

-- Staff answer surface (mirrors fn_induction_get_poll_for_answering, staff-keyed).
CREATE OR REPLACE FUNCTION public.fn_live_poll_hr_get_for_answering(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid; v_current uuid; v_question jsonb; v_mine jsonb; v_index int; v_total int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_hr_get_for_answering: not authenticated'; END IF;
  v_staff := public._fn_live_poll_my_staff_id();
  IF v_staff IS NULL OR NOT public._fn_live_poll_staff_can_answer(p_poll_id, v_staff) THEN
    RAISE EXCEPTION 'fn_live_poll_hr_get_for_answering: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  SELECT count(*)::int INTO v_total FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  IF v_current IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
             'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
             'options', CASE WHEN q.kind = 'wordcloud'
                          THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                                FROM public.induction_session_poll_option o
                                WHERE o.question_id = q.id
                                  AND EXISTS (SELECT 1 FROM public.induction_session_poll_vote v
                                              WHERE v.question_id = q.id AND v.option_id = o.id AND v.answerer_staff_id = v_staff))
                          ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                                FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
                        END),
           (SELECT count(*)::int FROM public.induction_session_poll_question q2
             WHERE q2.poll_id = p_poll_id AND q2.position <= q.position)
    INTO v_question, v_index
    FROM public.induction_session_poll_question q WHERE q.id = v_current AND q.poll_id = p_poll_id;
  END IF;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote
    WHERE poll_id = p_poll_id AND answerer_staff_id = v_staff AND question_id = v_current
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id,
    'questions', CASE WHEN v_question IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_question) END,
    'my_answers', v_mine,
    'current_question_id', v_current, 'question_index', v_index, 'question_total', v_total);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_hr_get_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_hr_get_for_answering(uuid) TO authenticated;

-- Staff live per-question totals (mirrors fn_induction_poll_question_totals_for_learner).
CREATE OR REPLACE FUNCTION public.fn_live_poll_hr_question_totals_for_staff(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid; v_current uuid; v_responders int; v_options jsonb; v_prompt text; v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_hr_question_totals_for_staff: not authenticated'; END IF;
  v_staff := public._fn_live_poll_my_staff_id();
  IF v_staff IS NULL OR NOT public._fn_live_poll_staff_can_answer(p_poll_id, v_staff) THEN
    RAISE EXCEPTION 'fn_live_poll_hr_question_totals_for_staff: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_current IS NULL THEN RETURN NULL; END IF;

  SELECT q.prompt, q.kind INTO v_prompt, v_kind FROM public.induction_session_poll_question q WHERE q.id = v_current;
  SELECT count(DISTINCT v.answerer_staff_id)::int INTO v_responders
  FROM public.induction_session_poll_vote v WHERE v.question_id = v_current;

  IF v_kind = 'wordcloud' THEN
    v_options := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'label', o.label,
             'count', CASE WHEN v_responders >= 3
                           THEN (SELECT count(*) FROM public.induction_session_poll_vote v
                                  WHERE v.question_id = v_current AND v.option_id = o.id)
                           ELSE NULL END
           ) ORDER BY o.position),'[]'::jsonb)
    INTO v_options FROM public.induction_session_poll_option o WHERE o.question_id = v_current;
  END IF;

  RETURN jsonb_build_object('question_id', v_current, 'prompt', v_prompt,
    'response_count', v_responders, 'suppressed', v_responders < 3, 'options', v_options);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_hr_question_totals_for_staff(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_hr_question_totals_for_staff(uuid) TO authenticated;

-- Staff responders for the host (mirrors fn_induction_session_poll_responders, staff-keyed).
CREATE OR REPLACE FUNCTION public.fn_live_poll_hr_responders(p_poll_id uuid)
 RETURNS TABLE(staff_id uuid, staff_code text, staff_name text, questions_answered bigint, answered_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_hr_responders: not authenticated'; END IF;
  SELECT p.context_type, p.context_id INTO v_ctype, v_cid FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_cid IS NULL OR v_ctype <> 'hr_training_session' OR NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN
    RAISE EXCEPTION 'fn_live_poll_hr_responders: not allowed'; END IF;

  RETURN QUERY
  SELECT v.answerer_staff_id,
         s.staff_id::text,
         trim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,''))::text,
         count(DISTINCT v.question_id),
         max(v.created_at)
  FROM public.induction_session_poll_vote v
  JOIN public.staff s ON s.id = v.answerer_staff_id
  WHERE v.poll_id = p_poll_id AND v.answerer_staff_id IS NOT NULL
  GROUP BY v.answerer_staff_id, s.staff_id, s.first_name, s.last_name
  ORDER BY max(v.created_at) DESC;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_hr_responders(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_hr_responders(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
