-- 20260801120000_curriculum_lesson_rpcs_taxonomy_params.sql
-- Taxonomy-aware lesson spine (P0, 2026-07-24), part 2 of 2 (schema part =
-- 20260801110000). Extend the three lesson RPCs to carry the new taxonomy discriminator
-- (primary_taxonomy 'finks'|'blooms') and Bloom-primary level (primary_bloom_level, K1-K6)
-- ALONGSIDE the existing primary_fink_dimension.
--
-- WHY DROP+CREATE (not CREATE OR REPLACE): Postgres identifies a function by name + arg
-- TYPES, so adding parameters makes a NEW overload rather than replacing the old one — a
-- named-arg RPC call could then bind ambiguously. Dropping the exact old signature first
-- and creating the new one with the two params DEFAULTed to NULL keeps a single function
-- and stays backward-compatible (any caller passing only the old named args still binds).
--
-- The generator's draft-upsert OVERWRITES the three primary tags directly (a regen that
-- flips a course finks->blooms must null the stale fink dimension and set the bloom level).
-- The human approve/edit paths COALESCE-patch them (a no-edit approve preserves AI content),
-- exactly mirroring how primary_fink_dimension is already handled in each.
--
-- Anon-lock (mandatory): each function is DROP+CREATEd, so Supabase's default
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon re-grants anon EXECUTE.
-- Every function below re-asserts REVOKE EXECUTE FROM anon, PUBLIC and re-GRANTs its exact
-- prior audience (draft_upsert = service_role only; upsert/ai_approve = authenticated +
-- service_role), matching the live grants captured before this migration.

