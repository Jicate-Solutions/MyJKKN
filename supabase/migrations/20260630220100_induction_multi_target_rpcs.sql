-- 20260630220100_induction_multi_target_rpcs.sql

-- helper: does the caller have induction.manage access to EVERY institution in arr?
CREATE OR REPLACE FUNCTION public._fn_induction_can_target_institutions(p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(array_length(p_ids,1),0) = 0 THEN RETURN false; END IF;
  IF is_super_admin() OR is_admin() THEN RETURN true; END IF;
  IF NOT user_has_permission('induction.manage') THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p_ids,'{}'::uuid[])) x(iid)
    WHERE NOT role_has_institution_access(x.iid));
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) TO authenticated;

-- CREATE PROGRAM (adds the 3 array params; owning institution_id = target_institution_ids[1])
CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid, p_academic_year_id uuid, p_name text,
  p_start_date timestamptz, p_end_date timestamptz, p_venue_text text DEFAULT 'Campus',
  p_description text DEFAULT NULL, p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution', p_venue_resource_id uuid DEFAULT NULL,
  p_degree_type_filter text DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid; v_slug text;
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_degree text := NULLIF(p_degree_type_filter,'');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_owning uuid := CASE WHEN v_multi THEN p_institution_ids[1] ELSE p_institution_id END;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized'; END IF;
  END IF;
  IF v_owning IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution and name are required'; END IF;
  IF v_scope NOT IN ('institution','group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group'; END IF;
  IF v_degree IS NOT NULL AND v_degree NOT IN ('ug','pg') THEN
    RAISE EXCEPTION 'fn_induction_create_program: degree_type_filter must be ug, pg, or null'; END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (v_owning, 'induction', p_name, v_slug,
          CASE WHEN p_venue_resource_id IS NOT NULL THEN NULLIF(p_venue_text,'Campus') ELSE coalesce(p_venue_text,'Campus') END,
          p_venue_resource_id, p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year,
    enroll_scope, degree_type_filter, target_institution_ids, target_degree_ids, target_department_ids)
  VALUES (v_event_id, v_owning, p_academic_year_id, p_admission_year, v_scope, v_degree,
          CASE WHEN v_multi THEN p_institution_ids ELSE NULL END,
          NULLIF(p_degree_ids, '{}'::uuid[]),
          NULLIF(p_department_ids, '{}'::uuid[]));

  RETURN v_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) TO authenticated;

-- PREVIEW (adds 3 array params + by_department; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_preview_enroll(
  p_institution_id uuid, p_admission_year integer, p_enroll_scope text DEFAULT 'institution',
  p_degree_type_filter text DEFAULT NULL, p_program_ids uuid[] DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_result jsonb;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized'; END IF;
  END IF;
  IF p_admission_year IS NULL THEN RAISE EXCEPTION 'fn_induction_preview_enroll: admission_year required'; END IF;

  WITH matched AS (
    SELECT lp.id, lp.institution_id, lp.program_id, lp.department_id, d.degree_type, lp.lifecycle_status,
           TRIM(CONCAT(lp.first_name,' ',COALESCE(lp.last_name,''))) AS full_name
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    LEFT JOIN public.degrees d ON d.id = lp.degree_id
    WHERE ay.year = p_admission_year
      AND lp.lifecycle_status IN ('reserved','admitted','account')
      AND (
        (v_multi AND lp.institution_id = ANY(p_institution_ids)
           AND (p_degree_ids IS NULL OR cardinality(p_degree_ids)=0 OR lp.degree_id = ANY(p_degree_ids))
           AND (p_department_ids IS NULL OR cardinality(p_department_ids)=0 OR lp.department_id = ANY(p_department_ids)))
        OR
        (NOT v_multi AND (v_scope='group' OR lp.institution_id = p_institution_id)
           AND (p_degree_type_filter IS NULL OR d.degree_type = p_degree_type_filter)
           AND (p_program_ids IS NULL OR lp.program_id = ANY(p_program_ids)))
      ))
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM matched),'scope',CASE WHEN v_multi THEN 'targeted' ELSE v_scope END,
    'degree_type_filter',p_degree_type_filter,
    'by_institution',(SELECT coalesce(jsonb_agg(jsonb_build_object('institution',institution,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT i.name AS institution,count(*) cnt FROM matched m LEFT JOIN public.institutions i ON i.id=m.institution_id GROUP BY i.name) a),
    'by_program',(SELECT coalesce(jsonb_agg(jsonb_build_object('program',program,'degree_type',degree_type,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(p.program_name,'(no program)') program,m.degree_type,count(*) cnt FROM matched m LEFT JOIN public.programs p ON p.id=m.program_id GROUP BY p.program_name,m.degree_type) b),
    'by_department',(SELECT coalesce(jsonb_agg(jsonb_build_object('department',department,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(dep.department_name,'(no department)') department,count(*) cnt FROM matched m LEFT JOIN public.departments dep ON dep.id=m.department_id GROUP BY dep.department_name) e),
    'sample',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',full_name,'status',lifecycle_status)),'[]'::jsonb)
       FROM (SELECT full_name,lifecycle_status FROM matched ORDER BY full_name LIMIT 15) c)
  ) INTO v_result; RETURN v_result;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) TO authenticated;

-- AUTO-ENROLL (reads target arrays; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst uuid; v_year integer; v_scope text; v_degree_filter text;
  v_inst_ids uuid[]; v_degree_ids uuid[]; v_dept_ids uuid[];
  v_multi boolean; v_count integer;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter,
         target_institution_ids, target_degree_ids, target_department_ids
    INTO v_inst, v_year, v_scope, v_degree_filter, v_inst_ids, v_degree_ids, v_dept_ids
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id; END IF;
  v_multi := (v_inst_ids IS NOT NULL AND cardinality(v_inst_ids) > 0);

  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(v_inst_ids) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  END IF;
  IF v_year IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set'; END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved','admitted','account')
    AND (
      (v_multi AND lp.institution_id = ANY(v_inst_ids)
         AND (v_degree_ids IS NULL OR cardinality(v_degree_ids)=0 OR lp.degree_id = ANY(v_degree_ids))
         AND (v_dept_ids IS NULL OR cardinality(v_dept_ids)=0 OR lp.department_id = ANY(v_dept_ids)))
      OR
      (NOT v_multi AND (v_scope='group' OR lp.institution_id = v_inst)
         AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter))
    )
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
