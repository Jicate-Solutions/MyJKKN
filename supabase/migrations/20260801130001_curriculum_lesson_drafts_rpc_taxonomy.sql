-- 20260801130000_curriculum_lesson_drafts_rpc_taxonomy.sql
-- Taxonomy-aware lesson spine (P0, 2026-07-24), part 3. The review UI reads a course's AI
-- drafts through fn_curriculum_lesson_drafts_for_course, which hand-builds a jsonb object
-- per lesson — extend it to also surface primary_taxonomy + primary_bloom_level so the
-- review screen can show the Bloom-primary picker for 'blooms' courses. Signature is
-- unchanged (p_course_id uuid), so this is a true CREATE OR REPLACE (grants preserved); the
-- REVOKE/GRANT below is re-asserted anyway so the secdef-anon CI gate treats it as locked.

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_drafts_for_course(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
             'primary_taxonomy', l.primary_taxonomy, 'primary_bloom_level', l.primary_bloom_level,
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
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_drafts_for_course(uuid) TO authenticated, service_role;
