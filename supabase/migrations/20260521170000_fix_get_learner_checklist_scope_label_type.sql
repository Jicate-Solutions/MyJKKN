-- ============================================================================
-- 20260521170000 — Fix get_learner_checklist 42804 type mismatch on scope_label
-- ============================================================================
-- The function's RETURNS TABLE declares scope_label as text. The CASE
-- expression pulls scope labels from four parent tables:
--   institution.name        → character varying  ❌
--   degree.degree_name      → character varying  ❌
--   department.department_name → character varying  ❌
--   programs.program_name   → text  ✓
--
-- Postgres infers the CASE result type as character varying (the dominant
-- branch type) and rejects the row with 42804: "structure of query does
-- not match function result type". This breaks the entire Checklist tab
-- on the enquiry edit page.
--
-- Fix: wrap the CASE in ::text so the column type aligns with the
-- declared return type regardless of which branch fires. No data
-- migration; pure function-body fix.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_learner_checklist(p_learner_id uuid)
 RETURNS TABLE(
   checklist_id      uuid,
   checklist_name    text,
   checklist_desc    text,
   scope_type        text,
   scope_label       text,
   item_id           uuid,
   item_title        text,
   item_description  text,
   is_required       boolean,
   order_index       integer,
   is_done           boolean,
   marked_by         uuid,
   marked_by_name    text,
   marked_at         timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lifecycle    text;
  v_institution  uuid;
  v_degree       uuid;
  v_department   uuid;
  v_program      uuid;
BEGIN
  IF NOT public.user_has_permission('admission.enquiries.checklist.view') THEN
    RAISE EXCEPTION 'permission denied: admission.enquiries.checklist.view';
  END IF;

  SELECT
    lp.lifecycle_status::text,
    lp.institution_id,
    lp.degree_id,
    lp.department_id,
    lp.program_id
  INTO v_lifecycle, v_institution, v_degree, v_department, v_program
  FROM public.learners_profiles lp
  WHERE lp.id = p_learner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'learner not found: %', p_learner_id;
  END IF;

  RETURN QUERY
  SELECT
    cl.id                                              AS checklist_id,
    cl.name                                            AS checklist_name,
    cl.description                                     AS checklist_desc,
    cl.scope_type                                      AS scope_type,
    -- 2026-05-21 fix: cast to text so varchar columns from institutions/
    -- degrees/departments don't trip 42804 against the text declaration.
    (CASE cl.scope_type
      WHEN 'institution' THEN (SELECT i.name           FROM public.institutions i WHERE i.id = cl.scope_id)
      WHEN 'degree'      THEN (SELECT COALESCE(d.display_name, d.degree_name)        FROM public.degrees      d WHERE d.id = cl.scope_id)
      WHEN 'department'  THEN (SELECT COALESCE(dp.display_name, dp.department_name)  FROM public.departments  dp WHERE dp.id = cl.scope_id)
      WHEN 'program'     THEN (SELECT p.program_name   FROM public.programs     p WHERE p.id = cl.scope_id)
    END)::text                                         AS scope_label,
    it.id                                              AS item_id,
    it.title                                           AS item_title,
    it.description                                     AS item_description,
    it.is_required                                     AS is_required,
    it.order_index                                     AS order_index,
    COALESCE(c.is_done, false)                         AS is_done,
    c.marked_by                                        AS marked_by,
    pr.full_name                                       AS marked_by_name,
    c.marked_at                                        AS marked_at
  FROM public.admission_checklists cl
  JOIN public.admission_checklist_items it
    ON it.checklist_id = cl.id AND it.is_active = true
  LEFT JOIN public.admission_checklist_completions c
    ON c.checklist_item_id = it.id AND c.learner_profile_id = p_learner_id
  LEFT JOIN public.profiles pr
    ON pr.id = c.marked_by
  WHERE cl.is_active = true
    AND (v_lifecycle IS NULL OR v_lifecycle = ANY(cl.applies_to_lifecycle))
    AND (
      (cl.scope_type = 'institution' AND cl.scope_id = v_institution)
      OR (cl.scope_type = 'degree'    AND cl.scope_id = v_degree)
      OR (cl.scope_type = 'department' AND cl.scope_id = v_department)
      OR (cl.scope_type = 'program'   AND cl.scope_id = v_program)
    )
  ORDER BY
    CASE cl.scope_type
      WHEN 'institution' THEN 1
      WHEN 'degree'      THEN 2
      WHEN 'department'  THEN 3
      WHEN 'program'     THEN 4
    END,
    cl.created_at,
    it.order_index,
    it.created_at;
END;
$function$;
