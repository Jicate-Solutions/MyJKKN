-- Migration: 2026-07-06 — Curriculum-aware class poll, Phase-1 follow-up fixes (3a–3d)
-- Scope: READ / lifecycle curriculum functions ONLY. The live WRITE path
--   (fn_live_poll_upsert_class_poll + fn_induction_submit_poll_response) is NOT touched.
-- 3a: fn_induction_session_poll_totals — hold the affective Fink question (loop_role='fink')
--     at the NORMAL anonymity floor (k>=3) even in a small class; only NON-affective aggregate
--     counts soften to the small-class floor. Refines decision #34.
-- 3b: fn_curriculum_lesson_upsert (CREATE only) — plain teaching staff (faculty/school_faculty/
--     staff) must actually TEACH p_course_id (appear as the period's assigned_faculty in
--     student_attendance) before authoring its lesson spine; privileged roles (HOD/principal/
--     dean/coordinator/admin/super) keep the department-seed override. Closes the direct-API
--     spine-pollution gap. EDIT path (creator-only #33 + override) unchanged.
-- 3c: fn_curriculum_lessons_for_course — suggest-next position falls back to the last NON-NULL
--     sequence_no among the caller's own links, so a recent off-plan/typed topic (NULL seq)
--     does not reset the position and re-suggest lesson #1.
-- 3d: fn_bos_clos_for_course — ORDER BY b.updated_at referenced a column that does not exist on
--     bos_course_syllabi, so EVERY faculty call 500'd at plan time (found via impersonation on
--     2026-07-06). Order by COALESCE(last_modified_at, created_at) instead.

-- ============================================================================
-- 3a — fn_induction_session_poll_totals: Fink question holds at k>=3 in small classes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_roster int; v_questions jsonb; v_anchor public.scf_live_pulse; v_floor int := 3;
  v_normal_floor int := 3;   -- 3a: floor for affective (Fink) questions; never softens below k>=3
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
    -- v_enrolled = Present (the display denominator). v_roster = the FULL period roster
    -- (every student in the blob, any status) — a STABLE size that classifies "small"
    -- so a large class with few present mid-marking is NOT misclassified small and
    -- revealed at k=2 (deep-review 🟠 2026-07-05). Floor is keyed on the roster.
    SELECT count(*) FILTER (WHERE st ->> 'status' = 'Present')::int, count(*)::int
      INTO v_enrolled, v_roster
    FROM public.student_attendance sa,
         jsonb_array_elements(COALESCE(sa.attendance_data -> v_anchor.period_id -> 'students','[]'::jsonb)) st
    WHERE sa.timetable_id = v_anchor.timetable_id AND sa.attendance_date = v_anchor.attendance_date
      AND sa.attendance_data ? v_anchor.period_id;
    v_floor := public._fn_live_poll_reveal_floor(v_roster);   -- #34: tunable (default 3), by roster
    -- 3a: the affective Fink question always uses the NORMAL floor. _fn_live_poll_reveal_floor(NULL)
    -- classifies as non-small (roster NULL is not BETWEEN 1 AND small_max) → returns k>=3.
    v_normal_floor := public._fn_live_poll_reveal_floor(NULL);
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
          -- reveal floor (spec #20 + tunable #34): gate each question on ITS OWN distinct
          -- responder count (q_resp.cnt), NOT the poll-wide count — otherwise a sparsely
          -- answered question (e.g. only 1 learner answered the Fink Q2) rides over the
          -- floor on other questions' responders and exposes a lone count=1 below the
          -- anonymity floor (deep-review 🔴 2026-07-05). Normal classes keep k≥3; small
          -- classes reveal at the configured floor. Wordcloud keeps its own per-word gate.
          -- 3a (2026-07-06): the affective Fink question (loop_role='fink') holds at the
          -- NORMAL floor (v_normal_floor, k>=3) even in a small class — sentiment is more
          -- re-identifying than a comprehension count, so it never softens to k=2.
          'count', CASE WHEN v_p.context_type = 'class_session'
                          AND q_resp.cnt < (CASE WHEN q.loop_role = 'fink' THEN v_normal_floor ELSE v_floor END)
                          AND q.kind <> 'wordcloud' THEN NULL ELSE oc.cnt END
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o
          CROSS JOIN LATERAL (SELECT count(*)::int AS cnt
                              FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) oc
          WHERE o.question_id = q.id
            AND (q.kind <> 'wordcloud'
                 OR oc.cnt >= CASE WHEN v_p.context_type = 'class_session'
                                     THEN (CASE WHEN q.loop_role = 'fink' THEN v_normal_floor ELSE v_floor END)
                                     ELSE 3 END))
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
    'suppressed', (v_p.context_type = 'class_session' AND v_responses < v_floor),
    'questions', v_questions);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

