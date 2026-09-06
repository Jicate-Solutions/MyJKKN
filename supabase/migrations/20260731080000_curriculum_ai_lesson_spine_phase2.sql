-- 20260731080000_curriculum_ai_lesson_spine_phase2.sql
-- Curriculum-aware class poll — Phase 2: the AI lesson-spine generator (drafts-gated).
-- Spec: specs/curriculum-aware-lesson-plan-2026-07-04.md (Phase 2 follow-up).
--
-- ── Hard invariant (R1 compliance mitigation, locked) ─────────────────────────
-- AI DRAFTS ARE NEVER PUBLISHED ON GENERATE. Every row this migration's write RPC
-- creates has status='draft'. Only a human (faculty/HOD/admin) calling
-- fn_curriculum_lesson_ai_approve can flip draft -> published. AI is the author,
-- faculty is the authority.
--
-- ── What this does (additive only — Phase 1 functions are NOT touched) ────────
-- Phase 1 (20260731040000_curriculum_aware_class_poll_phase1.sql) shipped the
-- lesson spine table, the session-link, the BoS CLO connector, and the poll-wire
-- seam — all FACULTY-authored, published-on-create. Phase 2 adds the AI half:
--   1) Two new nullable/defaulted columns on curriculum_lesson (artifact_kind,
--      ai_batch_key) + created_by loosened to NULLABLE (AI-authored drafts have
--      no human creator until a human approves them) — additive schema changes,
--      zero behavior change to any Phase-1 row or Phase-1 function.
--   2) fn_curriculum_lesson_ai_draft_upsert — service-role-only draft writer,
--      idempotent per (course, sequence/unit slot) so a re-gen replaces the prior
--      UNAPPROVED draft in that slot rather than duplicating it. NEVER touches a
--      published (faculty-approved) row.
--   3) fn_curriculum_lesson_drafts_for_course / fn_curriculum_courses_with_pending_ai_drafts
--      — read RPCs for the faculty review UI (teaching-staff/HOD/admin gated,
--      mirrors fn_curriculum_lessons_for_course's authority check exactly).
--   4) fn_curriculum_lesson_ai_approve / fn_curriculum_lesson_ai_reject — the
--      faculty-authority actions (HOD/admin override). Approve flips
--      draft -> published (with optional faculty edits, patch-style like Phase 1's
--      EDIT branch); reject archives the draft.
--   5) ai_model_config seed rows for the two feature keys (bulk cron + click regen
--      — kept SEPARATE on purpose, see the cron file header for why one shared key
--      would collide two independent collectors).
--   6) ai_routine_schedules seed row so the bulk-mint cron's weekly SUBMIT is fired
--      by the existing editable dispatcher (ai-routine-dispatcher) with zero
--      vercel.json edit for the submit leg.
--   7) platform_policies rows (config-table pattern, decisions #24-26): the batch
--      cap and the assessment-brief-emission toggle, read at runtime by the cron
--      via the existing fn_get_policy_int/_bool helpers (no new config table —
--      Phase 1 itself used platform_policies for its #34 tunable, not a bespoke
--      per-module table; Phase 2 follows that same lighter precedent).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Schema: additive columns + the AI-draft-slot idempotency index.
-- ─────────────────────────────────────────────────────────────────────────────

-- artifact_kind distinguishes a normal spine lesson from the two Phase-2 extra
-- draft artefacts (decisions #24-26): a per-unit Concept-Application brief and a
-- per-course team-capstone brief (adapted from the BoS syllabus's own capstone
-- options). Both reuse curriculum_lesson (title + learning_outcomes jsonb,
-- repurposed for brief bodies) rather than a new table — generalization-ready via
-- one more enum value, not a schema fork.
ALTER TABLE public.curriculum_lesson
  ADD COLUMN IF NOT EXISTS artifact_kind text NOT NULL DEFAULT 'lesson';
ALTER TABLE public.curriculum_lesson
  DROP CONSTRAINT IF EXISTS curriculum_lesson_artifact_kind_chk;
ALTER TABLE public.curriculum_lesson
  ADD CONSTRAINT curriculum_lesson_artifact_kind_chk
  CHECK (artifact_kind IN ('lesson','concept_brief','capstone_brief'));

-- Traceability only (NOT the idempotency mechanism — see the unique index below).
-- Lets an operator trace which ai_batch_jobs job produced/last-touched a draft.
ALTER TABLE public.curriculum_lesson
  ADD COLUMN IF NOT EXISTS ai_batch_key text;

-- created_by was NOT NULL DEFAULT auth.uid() in Phase 1 (faculty-authored,
-- published-on-create — the teacher IS the creator). An AI-generated draft has NO
-- human creator until a human approves it (approved_by/approved_at already exist
-- for exactly that moment), so the column must accept NULL for AI rows. Loosening
-- a NOT NULL constraint is backward-compatible: every existing Phase-1 write path
-- still supplies auth.uid() explicitly (fn_curriculum_lesson_upsert's INSERT lists
-- created_by = auth.uid() literally, not relying on the column default), and the
-- curriculum_lesson_select RLS policy's `created_by = auth.uid()` branch degrades
-- to NULL (falsy) for an AI row with no effect on any existing grant.
ALTER TABLE public.curriculum_lesson
  ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN public.curriculum_lesson.artifact_kind IS
  'lesson (default, the ordered spine) | concept_brief (per-unit Concept-Application brief, Phase 2) | capstone_brief (per-course team-capstone brief adapted from the BoS syllabus''s capstone options, Phase 2). Both brief kinds store their body in learning_outcomes (repurposed jsonb) and are always source IN (bos_ai,title_ai), status=draft until approved.';
COMMENT ON COLUMN public.curriculum_lesson.ai_batch_key IS
  'Traceability only: which ai_batch_jobs run last wrote/updated this draft. NOT used for idempotency — see uq_curriculum_lesson_ai_draft_slot.';
COMMENT ON COLUMN public.curriculum_lesson.created_by IS
  'NULL for an AI-authored row (source IN (bos_ai,title_ai)) that has not yet been approved — a human creator only exists once fn_curriculum_lesson_ai_approve or the faculty-authored fn_curriculum_lesson_upsert path runs.';

-- The idempotency backbone for fn_curriculum_lesson_ai_draft_upsert: at most ONE
-- UNAPPROVED (draft) AI row per (course, artifact_kind, slot). A re-gen (bulk-mint
-- retry, or a faculty's "regenerate" click) UPDATES the existing draft in that slot
-- in place rather than duplicating it. The moment a slot's draft is APPROVED
-- (status -> published) it drops out of this partial index, so a later re-gen can
-- never silently overwrite a faculty-approved lesson — it can only ever touch rows
-- still sitting in draft. 'lesson' rows key on sequence_no; 'concept_brief' rows key
-- on unit_label (one per unit); 'capstone_brief' keys on the course alone (both
-- sequence_no and unit_label NULL -> COALESCE collapses to one row per course).
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_lesson_ai_draft_slot
  ON public.curriculum_lesson (course_id, artifact_kind, COALESCE(sequence_no, -1), COALESCE(unit_label, ''))
  WHERE source IN ('bos_ai','title_ai') AND status = 'draft';

CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_ai_batch_key
  ON public.curriculum_lesson (ai_batch_key) WHERE ai_batch_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) fn_curriculum_lesson_ai_draft_upsert — service-role-only draft writer.
--    Called from the collect step of BOTH the bulk-mint cron and the ai-tasks
--    "regenerate" click (both run with the service-role client). NEVER callable
--    by an authenticated user session — an end user must go through the review
--    UI's approve/reject RPCs, never write drafts directly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(
  p_course_id          uuid,
  p_artifact_kind      text,               -- 'lesson' | 'concept_brief' | 'capstone_brief'
  p_sequence_no        int,                -- lesson: 1..N within its unit-ordered spine; briefs: NULL
  p_unit_label         text,               -- lesson/concept_brief: e.g. 'Unit 2'; capstone_brief: NULL
  p_title              text,
  p_learning_outcomes  jsonb,              -- lesson: [{text,fink_dimension,bloom_level,co_ref,ltl_phase}]
                                            -- brief:  [{text, co_ref}]  (body reuses the same column)
  p_primary_fink       text,
  p_co_refs            text[],
  p_bos_syllabus_id    uuid,
  p_source             text,               -- 'bos_ai' | 'title_ai' — NEVER 'faculty' (AI can't self-claim faculty authorship)
  p_gemini_prompt      text,
  p_ai_batch_key       text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_inst uuid; v_existing uuid; v_id uuid; v_status text;
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: service role only';
  END IF;
  IF p_source NOT IN ('bos_ai','title_ai') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: source must be bos_ai or title_ai — AI can never author as faculty';
  END IF;
  IF p_artifact_kind NOT IN ('lesson','concept_brief','capstone_brief') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: invalid artifact_kind %', p_artifact_kind;
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: title required';
  END IF;

  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: no such course'; END IF;

  -- Idempotent upsert-by-slot (see uq_curriculum_lesson_ai_draft_slot comment).
  SELECT id INTO v_existing
  FROM public.curriculum_lesson
  WHERE course_id = p_course_id
    AND artifact_kind = p_artifact_kind
    AND status = 'draft'
    AND source IN ('bos_ai','title_ai')
    AND COALESCE(sequence_no, -1) = COALESCE(p_sequence_no, -1)
    AND COALESCE(unit_label, '') = COALESCE(p_unit_label, '')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.curriculum_lesson
    SET title = btrim(p_title),
        learning_outcomes = COALESCE(p_learning_outcomes, '[]'::jsonb),
        primary_fink_dimension = p_primary_fink,
        co_refs = COALESCE(p_co_refs, '{}'),
        bos_syllabus_id = COALESCE(p_bos_syllabus_id, bos_syllabus_id),
        source = p_source,
        gemini_prompt = p_gemini_prompt,
        ai_batch_key = COALESCE(p_ai_batch_key, ai_batch_key),
        updated_at = now()
    WHERE id = v_existing
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.curriculum_lesson
      (institution_id, course_id, sequence_no, unit_label, title, learning_outcomes,
       primary_fink_dimension, co_refs, source, status, artifact_kind, gemini_prompt,
       bos_syllabus_id, ai_batch_key, created_by, approved_by, approved_at)
    VALUES
      (v_inst, p_course_id, p_sequence_no, p_unit_label, btrim(p_title),
       COALESCE(p_learning_outcomes, '[]'::jsonb), p_primary_fink, COALESCE(p_co_refs, '{}'),
       p_source, 'draft', p_artifact_kind, p_gemini_prompt, p_bos_syllabus_id, p_ai_batch_key,
       NULL, NULL, NULL)   -- created_by/approved_by/approved_at: unset until a human approves
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race backstop (concurrent collect retries), mirrors Phase 1's pattern.
    SELECT id INTO v_id FROM public.curriculum_lesson
    WHERE course_id = p_course_id AND artifact_kind = p_artifact_kind AND status = 'draft'
      AND source IN ('bos_ai','title_ai')
      AND COALESCE(sequence_no, -1) = COALESCE(p_sequence_no, -1)
      AND COALESCE(unit_label, '') = COALESCE(p_unit_label, '')
    LIMIT 1;
  END;

  -- HARD INVARIANT self-check: this function must never leave behind a non-draft
  -- row. Defensive against a future edit accidentally changing the status literal.
  IF v_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.curriculum_lesson WHERE id = v_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'fn_curriculum_lesson_ai_draft_upsert: invariant violation — row % is % not draft', v_id, v_status;
    END IF;
  END IF;

  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(uuid, text, int, text, text, jsonb, text, text[], uuid, text, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(uuid, text, int, text, text, jsonb, text, text[], uuid, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Read RPCs for the faculty review UI. Non-student, institution-scoped
--    teaching-staff/HOD/admin gate (same role list + role_has_institution_access
--    as Phase 1's fn_curriculum_lessons_for_course). NOTE: the READ scope is
--    deliberately institution-WIDE, NOT per-course (unlike the approve/reject WRITE
--    gate, which requires teaching the course). Draft lesson content is unpublished
--    academic material (no PII), and a department reviewer / HOD / peer faculty must
--    be able to SEE drafts across the department's courses to coordinate review;
--    only PUBLISHING (approve) and archiving (reject) are bound to teaching the
--    course. Asymmetry is intentional: look institution-wide, mutate per-course
--    (deep-review LOW 2026-07-06, accepted).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_drafts_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_role text; v_ok boolean; v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_drafts_for_course: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_drafts_for_course: no such course'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  v_ok := public.is_super_admin() OR (
    public.role_has_institution_access(v_inst) AND
    v_role = ANY (ARRAY['faculty','school_faculty','staff','hod','principal','dean',
                         'coordinator','institution_admin','administrator','system_admin'])
  );
  IF NOT v_ok THEN RAISE EXCEPTION 'fn_curriculum_lesson_drafts_for_course: not available to this role'; END IF;

  SELECT COALESCE(jsonb_agg(t.obj ORDER BY t.artifact_kind, t.seq NULLS LAST, t.created_at), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT jsonb_build_object(
             'id', l.id, 'artifact_kind', l.artifact_kind, 'title', l.title,
             'unit_label', l.unit_label, 'sequence_no', l.sequence_no,
             'learning_outcomes', l.learning_outcomes, 'primary_fink_dimension', l.primary_fink_dimension,
             'co_refs', l.co_refs, 'source', l.source, 'bos_syllabus_id', l.bos_syllabus_id,
             'created_at', l.created_at
           ) AS obj, l.sequence_no AS seq, l.artifact_kind, l.created_at
    FROM public.curriculum_lesson l
    WHERE l.course_id = p_course_id AND l.status = 'draft' AND l.source IN ('bos_ai','title_ai')
    ORDER BY l.sequence_no NULLS LAST, l.created_at
    LIMIT 300   -- defensive cap, mirrors Phase 1's fn_curriculum_lessons_for_course
  ) t;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_drafts_for_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_drafts_for_course(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_curriculum_courses_with_pending_ai_drafts()
 RETURNS TABLE(course_id uuid, course_code text, course_name text, institution_id uuid, draft_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_courses_with_pending_ai_drafts: not authenticated'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  RETURN QUERY
  SELECT c.id, c.course_code, c.course_name, c.institution_id, count(l.id)
  FROM public.curriculum_lesson l
  JOIN public.courses c ON c.id = l.course_id
  -- Count ALL draft artifact_kinds (lesson + concept_brief + capstone_brief), not just
  -- 'lesson' — otherwise once a course's lessons are all approved/rejected it would drop
  -- off the review inbox while its brief drafts stay draft forever, orphaned & unreviewable
  -- (deep-review MEDIUM 2026-07-06). A course stays in the inbox while ANY draft remains.
  WHERE l.status = 'draft' AND l.source IN ('bos_ai','title_ai')
    AND (public.is_super_admin()
         OR (public.role_has_institution_access(c.institution_id)
             AND v_role = ANY (ARRAY['faculty','school_faculty','staff','hod','principal','dean',
                                      'coordinator','institution_admin','administrator','system_admin'])))
  GROUP BY c.id, c.course_code, c.course_name, c.institution_id
  ORDER BY count(l.id) DESC, c.course_code
  -- Cap sized above the full BoS-covered catalog (~839 courses) so no course with pending
  -- drafts is stranded below a truncating limit while the ~30+ weekly mint runs proceed
  -- (deep-review MEDIUM 2026-07-06). Keyset pagination can replace this if the catalog grows.
  LIMIT 1000;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_courses_with_pending_ai_drafts() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_courses_with_pending_ai_drafts() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Faculty-authority actions: approve (draft -> published, with optional edits)
--    and reject (draft -> archived). Deliberately a NEW function, not a call
--    into Phase 1's fn_curriculum_lesson_upsert EDIT branch — that branch's
--    authority check is "creator = auth.uid() OR HOD/admin", which would lock
--    OUT the very teaching staff Phase 2 needs to approve (an AI draft's
--    creator is NULL, not the reviewing faculty). This function's authority is
--    the SAME as Phase 1's HARDENED CREATE gate (PR #1819): plain faculty must
--    actually TEACH the lesson's course (assigned_faculty.faculty_id = staff.id,
--    email fallback); privileged roles (HOD/principal/dean/coordinator/admin/
--    super) keep the department override — approving PUBLISHES into the shared
--    spine, so it must not be looser than authoring.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_approve(
  p_lesson_id          uuid,
  p_title              text DEFAULT NULL,
  p_unit_label         text DEFAULT NULL,
  p_sequence_no        int DEFAULT NULL,
  p_learning_outcomes  jsonb DEFAULT NULL,
  p_primary_fink       text DEFAULT NULL,
  p_co_refs            text[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_inst uuid; v_course uuid; v_status text; v_source text; v_role text;
        v_email text; v_staff_id uuid; v_priv boolean; v_teaches boolean; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: not authenticated'; END IF;
  -- FOR UPDATE: lock the draft row so two concurrent approve/reject calls can't both pass
  -- the status='draft' check and double-process (deep-review LOW 2026-07-06).
  SELECT institution_id, course_id, status, source INTO v_inst, v_course, v_status, v_source
  FROM public.curriculum_lesson WHERE id = p_lesson_id FOR UPDATE;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: no such lesson'; END IF;
  IF v_status <> 'draft' OR v_source NOT IN ('bos_ai','title_ai') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: only an AI draft lesson can be approved via this function';
  END IF;

  -- APPROVE PUBLISHES the draft into the shared course spine, so its authority must be
  -- the SAME as Phase 1's hardened CREATE gate (fn_curriculum_lesson_upsert, PR #1819):
  -- plain teaching staff must actually TEACH this course (assigned_faculty.faculty_id =
  -- staff.id in student_attendance, 100% populated; email is a NULL-guarded fallback),
  -- privileged roles (HOD/principal/dean/coordinator/admin/super) keep the dept override.
  -- The original "any teaching staff of the institution" list mirrored the PRE-#1819
  -- CREATE gate and would let a faculty publish AI drafts into a course they don't teach
  -- (spine-pollution on the publish action — the exact gap #1819 closed for CREATE).
  SELECT role, lower(btrim(email)) INTO v_role, v_email FROM public.profiles WHERE id = auth.uid();
  v_priv := public.is_super_admin()
            OR v_role = ANY (ARRAY['hod','principal','dean','coordinator',
                                   'institution_admin','administrator','system_admin']);
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
  v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
    ) AS pd(period_id, pv)
    -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
    -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
    -- periods). Normalize both shapes so a co-teacher is not false-blocked from approving
    -- their own course's drafts (deep-review LOW 2026-07-06; mirrors PR #1819's 3b fix).
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(pv -> 'assigned_faculty')
        WHEN 'array'  THEN pv -> 'assigned_faculty'
        WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
        ELSE '[]'::jsonb END
    ) AS fac
    WHERE sa.institution_id = v_inst
      AND pv ->> 'course_id' = v_course::text
      AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
            OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
  );
  v_ok := public.is_super_admin()
          OR (v_priv AND public.role_has_institution_access(v_inst))
          OR (v_role = ANY (ARRAY['faculty','school_faculty','staff'])
              AND public.role_has_institution_access(v_inst) AND v_teaches);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: only staff who teach this course (or an HOD/admin of its institution) can approve its AI draft';
  END IF;

  -- Patch-style (COALESCE): an approve-with-no-edits leaves the AI content as-is;
  -- a faculty edit overrides only the fields they touched, mirroring Phase 1's
  -- fn_curriculum_lesson_upsert EDIT branch so behavior is familiar/consistent.
  UPDATE public.curriculum_lesson
  SET title = COALESCE(NULLIF(btrim(COALESCE(p_title,'')), ''), title),
      unit_label = COALESCE(p_unit_label, unit_label),
      sequence_no = COALESCE(p_sequence_no, sequence_no),
      learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
      primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
      co_refs = COALESCE(p_co_refs, co_refs),
      status = 'published',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_lesson_id;

  RETURN p_lesson_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(uuid, text, text, int, jsonb, text, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(uuid, text, text, int, jsonb, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_reject(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_inst uuid; v_course uuid; v_status text; v_source text; v_role text;
        v_email text; v_staff_id uuid; v_priv boolean; v_teaches boolean; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: not authenticated'; END IF;
  -- FOR UPDATE: lock the draft row so two concurrent approve/reject calls can't both pass
  -- the status='draft' check and double-process (deep-review LOW 2026-07-06).
  SELECT institution_id, course_id, status, source INTO v_inst, v_course, v_status, v_source
  FROM public.curriculum_lesson WHERE id = p_lesson_id FOR UPDATE;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: no such lesson'; END IF;
  IF v_status <> 'draft' OR v_source NOT IN ('bos_ai','title_ai') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: only an AI draft lesson can be rejected via this function';
  END IF;

  -- Same course-teaching authority as approve (above) — a cross-department faculty must
  -- not be able to archive another course's AI drafts either (grief vector). Plain
  -- faculty must teach the course; privileged roles keep the dept override.
  SELECT role, lower(btrim(email)) INTO v_role, v_email FROM public.profiles WHERE id = auth.uid();
  v_priv := public.is_super_admin()
            OR v_role = ANY (ARRAY['hod','principal','dean','coordinator',
                                   'institution_admin','administrator','system_admin']);
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
  v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
    ) AS pd(period_id, pv)
    -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
    -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
    -- periods). Normalize both shapes so a co-teacher is not false-blocked from approving
    -- their own course's drafts (deep-review LOW 2026-07-06; mirrors PR #1819's 3b fix).
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(pv -> 'assigned_faculty')
        WHEN 'array'  THEN pv -> 'assigned_faculty'
        WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
        ELSE '[]'::jsonb END
    ) AS fac
    WHERE sa.institution_id = v_inst
      AND pv ->> 'course_id' = v_course::text
      AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
            OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
  );
  v_ok := public.is_super_admin()
          OR (v_priv AND public.role_has_institution_access(v_inst))
          OR (v_role = ANY (ARRAY['faculty','school_faculty','staff'])
              AND public.role_has_institution_access(v_inst) AND v_teaches);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: only staff who teach this course (or an HOD/admin of its institution) can reject its AI draft';
  END IF;

  UPDATE public.curriculum_lesson SET status = 'archived', updated_at = now() WHERE id = p_lesson_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_reject(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_reject(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) ai_model_config seed rows. TWO SEPARATE feature keys on purpose:
--      • curriculum.lesson_spine_generate — the bulk-mint CRON (ai_batch_jobs
--        phase='generate', its own dedicated collect leg).
--      • curriculum.lesson_spine_regen    — the per-course "regenerate" click via
--        the AI Max-button lane (lib/ai-tasks/registry.ts; collected generically
--        by the shared ai-tasks-sweep loop, ai_batch_jobs phase='user_task').
--    fn_ai_batch_claim_for_collection claims ANY outstanding job for a feature_key
--    regardless of phase — sharing ONE key between the bulk cron's bespoke collect
--    handler and the generic ai-tasks-sweep collector would let either drain the
--    other's jobs and hand them to the WRONG recordResult/parse logic. Two keys
--    (same governed model) avoids that collision entirely.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ai_model_config (feature_key, display_name, description, category, provider, model_id) VALUES
  ('curriculum.lesson_spine_generate',
   'Curriculum Lesson-Spine Generator (bulk)',
   'Weekly cron: mint a draft lesson spine (+ optional Concept-Application/capstone briefs) for BoS-covered courses that have none yet.',
   'curriculum',
   'anthropic',
   'claude-sonnet-4-6'),
  ('curriculum.lesson_spine_regen',
   'Curriculum Lesson-Spine Regeneration (per course)',
   'Interactive: faculty "regenerate spine" click for one course, via the AI Max-button async lane.',
   'curriculum',
   'anthropic',
   'claude-sonnet-4-6')
ON CONFLICT (feature_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) ai_routine_schedules seed — the bulk-mint cron's weekly SUBMIT is fired by
--    the existing editable dispatcher (ai-routine-dispatcher, */15 vercel.json
--    cron already live) with ZERO vercel.json edit needed for the submit leg.
--    Wednesday 10:15 IST (minute_of_day is IST per the dispatcher's convention —
--    see 20260701210500_ai_routine_schedules_seed.sql), off-peak from the other
--    weekly routines (induction=Mon 10:00 IST, session-feedback-escalation=Mon
--    13:00 IST).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('curriculum-lesson-spine-generate', true, true, ARRAY[3]::smallint[], 615)
ON CONFLICT (routine_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) platform_policies — config-table pattern (decisions #24-26 generalization).
--    Read at runtime by the cron via the existing fn_get_policy_int/_bool
--    helpers (20260429000002_platform_policies_substrate.sql) — no new table.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description, is_system, is_active,
   classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('curriculum_ai.batch_cap','global','25'::jsonb,'number',
   'Max BoS-covered courses the bulk lesson-spine-generate cron mints per weekly run (excess is logged and picked up next run).',
   false, true, 'operational','published','number','curriculum_ai'),
  ('curriculum_ai.emit_assessment_briefs','global','false'::jsonb,'boolean',
   'Whether the lesson-spine generator also drafts a Concept-Application brief per unit + a team-capstone brief per course, for BoS/A&S courses whose syllabus assessment_structure carries populated capstones/components (the v1.2 assessment structure). DEFAULT OFF: the lesson lane ships first; the brief review/approve path (co_ref-array handling, brief-vs-lesson spine separation) is hardened in a follow-up before this is flipped on. Prod currently has 0 populated capstones so it would emit nothing regardless. Skipped entirely for courses with no such data (PDE tier-3 pure-theory, or any BoS syllabus without a filled-in assessment structure).',
   false, true, 'operational','published','boolean','curriculum_ai')
) v(policy_key, scope_type, value, data_type, description, is_system, is_active,
    classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

NOTIFY pgrst, 'reload schema';