-- =====================================================================
-- 1) fn_curriculum_lesson_ai_draft_upsert  (service-role only; the generators' writer)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_curriculum_lesson_ai_draft_upsert(
  uuid, text, integer, text, text, jsonb, text, text[], uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(
  p_course_id uuid, p_artifact_kind text, p_sequence_no integer, p_unit_label text,
  p_title text, p_learning_outcomes jsonb, p_primary_fink text, p_co_refs text[],
  p_bos_syllabus_id uuid, p_source text, p_gemini_prompt text, p_ai_batch_key text,
  p_primary_taxonomy text DEFAULT NULL, p_primary_bloom_level text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        primary_taxonomy = p_primary_taxonomy,       -- overwrite: a regen may flip the taxonomy
        primary_bloom_level = p_primary_bloom_level,  -- overwrite: null for a fink-primary lesson
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
       primary_fink_dimension, primary_taxonomy, primary_bloom_level, co_refs, source, status,
       artifact_kind, gemini_prompt, bos_syllabus_id, ai_batch_key, created_by, approved_by, approved_at)
    VALUES
      (v_inst, p_course_id, p_sequence_no, p_unit_label, btrim(p_title),
       COALESCE(p_learning_outcomes, '[]'::jsonb), p_primary_fink, p_primary_taxonomy, p_primary_bloom_level,
       COALESCE(p_co_refs, '{}'), p_source, 'draft', p_artifact_kind, p_gemini_prompt, p_bos_syllabus_id, p_ai_batch_key,
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

REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(
  uuid, text, integer, text, text, jsonb, text, text[], uuid, text, text, text, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_draft_upsert(
  uuid, text, integer, text, text, jsonb, text, text[], uuid, text, text, text, text, text) TO service_role;

-- =====================================================================
-- 2) fn_curriculum_lesson_ai_approve  (authenticated + service_role; publishes a draft)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_curriculum_lesson_ai_approve(
  uuid, text, text, integer, jsonb, text, text[]);

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_approve(
  p_lesson_id uuid, p_title text DEFAULT NULL::text, p_unit_label text DEFAULT NULL::text,
  p_sequence_no integer DEFAULT NULL::integer, p_learning_outcomes jsonb DEFAULT NULL::jsonb,
  p_primary_fink text DEFAULT NULL::text, p_co_refs text[] DEFAULT NULL::text[],
  p_primary_taxonomy text DEFAULT NULL::text, p_primary_bloom_level text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  SELECT role, lower(btrim(email)) INTO v_role, v_email FROM public.profiles WHERE id = auth.uid();
  v_priv := public.is_super_admin()
            OR public.user_has_permission('academic.curriculum.lesson.manage')
            OR v_role = 'system_admin';
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
  v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
    ) AS pd(period_id, pv)
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
  -- a faculty edit overrides only the fields they touched.
  UPDATE public.curriculum_lesson
  SET title = COALESCE(NULLIF(btrim(COALESCE(p_title,'')), ''), title),
      unit_label = COALESCE(p_unit_label, unit_label),
      sequence_no = COALESCE(p_sequence_no, sequence_no),
      learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
      primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
      primary_taxonomy = COALESCE(p_primary_taxonomy, primary_taxonomy),
      primary_bloom_level = COALESCE(p_primary_bloom_level, primary_bloom_level),
      co_refs = COALESCE(p_co_refs, co_refs),
      status = 'published',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_lesson_id;

  RETURN p_lesson_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(
  uuid, text, text, integer, jsonb, text, text[], text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(
  uuid, text, text, integer, jsonb, text, text[], text, text) TO authenticated, service_role;

-- =====================================================================
-- 3) fn_curriculum_lesson_upsert  (authenticated + service_role; faculty create/edit)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_curriculum_lesson_upsert(
  uuid, uuid, text, text, integer, jsonb, text, text[], uuid);

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_upsert(
  p_lesson_id uuid, p_course_id uuid, p_title text, p_unit_label text DEFAULT NULL::text,
  p_sequence_no integer DEFAULT NULL::integer, p_learning_outcomes jsonb DEFAULT '[]'::jsonb,
  p_primary_fink text DEFAULT NULL::text, p_co_refs text[] DEFAULT '{}'::text[],
  p_bos_syllabus_id uuid DEFAULT NULL::uuid,
  p_primary_taxonomy text DEFAULT NULL::text, p_primary_bloom_level text DEFAULT NULL::text)
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
         (p.is_super_admin = true
          OR public.user_has_permission('academic.curriculum.lesson.manage'))
    INTO v_role, v_email, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();

  IF p_lesson_id IS NULL THEN
    -- CREATE: only staff who TEACH this course may author its (published-on-create,
    -- self-approved) lesson. Privileged roles keep the department-seed override.
    v_priv_create := public.is_super_admin()
                     OR v_role = ANY (ARRAY['hod','principal','dean','coordinator',
                                            'institution_admin','administrator','system_admin']);
    IF public.is_super_admin()
       OR (v_priv_create AND public.role_has_institution_access(v_inst)) THEN
      NULL;  -- authorized via the department-seed override; no teaching scan needed
    ELSIF v_role = ANY (ARRAY['faculty','school_faculty','staff'])
          AND public.role_has_institution_access(v_inst) THEN
      SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
      v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
        SELECT 1
        FROM public.student_attendance sa
        CROSS JOIN LATERAL jsonb_each(
          CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
        ) AS pd(period_id, pv)
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
    -- Idempotent on (course, creator, title): re-typing the same topic REUSES the row.
    SELECT id INTO v_existing FROM public.curriculum_lesson
    WHERE course_id = p_course_id AND created_by = auth.uid()
      AND source = 'faculty' AND status = 'published'
      AND lower(title) = lower(btrim(p_title))
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      -- CREATE-ONCE semantics: re-typing an existing published title REUSES that lesson
      -- and only refreshes the primary tags (outcomes/co_refs/unit/sequence untouched —
      -- their non-NULL defaults would WIPE content on a title-only call).
      UPDATE public.curriculum_lesson
      SET primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
          primary_taxonomy = COALESCE(p_primary_taxonomy, primary_taxonomy),
          primary_bloom_level = COALESCE(p_primary_bloom_level, primary_bloom_level),
          updated_at = now()
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
    BEGIN
      INSERT INTO public.curriculum_lesson
        (institution_id, course_id, sequence_no, unit_label, title, learning_outcomes,
         primary_fink_dimension, primary_taxonomy, primary_bloom_level, co_refs, source, status,
         bos_syllabus_id, created_by, approved_by, approved_at)
      VALUES
        (v_inst, p_course_id, p_sequence_no, p_unit_label, btrim(p_title),
         COALESCE(p_learning_outcomes,'[]'::jsonb), p_primary_fink, p_primary_taxonomy, p_primary_bloom_level,
         COALESCE(p_co_refs,'{}'), 'faculty', 'published', p_bos_syllabus_id, auth.uid(), auth.uid(), now())
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

  -- EDIT: creator-only, HOD/admin override, bound to the TARGET lesson's OWN institution.
  SELECT created_by, institution_id INTO v_creator, v_lesson_inst
  FROM public.curriculum_lesson WHERE id = p_lesson_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such lesson'; END IF;
  IF NOT (v_creator = auth.uid()
          OR public.is_super_admin()
          OR (COALESCE(v_role_ok,false) AND public.role_has_institution_access(v_lesson_inst))) THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only the lesson creator or an HOD/admin of its institution can edit it';
  END IF;

  -- Patch-style: an unspecified (NULL) param PRESERVES the current value.
  BEGIN
    UPDATE public.curriculum_lesson
    SET title = btrim(p_title),
        unit_label = COALESCE(p_unit_label, unit_label),
        sequence_no = COALESCE(p_sequence_no, sequence_no),
        learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
        primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
        primary_taxonomy = COALESCE(p_primary_taxonomy, primary_taxonomy),
        primary_bloom_level = COALESCE(p_primary_bloom_level, primary_bloom_level),
        co_refs = COALESCE(p_co_refs, co_refs),
        bos_syllabus_id = COALESCE(p_bos_syllabus_id, bos_syllabus_id),
        updated_at = now()
    WHERE id = p_lesson_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: you already have a published topic with that title in this course';
  END;
  RETURN p_lesson_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(
  uuid, uuid, text, text, integer, jsonb, text, text[], uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(
  uuid, uuid, text, text, integer, jsonb, text, text[], uuid, text, text) TO authenticated, service_role;