-- ============================================================================
-- 3b — fn_curriculum_lesson_upsert: CREATE requires the caller TEACH the course
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_upsert(p_lesson_id uuid, p_course_id uuid, p_title text, p_unit_label text DEFAULT NULL::text, p_sequence_no integer DEFAULT NULL::integer, p_learning_outcomes jsonb DEFAULT '[]'::jsonb, p_primary_fink text DEFAULT NULL::text, p_co_refs text[] DEFAULT '{}'::text[], p_bos_syllabus_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_creator uuid; v_lesson_inst uuid; v_role_ok boolean; v_role text;
        v_email text; v_staff_id uuid; v_priv_create boolean; v_teaches boolean; v_existing uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: not authenticated'; END IF;
  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: title required'; END IF;

  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such course'; END IF;

  SELECT p.role, lower(btrim(p.email)),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
          OR p.is_super_admin = true)
    INTO v_role, v_email, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();

  IF p_lesson_id IS NULL THEN
    -- CREATE: only staff who TEACH this course may author its (published-on-create #31,
    -- self-approved) lesson. A teaching role + role_has_institution_access is NOT enough —
    -- that let ANY teaching staff in the institution inject published lessons into ANY
    -- course's shared spine (spine-pollution; direct-API gap with no UI path, deep-review
    -- 🟠 2026-07-05, Director-approved fix 2026-07-06). Plain faculty/staff must have TAUGHT
    -- p_course_id — appear as a period's assigned_faculty in student_attendance, the same
    -- teaching evidence the class poll (fn_live_poll_can_manage / _fn_curriculum_class_ctx)
    -- authorises on. Privileged roles (HOD/principal/dean/coordinator/admin/system_admin,
    -- super) keep the department-seed override — they legitimately manage the dept spine.
    -- CREATE authorization, cheapest-branch-first so the teaching-evidence jsonb scan
    -- runs ONLY for plain faculty — super-admin and privileged (dept-seed) roles
    -- authorize without paying for it.
    v_priv_create := public.is_super_admin()
                     OR v_role = ANY (ARRAY['hod','principal','dean','coordinator',
                                            'institution_admin','administrator','system_admin']);
    IF public.is_super_admin()
       OR (v_priv_create AND public.role_has_institution_access(v_inst)) THEN
      NULL;  -- authorized via the department-seed override; no teaching scan needed
    ELSIF v_role = ANY (ARRAY['faculty','school_faculty','staff'])
          AND public.role_has_institution_access(v_inst) THEN
      -- Plain teaching staff must actually TEACH this course. Match PRIMARILY on the
      -- stable staff id (blob assigned_faculty.faculty_id = staff.id, 100% populated),
      -- NOT the email string — a NULL profile email or casing/whitespace drift in the
      -- blob (real rows carry e.g. 'Senthil.m@jkkn.ac.in') would make an email equality
      -- NULL and SILENTLY lock out a genuinely-teaching faculty (deep-review 3-lens
      -- consensus 2026-07-06). The btrim+lower email is a NULL-guarded FALLBACK for the
      -- rare row missing a staff link. EXISTS short-circuits on the first matching
      -- period; this institution-scoped scan runs only here, on the low-frequency CREATE
      -- path, and only when a non-teacher is being (correctly) rejected.
      SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
      v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
        SELECT 1
        FROM public.student_attendance sa
        CROSS JOIN LATERAL jsonb_each(
          CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
        ) AS pd(period_id, pv)
        -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
        -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
        -- periods). Normalize both shapes to a set of faculty elements so a co-teacher is
        -- NOT false-blocked from authoring (deep-review LOW 2026-07-06, confirmed vs prod:
        -- 3,876 of 19,937 periods store the array form).
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE jsonb_typeof(pv -> 'assigned_faculty')
            WHEN 'array'  THEN pv -> 'assigned_faculty'
            WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
            ELSE '[]'::jsonb END
        ) AS fac
        WHERE sa.institution_id = v_inst
          AND pv ->> 'course_id' = p_course_id::text
          AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
                OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
      );
      IF NOT v_teaches THEN
        RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only staff who teach this course (or an HOD/admin of its institution) can create its lesson';
      END IF;
    ELSE
      RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only staff who teach this course (or an HOD/admin of its institution) can create its lesson';
    END IF;
    -- Idempotent on (course, creator, title): a link-after-create retry that failed, or
    -- the teacher re-typing the same topic, REUSES the existing published lesson rather
    -- than minting a duplicate that pollutes the my-topics reuse list (deep-review 🟡).
    SELECT id INTO v_existing FROM public.curriculum_lesson
    WHERE course_id = p_course_id AND created_by = auth.uid()
      AND source = 'faculty' AND status = 'published'
      AND lower(title) = lower(btrim(p_title))
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      -- CREATE-ONCE semantics (intentional): re-typing an existing published title REUSES
      -- that lesson (never duplicates the title in the reuse list) and only refreshes the
      -- primary Fink dimension. outcomes / co_refs / unit / sequence are deliberately NOT
      -- overwritten here — those params default to '[]' / '{}' (not NULL), so a COALESCE
      -- update would WIPE them whenever the caller passed only a title (deep-review 🟡 flagged
      -- the drop; a naive "COALESCE all" is the more dangerous fix). To revise a lesson's
      -- content, EDIT it (pass p_lesson_id) — the EDIT branch patches each provided field.
      UPDATE public.curriculum_lesson
      SET primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension), updated_at = now()
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
    -- The unique index uq_curriculum_lesson_faculty_topic is the race backstop: if a
    -- concurrent double-submit slipped past the SELECT above, one INSERT wins and the
    -- loser reuses the winner's row instead of erroring or duplicating.
    BEGIN
      INSERT INTO public.curriculum_lesson
        (institution_id, course_id, sequence_no, unit_label, title, learning_outcomes,
         primary_fink_dimension, co_refs, source, status, bos_syllabus_id,
         created_by, approved_by, approved_at)
      VALUES
        (v_inst, p_course_id, p_sequence_no, p_unit_label, btrim(p_title),
         COALESCE(p_learning_outcomes,'[]'::jsonb), p_primary_fink, COALESCE(p_co_refs,'{}'),
         'faculty', 'published', p_bos_syllabus_id, auth.uid(), auth.uid(), now())
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_id FROM public.curriculum_lesson
      WHERE course_id = p_course_id AND created_by = auth.uid()
        AND source = 'faculty' AND status = 'published'
        AND lower(title) = lower(btrim(p_title))
      LIMIT 1;
    END;
    RETURN v_id;
  END IF;

  -- EDIT: creator-only (#33), HOD/admin override. Authority is bound to the TARGET
  -- lesson's OWN institution, NEVER the caller-supplied p_course_id — otherwise an HOD
  -- of institution A could edit institution B's lesson by pairing their own course id
  -- with a foreign lesson id (cross-tenant break; deep-review 🔴 2026-07-05).
  SELECT created_by, institution_id INTO v_creator, v_lesson_inst
  FROM public.curriculum_lesson WHERE id = p_lesson_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such lesson'; END IF;
  IF NOT (v_creator = auth.uid()
          OR public.is_super_admin()
          OR (COALESCE(v_role_ok,false) AND public.role_has_institution_access(v_lesson_inst))) THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only the lesson creator or an HOD/admin of its institution can edit it';
  END IF;

  -- A rename that collides with the creator's own published topic in this course would
  -- otherwise raise a raw uq_curriculum_lesson_faculty_topic error (deep-review 🟡).
  -- Patch-style: an unspecified (NULL) param PRESERVES the current value, so a title-only
  -- edit doesn't silently wipe learning_outcomes / co_refs / fink / unit / sequence
  -- (deep-review 🟠 2026-07-05: the old full-replace was destructive for #33 edits).
  BEGIN
    UPDATE public.curriculum_lesson
    SET title = btrim(p_title),
        unit_label = COALESCE(p_unit_label, unit_label),
        sequence_no = COALESCE(p_sequence_no, sequence_no),
        learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
        primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
        co_refs = COALESCE(p_co_refs, co_refs),
        bos_syllabus_id = COALESCE(p_bos_syllabus_id, bos_syllabus_id),
        updated_at = now()
    WHERE id = p_lesson_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: you already have a published topic with that title in this course';
  END;
  RETURN p_lesson_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid,uuid,text,text,integer,jsonb,text,text[],uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid,uuid,text,text,integer,jsonb,text,text[],uuid) TO authenticated;

-- ============================================================================
-- 3c — fn_curriculum_lessons_for_course: suggest-next ignores NULL-seq (typed) topics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_curriculum_lessons_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_lessons jsonb; v_last_seq int; v_next uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lessons_for_course: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lessons_for_course: no such course'; END IF;
  -- Non-student gate: this DEFINER RPC bypasses the table RLS, so a student could
  -- otherwise enumerate the whole published spine via supabase.rpc — the exact learner
  -- browsing the RLS + present-gate prevent. Learners see topics only through the
  -- present-gated fn_curriculum_topic_for_learner (deep-review 🔴 2026-07-05).
  IF NOT (public.is_super_admin()
          OR (public.role_has_institution_access(v_inst)
              AND (SELECT public.get_current_user_role()) <> 'student')) THEN
    RAISE EXCEPTION 'fn_curriculum_lessons_for_course: not available to this role';
  END IF;

  -- per-teacher position: the caller's most-recent link that carries a REAL sequence.
  -- 3c (2026-07-06): typed / off-plan topics have NULL sequence_no; without the NOT NULL
  -- filter, a recent off-plan topic would set v_last_seq = NULL, reset COALESCE(...,-1) to
  -- -1, and re-suggest lesson #1 — losing the caller's true position on the sequenced spine.
  SELECT l.sequence_no INTO v_last_seq
  FROM public.class_session_lesson csl
  JOIN public.curriculum_lesson l ON l.id = csl.lesson_id
  WHERE l.course_id = p_course_id AND csl.linked_by = auth.uid()
    AND l.sequence_no IS NOT NULL
  ORDER BY csl.linked_at DESC LIMIT 1;

  SELECT id INTO v_next FROM public.curriculum_lesson
  WHERE course_id = p_course_id AND status = 'published'
    AND sequence_no IS NOT NULL AND sequence_no > COALESCE(v_last_seq, -1)
  ORDER BY sequence_no ASC LIMIT 1;

  SELECT COALESCE(jsonb_agg(t.obj ORDER BY t.seq_no NULLS LAST, t.created_at), '[]'::jsonb)
    INTO v_lessons
  FROM (
    SELECT jsonb_build_object(
             'id', l.id, 'title', l.title, 'unit_label', l.unit_label, 'sequence_no', l.sequence_no,
             'primary_fink_dimension', l.primary_fink_dimension, 'status', l.status,
             'source', l.source, 'co_refs', l.co_refs) AS obj,
           l.sequence_no AS seq_no, l.created_at
    FROM public.curriculum_lesson l
    WHERE l.course_id = p_course_id
      AND (l.status = 'published' OR l.created_by = auth.uid())
      AND l.status <> 'archived'
    ORDER BY l.sequence_no NULLS LAST, l.created_at
    LIMIT 300   -- defensive cap; a course spine is naturally far smaller (deep-review 🟡)
  ) t;

  RETURN jsonb_build_object('course_id', p_course_id, 'suggested_next_lesson_id', v_next,
                            'lessons', v_lessons);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lessons_for_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lessons_for_course(uuid) TO authenticated;

-- ============================================================================
-- 3d — fn_bos_clos_for_course: ORDER BY updated_at (nonexistent col) 500'd every faculty call
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_bos_clos_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_code text; v_inst uuid; v_clos jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_bos_clos_for_course: not authenticated'; END IF;
  SELECT course_code, institution_id INTO v_code, v_inst FROM public.courses WHERE id = p_course_id;
  IF v_code IS NULL OR v_inst IS NULL THEN RETURN '[]'::jsonb; END IF;
  -- Tenant + role gate: CLOs are institution-scoped, STAFF-facing academic content.
  -- This DEFINER RPC bypasses the table RLS, so the non-student guard the RLS enforces
  -- must be repeated here or students could read CLOs via supabase.rpc (deep-review
  -- 🟠 2026-07-05; the RLS fix alone doesn't cover the RPC path).
  IF NOT (public.is_super_admin()
          OR (public.role_has_institution_access(v_inst)
              AND (SELECT public.get_current_user_role()) <> 'student')) THEN
    RAISE EXCEPTION 'fn_bos_clos_for_course: not available to this role';
  END IF;

  -- Institution-scoped: match the syllabus by BOTH course_code AND institutions_id.
  -- course_code ALONE is shared across tenants (e.g. 24EVS01A exists in two colleges),
  -- so a code-only match would return another institution's CLOs to this caller
  -- (deep-review 🔴 2026-07-05). institutions_id is 100% populated on latest syllabi.
  -- 3d (2026-07-06): bos_course_syllabi has NO updated_at column — the old ORDER BY
  -- b.updated_at 500'd at plan time on EVERY faculty call (students hit the role gate
  -- first, so it was masked). Order by the real last-touch column instead.
  SELECT COALESCE(b.course_learning_outcomes -> 'clos', '[]'::jsonb) INTO v_clos
  FROM public.bos_course_syllabi b
  WHERE b.course_code = v_code AND b.institutions_id = v_inst
    AND b.is_latest AND NOT b.is_archived
    AND b.course_learning_outcomes ? 'clos'
  ORDER BY COALESCE(b.last_modified_at, b.created_at) DESC NULLS LAST
  LIMIT 1;

  RETURN COALESCE(v_clos, '[]'::jsonb);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_bos_clos_for_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bos_clos_for_course(uuid) TO authenticated;
