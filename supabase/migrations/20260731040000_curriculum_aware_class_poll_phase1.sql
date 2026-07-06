-- 20260731040000_curriculum_aware_class_poll_phase1.sql
-- Curriculum-aware class poll — Phase 1: the lesson spine, the session→lesson link,
-- the BoS CLO connector, and the poll-wire seam. NO AI, NO PDE (Phase 2/3 later).
-- Spec: specs/curriculum-aware-lesson-plan-2026-07-04.md (37 locked decisions).
--
-- ── What this does (and, just as important, what it does NOT touch) ──────────────
-- The shipped class Live Poll (#1775) seeds GENERIC questions — it knows the course
-- (from the attendance blob) but not WHICH TOPIC was taught. Phase 1 closes that:
--   • a light per-course lesson spine  (curriculum_lesson)
--   • a (timetable,date,period)→lesson link  (class_session_lesson), keyed EXACTLY
--     like the class anchor scf_live_pulse, so merged classes (#22) inherit for free
--   • a BoS CLO connector by course_code (fn_bos_clos_for_course) — the ~13% path
--   • a READ seam (fn_curriculum_class_poll_seed) the CLIENT calls to pre-fill Q1
--     (understanding, names the topic) + Q2 (one rotating Fink dimension). No link or
--     a draft lesson → the client falls back to the unchanged generic poll (#13).
--
-- CRITICAL R5 discipline: the live poll WRITE path stays byte-for-byte untouched.
--   fn_live_poll_upsert_class_poll (the persister) and fn_induction_submit_poll_response
--   (the submit + SCF bridge) are NOT modified here. Curriculum questions are just more
--   entries in the client's p_questions[] — the bridge reads only loop_role IN
--   ('understood','free_text','checklist'), so the new Q2 (loop_role='fink') records
--   its votes normally and is IGNORED by the bridge (INERT — decision #21).
--   The only live functions touched are READ/LIFECYCLE:
--     • fn_induction_session_poll_totals + _responders → #34 tunable reveal floor
--       (normal classes stay k≥3; small classes reveal at a CONFIG value, default 2)
--     • fn_live_poll_open_class_poll → #37 close at 21:00 IST (was fixed 240 min)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Widen the loop_role CHECK so the rotating Fink question (Q2) can be a LOCKED
--    curriculum question. The submit bridge only reacts to understood/free_text/
--    checklist, so 'fink' records votes but feeds nothing (INERT, decision #21).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll_question
  DROP CONSTRAINT IF EXISTS induction_session_poll_question_loop_role_chk;
ALTER TABLE public.induction_session_poll_question
  ADD CONSTRAINT induction_session_poll_question_loop_role_chk
  CHECK (loop_role IS NULL OR loop_role IN ('understood','free_text','checklist','fink'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) The lesson spine — the ordered, per-course teaching plan. Light on purpose
--    (do NOT overload vac_lessons, which is VAC-track/week-hour-keyed and heavy).
--    Authority is by STATUS, not source: a 'published' lesson's outcomes count;
--    'draft' never counts or reaches students (draft = AI-only, Phase 2).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.curriculum_lesson (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid NOT NULL,
  course_id              uuid NOT NULL,                 -- the TAUGHT course row (not the code)
  sequence_no            int,                           -- order within the course spine
  unit_label             text,                          -- e.g. 'Unit 2'
  title                  text NOT NULL,                 -- the topic, shown to students
  -- Fink-first jsonb: [{ text, fink_dimension, bloom_level, co_ref, ltl_phase }]
  learning_outcomes      jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_fink_dimension text
     CHECK (primary_fink_dimension IS NULL OR primary_fink_dimension IN
            ('foundational','application','integration','human','caring','learning_to_learn')),
  co_refs                text[] NOT NULL DEFAULT '{}',  -- BoS clo_numbers this lesson maps to
  source                 text NOT NULL DEFAULT 'faculty'
     CHECK (source IN ('bos_ai','faculty','title_ai')),
  status                 text NOT NULL DEFAULT 'draft'
     CHECK (status IN ('draft','published','archived')),
  gemini_prompt          text,                          -- Phase-2 provenance (AI drafts)
  bos_syllabus_id        uuid,                          -- set when grounded in a BoS syllabus
  created_by             uuid NOT NULL DEFAULT auth.uid(),
  approved_by            uuid,
  approved_at            timestamptz,
  -- one source of truth (status); is_published is a derived mirror so neither can drift
  is_published           boolean GENERATED ALWAYS AS (status = 'published') STORED,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_course_seq
  ON public.curriculum_lesson (course_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_course_status
  ON public.curriculum_lesson (course_id, status);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_creator
  ON public.curriculum_lesson (created_by);
-- A faculty member's published topics are unique by title per course. This both powers
-- idempotent typed-topic creation AND makes a concurrent double-submit (two tabs/devices)
-- fail at the DB instead of minting duplicate published lessons (deep-review 🟠 2026-07-05).
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_lesson_faculty_topic
  ON public.curriculum_lesson (course_id, created_by, lower(title))
  WHERE source = 'faculty' AND status = 'published';

ALTER TABLE public.curriculum_lesson ENABLE ROW LEVEL SECURITY;

-- Direct SELECT: published lessons (shared plan #10) to non-student staff with
-- institution access, plus a creator seeing their own drafts. STUDENTS are excluded
-- from direct table reads — they see only their present-gated topics via the DEFINER
-- RPC fn_curriculum_topic_for_learner (which bypasses RLS), so the whole published
-- catalogue isn't browsable by any learner (deep-review 🟠 2026-07-05). WRITES have NO
-- direct policy → they flow ONLY through the SECURITY DEFINER RPCs below (creator-only
-- edit #33 + HOD override). institution_id is NOT NULL, so role_has_institution_access
-- is never called with NULL (avoids the NULL-institution PII-leak pattern).
DROP POLICY IF EXISTS curriculum_lesson_select ON public.curriculum_lesson;
CREATE POLICY curriculum_lesson_select ON public.curriculum_lesson
FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR created_by = auth.uid()
  OR (status = 'published'
      AND public.role_has_institution_access(institution_id)
      AND (SELECT public.get_current_user_role()) <> 'student')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) The session→lesson link — keyed EXACTLY like the class anchor. Re-linkable
--    at any time (#29); because votes are poll-keyed and the topic is a separate
--    link, correcting the link moves the displayed topic WITHOUT touching answers
--    (#30 — natural behaviour, no migration code). Access is RPC-only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_session_lesson (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id    uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id       text NOT NULL,                        -- text, matches scf_live_pulse.period_id
  course_id       uuid,                                 -- the taught course (from the blob)
  lesson_id       uuid NOT NULL REFERENCES public.curriculum_lesson(id) ON DELETE CASCADE,
  linked_by       uuid NOT NULL DEFAULT auth.uid(),
  linked_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, attendance_date, period_id)     -- one topic per class anchor
);
CREATE INDEX IF NOT EXISTS idx_class_session_lesson_lesson ON public.class_session_lesson (lesson_id);
CREATE INDEX IF NOT EXISTS idx_class_session_lesson_linkedby ON public.class_session_lesson (linked_by);

-- RLS ON with NO permissive policies: direct access is denied for everyone; the
-- SECURITY DEFINER RPCs (function owner) bypass RLS and are the ONLY read/write path.
ALTER TABLE public.class_session_lesson ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Class-context helper — resolve (institution, course, faculty) from the
--    attendance blob and (optionally) enforce class-manage authority. Mirrors
--    _fn_live_poll_ensure_class_anchor's authority exactly (assigned faculty OR an
--    HOD/admin WITH institution access). Used by link + seed. NOT anchor-dependent,
--    so a topic can be set BEFORE the poll is ever opened.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_curriculum_class_ctx(
  p_timetable_id uuid, p_attendance_date date, p_period_id text, p_require_manage boolean)
 RETURNS TABLE(institution_id uuid, course_id uuid, course_code text, course_name text, faculty_email text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_pv jsonb; v_inst uuid; v_fac text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: not authenticated'; END IF;
  SELECT sa.institution_id, sa.attendance_data -> p_period_id INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: no such session'; END IF;
  v_fac := lower(v_pv -> 'assigned_faculty' ->> 'faculty_email');

  IF p_require_manage THEN
    SELECT lower(p.email),
           (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
            OR p.is_super_admin = true)
      INTO v_email, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();
    IF v_email IS NULL THEN RAISE EXCEPTION '_fn_curriculum_class_ctx: no profile'; END IF;
    IF NOT ((v_fac IS NOT DISTINCT FROM v_email)
            OR (COALESCE(v_role_ok,false) AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
      RAISE EXCEPTION '_fn_curriculum_class_ctx: only the assigned faculty or an HOD/admin of this institution';
    END IF;
  END IF;

  RETURN QUERY SELECT v_inst, nullif(v_pv ->> 'course_id','')::uuid,
                      v_pv ->> 'course_code', v_pv ->> 'course_name', v_fac;
END $function$;
REVOKE EXECUTE ON FUNCTION public._fn_curriculum_class_ctx(uuid, date, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_curriculum_class_ctx(uuid, date, text, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) BoS CLO connector — the latest non-archived syllabus's CLOs, joined BY
--    course_code (course_id column on bos_course_syllabi is dead). Returns [] for
--    the ~87% of courses with no BoS syllabus (caller degrades gracefully). This
--    is the read path Phase 2's generator will ground on; in Phase 1 it lets the
--    faculty SEE the approved outcomes when they set a topic.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bos_clos_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  SELECT COALESCE(b.course_learning_outcomes -> 'clos', '[]'::jsonb) INTO v_clos
  FROM public.bos_course_syllabi b
  WHERE b.course_code = v_code AND b.institutions_id = v_inst
    AND b.is_latest AND NOT b.is_archived
    AND b.course_learning_outcomes ? 'clos'
  ORDER BY b.updated_at DESC NULLS LAST
  LIMIT 1;

  RETURN COALESCE(v_clos, '[]'::jsonb);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_bos_clos_for_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bos_clos_for_course(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Create / edit a lesson. Phase-1 faculty lessons are PUBLISHED-ON-CREATE (#31)
--    — the teacher is author AND authority for their own hand-written lesson (the
--    draft→approve gate is AI-only, Phase 2). A typed one-line topic is just the
--    minimal case (title + course). Edits: creator-only (#33) + HOD/admin override.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_upsert(
  p_lesson_id uuid,
  p_course_id uuid,
  p_title text,
  p_unit_label text DEFAULT NULL,
  p_sequence_no int DEFAULT NULL,
  p_learning_outcomes jsonb DEFAULT '[]'::jsonb,
  p_primary_fink text DEFAULT NULL,
  p_co_refs text[] DEFAULT '{}',
  p_bos_syllabus_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_creator uuid; v_lesson_inst uuid; v_role_ok boolean; v_role text; v_existing uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: not authenticated'; END IF;
  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: title required'; END IF;

  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such course'; END IF;

  SELECT p.role,
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
          OR p.is_super_admin = true)
    INTO v_role, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();

  IF p_lesson_id IS NULL THEN
    -- CREATE: only TEACHING staff may author a lesson (published-on-create #31,
    -- self-approved). role_has_institution_access alone is NOT enough — LEARNERS also
    -- have institution access and would otherwise inject published lessons into the
    -- shared course spine (deep-review 🟠 2026-07-05). Requiring a teaching role
    -- excludes role='student' (and other non-teaching roles).
    IF NOT (public.is_super_admin()
            OR (v_role = ANY (ARRAY['faculty','school_faculty','staff','hod','principal','dean',
                                    'coordinator','institution_admin','administrator','system_admin'])
                AND public.role_has_institution_access(v_inst))) THEN
      RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only teaching staff can create a lesson';
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
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid, uuid, text, text, int, jsonb, text, text[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid, uuid, text, text, int, jsonb, text, text[], uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Link (or re-link) a class session to a lesson. Authority = class-manage
--    (assigned faculty OR HOD/admin). Re-linkable at ANY time (#29); ON CONFLICT
--    re-points the topic without touching votes (#30). The lesson must belong to
--    the taught course.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_link_lesson(
  p_timetable_id uuid, p_attendance_date date, p_period_id text, p_lesson_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_course uuid; v_code text; v_name text; v_fac text;
        v_lesson_course uuid; v_lesson_inst uuid; v_lesson_creator uuid; v_id uuid;
BEGIN
  SELECT institution_id, course_id, course_code, course_name, faculty_email
    INTO v_inst, v_course, v_code, v_name, v_fac
  FROM public._fn_curriculum_class_ctx(p_timetable_id, p_attendance_date, p_period_id, true);

  SELECT course_id, institution_id, created_by INTO v_lesson_course, v_lesson_inst, v_lesson_creator
  FROM public.curriculum_lesson WHERE id = p_lesson_id;
  IF v_lesson_course IS NULL THEN RAISE EXCEPTION 'fn_curriculum_link_lesson: no such lesson'; END IF;
  -- Tenant guard (ALWAYS): the lesson must belong to this class's institution — this
  -- also closes the null-course path where the course-match guard below is skipped
  -- (deep-review 🟠 2026-07-05).
  IF v_lesson_inst IS DISTINCT FROM v_inst THEN
    RAISE EXCEPTION 'fn_curriculum_link_lesson: lesson belongs to a different institution than this class';
  END IF;
  IF v_course IS NOT NULL AND v_lesson_course IS DISTINCT FROM v_course THEN
    RAISE EXCEPTION 'fn_curriculum_link_lesson: lesson belongs to a different course than this class';
  END IF;
  -- When the class carries no course_id we can't verify subject-match, so restrict to the
  -- caller's OWN lessons — a manager can't attach an unrelated same-institution lesson of
  -- a different subject (deep-review 🟡 2026-07-05).
  IF v_course IS NULL AND v_lesson_creator IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'fn_curriculum_link_lesson: this class has no course on record — you can only link a topic you created';
  END IF;

  INSERT INTO public.class_session_lesson
    (timetable_id, attendance_date, period_id, course_id, lesson_id, linked_by, linked_at)
  VALUES (p_timetable_id, p_attendance_date, p_period_id, v_course, p_lesson_id, auth.uid(), now())
  ON CONFLICT (timetable_id, attendance_date, period_id)
    DO UPDATE SET lesson_id = EXCLUDED.lesson_id, course_id = EXCLUDED.course_id,
                  linked_by = EXCLUDED.linked_by, linked_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_link_lesson(uuid, date, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_link_lesson(uuid, date, text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) The spine for a course (published, shared plan #10) + the caller's own drafts,
--    with a PER-TEACHER suggest-next marker (#36): the next published lesson after
--    the caller's most-recently-linked lesson in this course.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_lessons_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

  -- per-teacher position: sequence_no of the caller's most-recent link in this course
  SELECT l.sequence_no INTO v_last_seq
  FROM public.class_session_lesson csl
  JOIN public.curriculum_lesson l ON l.id = csl.lesson_id
  WHERE l.course_id = p_course_id AND csl.linked_by = auth.uid()
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) The caller's own past typed topics for a course (#32) — the pick-list that
--    keeps the ~87% no-syllabus classes from re-typing, and quietly builds a
--    teaching history for them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_my_topics_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_topics jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_my_topics_for_course: not authenticated'; END IF;
  SELECT COALESCE(jsonb_agg(t.obj ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_topics
  FROM (
    SELECT jsonb_build_object('id', id, 'title', title,
             'primary_fink_dimension', primary_fink_dimension, 'created_at', created_at) AS obj,
           created_at
    FROM public.curriculum_lesson
    WHERE course_id = p_course_id AND created_by = auth.uid()
      AND source = 'faculty' AND status = 'published'
    ORDER BY created_at DESC
    LIMIT 50   -- most-recent 50 topics for the reuse dropdown (deep-review 🟡)
  ) t;
  RETURN COALESCE(v_topics, '[]'::jsonb);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_my_topics_for_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_my_topics_for_course(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) THE POLL-WIRE SEAM. The client calls this when building the class poll. If a
--    PUBLISHED lesson is linked to (timetable,date,period) → return the topic + the
--    Q1/Q2 prompts so the client seeds a curriculum-aware poll. Else has_topic=false
--    → the client keeps the generic poll (decision #13). Manage-authorized only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_class_poll_seed(
  p_timetable_id uuid, p_attendance_date date, p_period_id text)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_course uuid; v_lesson public.curriculum_lesson;
        v_fink text; v_q2 text;
BEGIN
  SELECT institution_id, course_id INTO v_inst, v_course
  FROM public._fn_curriculum_class_ctx(p_timetable_id, p_attendance_date, p_period_id, true);

  SELECT l.* INTO v_lesson
  FROM public.class_session_lesson csl
  JOIN public.curriculum_lesson l ON l.id = csl.lesson_id
  WHERE csl.timetable_id = p_timetable_id AND csl.attendance_date = p_attendance_date
    AND csl.period_id = p_period_id
    AND l.status = 'published';                 -- draft lessons do NOT surface (#13)

  IF v_lesson.id IS NULL THEN
    RETURN jsonb_build_object('has_topic', false, 'course_id', v_course);
  END IF;

  v_fink := COALESCE(v_lesson.primary_fink_dimension, 'foundational');
  v_q2 := CASE v_fink
            WHEN 'application'       THEN 'How ready do you feel to apply this?'
            WHEN 'integration'       THEN 'How well does this connect to earlier topics?'
            WHEN 'human'             THEN 'How confident do you feel going into the next topic?'
            WHEN 'caring'            THEN 'How motivated do you feel about this topic?'
            WHEN 'learning_to_learn' THEN 'Do you know what to review next?'
            ELSE                          'How clear are the key ideas from today?'
          END;

  RETURN jsonb_build_object(
    'has_topic', true,
    'lesson_id', v_lesson.id,
    'lesson_title', v_lesson.title,
    'primary_fink_dimension', v_fink,
    'course_id', v_course,
    'co_refs', to_jsonb(v_lesson.co_refs),
    'q1_prompt', 'How well did you understand today’s topic: ' || v_lesson.title || '?',
    'q2_prompt', v_q2,
    'q2_min_label', 'Not yet',
    'q2_max_label', 'Fully'
  );
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_class_poll_seed(uuid, date, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_class_poll_seed(uuid, date, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Learner "today's topic" surface — the published topics linked to the classes
--     the caller is Present in today, COMBINED per lesson with a per-session
--     drill-down (#35). Present-gated (a topic only shows for a class you attend).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_topic_for_learner()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid; v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_topic_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(t.obj ORDER BY t.title), '[]'::jsonb) INTO v_out FROM (
    SELECT l.id, l.title,
      jsonb_build_object(
        'lesson_id', l.id, 'title', l.title,
        'primary_fink_dimension', l.primary_fink_dimension,
        'sessions', jsonb_agg(jsonb_build_object(
          'period_id', csl.period_id, 'attendance_date', csl.attendance_date) ORDER BY csl.period_id)
      ) AS obj
    FROM public.class_session_lesson csl
    JOIN public.curriculum_lesson l ON l.id = csl.lesson_id AND l.status = 'published'
    WHERE csl.attendance_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND EXISTS (
        -- Present-match key: (blob student_id) = learners_profiles.id — the SAME key
        -- the SHIPPED present-gate uses (fn_live_poll_class_poll_for_learner /
        -- fn_live_poll_can_answer, Phase B). Verified-consistent, not an assumption
        -- (deep-review flagged low-confidence 2026-07-05; disposition: matches prod).
        SELECT 1 FROM public.student_attendance sa,
             jsonb_array_elements(COALESCE(sa.attendance_data -> csl.period_id -> 'students','[]'::jsonb)) st
        WHERE sa.timetable_id = csl.timetable_id AND sa.attendance_date = csl.attendance_date
          AND sa.attendance_data ? csl.period_id
          AND (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present')
    GROUP BY l.id, l.title, l.primary_fink_dimension
  ) t;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_topic_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_topic_for_learner() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11) #34 — the tunable reveal floor. Config in platform_policies; a FAIL-SAFE
--     helper that defaults to k≥3 EVERYWHERE if the config is missing, so deleting
--     a policy row can only TIGHTEN privacy, never loosen it below 3 for normal.
-- ═════════════════════════════════════════════════════════════════════════════
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description, is_system, is_active,
   classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('live_poll.small_class_max_roster','global','8'::jsonb,'number',
   'A class whose FULL period roster (all students, any attendance status) is at most this many uses the small-class reveal floor. Capped at 15 in code so large classes can never be reclassified small.',
   false, true, 'major','published','number','live_poll'),
  ('live_poll.reveal_floor_small','global','2'::jsonb,'number',
   'Minimum distinct responders before a SMALL class poll reveals per-option counts (spec #34; confidential, not anonymous).',
   false, true, 'major','published','number','live_poll'),
  ('live_poll.reveal_floor_normal','global','3'::jsonb,'number',
   'Minimum distinct responders before a NORMAL class poll reveals per-option counts (the k≥3 anonymity floor, spec #20).',
   false, true, 'major','published','number','live_poll')
) v(policy_key, scope_type, value, data_type, description, is_system, is_active,
    classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

CREATE OR REPLACE FUNCTION public._fn_live_poll_reveal_floor(p_present int)
 RETURNS int
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_small_max int; v_small int; v_normal int;
BEGIN
  SELECT (value #>> '{}')::numeric::int INTO v_small_max
    FROM public.platform_policies WHERE policy_key = 'live_poll.small_class_max_roster'
      AND scope_type = 'global' AND is_active;
  SELECT (value #>> '{}')::numeric::int INTO v_small
    FROM public.platform_policies WHERE policy_key = 'live_poll.reveal_floor_small'
      AND scope_type = 'global' AND is_active;
  SELECT (value #>> '{}')::numeric::int INTO v_normal
    FROM public.platform_policies WHERE policy_key = 'live_poll.reveal_floor_normal'
      AND scope_type = 'global' AND is_active;
  -- FAIL SAFE + INVARIANT FLOOR: missing config → k≥3 for everyone, and no class counts
  -- as "small". The normal floor can NEVER be tuned below 3 and the small floor never
  -- below 2 — so a mis-set policy row can only TIGHTEN privacy, never defeat the k≥3
  -- anonymity floor for full classes (#20) or drop a small class below 2 (deep-review
  -- 🟡 2026-07-05). To reach "k≥3 everywhere", set small_max=0 or reveal_floor_small=3.
  -- HARD SIZE CAP: a class can never count as "small" beyond 15 present, no matter what
  -- an admin sets small_class_max_roster to — otherwise the SIZE knob could reclassify a
  -- large class as small and reveal it at k=2, defeating k>=3 via the size knob rather
  -- than the floor knob (deep-review 🟠 2026-07-05). Floor-value clamps below already
  -- bound normal>=3 / small>=2; together they mean NO config makes a >15-present class
  -- reveal below k=3.
  v_small_max := LEAST(GREATEST(COALESCE(v_small_max, 0), 0), 15);
  v_normal    := GREATEST(COALESCE(v_normal, 3), 3);
  v_small     := GREATEST(COALESCE(v_small, v_normal), 2);
  -- "small" only for a roster BETWEEN 1 AND small_max. A roster of 0 or NULL (empty/
  -- missing blob) must NOT be treated as small — that would reveal a non-small class at
  -- k=2 on degenerate data. 0/NULL falls through to the normal k>=3 floor (deep-review 🟠).
  RETURN CASE WHEN p_present BETWEEN 1 AND v_small_max THEN v_small ELSE v_normal END;
END $function$;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_reveal_floor(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_reveal_floor(int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) fn_induction_session_poll_totals — CURRENT prod body reproduced verbatim,
--     with ONLY the hardcoded `< 3` / `>= 3` floor replaced by the tunable v_floor
--     (class context only). Non-class contexts are byte-for-byte unchanged
--     (v_floor stays 3 and is only used inside class-guarded expressions).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_roster int; v_questions jsonb; v_anchor public.scf_live_pulse; v_floor int := 3;
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
          'count', CASE WHEN v_p.context_type = 'class_session' AND q_resp.cnt < v_floor
                          AND q.kind <> 'wordcloud' THEN NULL ELSE oc.cnt END
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o
          CROSS JOIN LATERAL (SELECT count(*)::int AS cnt
                              FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) oc
          WHERE o.question_id = q.id
            AND (q.kind <> 'wordcloud'
                 OR oc.cnt >= CASE WHEN v_p.context_type = 'class_session' THEN v_floor ELSE 3 END))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 13) fn_induction_session_poll_responders — CURRENT prod body, with the class
--     named-roster gate switched from hardcoded < 3 to the tunable v_floor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_responders(p_poll_id uuid)
 RETURNS TABLE(learner_id uuid, register_number text, roll_number text, learner_name text,
               questions_answered bigint, answered_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_floor int := 3;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not authenticated'; END IF;
  SELECT p.context_type, p.context_id INTO v_ctype, v_cid FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_cid IS NULL OR NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not allowed'; END IF;

  -- reveal floor (spec #20 + tunable #34): withhold the named responder roster for a
  -- CLASS poll until >= v_floor distinct students have answered (normal classes k≥3;
  -- small classes at the configured floor). Empty result → the "Who answered" list
  -- stays hidden in the UI.
  IF v_ctype = 'class_session' THEN
    -- The NAMED responder roster NEVER reveals at the small-class floor — decision #34
    -- itself says a small-class reveal "shows only option counts, never names". So names
    -- use the NORMAL floor (k>=3) regardless of class size; passing NULL forces normal
    -- (deep-review 🟠 2026-07-05). Only aggregate option counts (in totals) may soften to 2.
    v_floor := public._fn_live_poll_reveal_floor(NULL);
    IF (SELECT count(DISTINCT v.learner_id)
        FROM public.induction_session_poll_vote v WHERE v.poll_id = p_poll_id) < v_floor THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT v.learner_id,
         lp.register_number::text,
         lp.roll_number::text,
         trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         count(DISTINCT v.question_id),
         max(v.created_at)
  FROM public.induction_session_poll_vote v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.poll_id = p_poll_id
  GROUP BY v.learner_id, lp.register_number, lp.roll_number, lp.first_name, lp.last_name
  ORDER BY max(v.created_at) DESC;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14) #37 — class poll closes at 21:00 IST (end of the day it opened), not a fixed
--     240-minute window. CURRENT prod body of fn_live_poll_open_class_poll, with
--     only the auto_close_at computation changed (both the poll row and the anchor).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_open_class_poll(p_poll_id uuid)
 RETURNS public.induction_session_poll
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_row public.induction_session_poll; v_close timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not authenticated'; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_cid IS NULL OR v_ctype <> 'class_session' THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not a class poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN RAISE EXCEPTION 'fn_live_poll_open_class_poll: not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_live_poll_open_class_poll: add at least one question first'; END IF;

  -- 21:00 IST of the day it opens; if opened after 21:00 (rare), give +2h so it isn't
  -- born already-closed (spec #37).
  v_close := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '21 hours') AT TIME ZONE 'Asia/Kolkata';
  IF v_close <= now() THEN v_close := now() + interval '2 hours'; END IF;

  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = v_close,
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;

  UPDATE public.scf_live_pulse SET is_open=true, issued_at=now(), auto_close_at = v_close, updated_at=now()
  WHERE id = v_cid;

  RETURN v_row;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_open_class_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_open_class_poll(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
