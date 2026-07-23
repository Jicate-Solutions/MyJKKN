-- ============================================================================
-- Programme Checklists — RPCs
-- ----------------------------------------------------------------------------
-- Created: 2026-05-19
-- Purpose:
--   get_learner_checklist(p_learner_id)
--     Resolves the learner's 4-level hierarchy (institution/degree/department/
--     program), UNIONs all active checklists+items where (scope_type,scope_id)
--     matches any ancestor, LEFT JOINs completion state, returns flat rows.
--     SECURITY DEFINER, gated on admission.enquiries.checklist.view.
--
--   mark_checklist_item(p_learner_id, p_item_id, p_is_done)
--     Upsert into admission_checklist_completions. Bypasses the table's
--     write-policy-absence by being SECURITY DEFINER. Gated on
--     admission.enquiries.checklist.mark. Also logs an activity row so the
--     mark is visible on the Activities timeline.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_learner_checklist(p_learner_id uuid)
RETURNS TABLE (
  checklist_id      uuid,
  checklist_name    text,
  checklist_desc    text,
  scope_type        text,
  scope_label       text,
  item_id           uuid,
  item_title        text,
  item_description  text,
  is_required       boolean,
  order_index       int,
  is_done           boolean,
  marked_by         uuid,
  marked_by_name    text,
  marked_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lifecycle    text;
  v_institution  uuid;
  v_degree       uuid;
  v_department   uuid;
  v_program      uuid;
BEGIN
  -- Permission gate. Uses the catalog key directly per
  -- feedback_rpc_perm_gate_must_use_catalog_key.
  IF NOT public.user_has_permission('admission.enquiries.checklist.view') THEN
    RAISE EXCEPTION 'permission denied: admission.enquiries.checklist.view';
  END IF;

  -- Resolve the learner's hierarchy in one shot.
  SELECT
    lp.lifecycle_status,
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
    CASE cl.scope_type
      WHEN 'institution' THEN (SELECT i.name           FROM public.institutions i WHERE i.id = cl.scope_id)
      WHEN 'degree'      THEN (SELECT COALESCE(d.display_name, d.degree_name)        FROM public.degrees      d WHERE d.id = cl.scope_id)
      WHEN 'department'  THEN (SELECT COALESCE(dp.display_name, dp.department_name)  FROM public.departments  dp WHERE dp.id = cl.scope_id)
      WHEN 'program'     THEN (SELECT p.program_name   FROM public.programs     p WHERE p.id = cl.scope_id)
    END                                                AS scope_label,
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
    AND (v_lifecycle IS NULL OR v_lifecycle::text = ANY(cl.applies_to_lifecycle))
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
$$;

REVOKE ALL ON FUNCTION public.get_learner_checklist(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_learner_checklist(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- mark_checklist_item — toggle a completion row + emit audit activity
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_checklist_item(
  p_learner_id uuid,
  p_item_id    uuid,
  p_is_done    boolean
)
RETURNS public.admission_checklist_completions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.admission_checklist_completions;
  v_uid     uuid := auth.uid();
  v_lead_id uuid;
  v_title   text;
BEGIN
  IF NOT public.user_has_permission('admission.enquiries.checklist.mark') THEN
    RAISE EXCEPTION 'permission denied: admission.enquiries.checklist.mark';
  END IF;

  IF p_is_done THEN
    -- Upsert as done. UNIQUE constraint on (learner_profile_id, checklist_item_id)
    -- guarantees one row per pair.
    INSERT INTO public.admission_checklist_completions
      (learner_profile_id, checklist_item_id, is_done, marked_by, marked_at)
    VALUES
      (p_learner_id, p_item_id, true, v_uid, now())
    ON CONFLICT (learner_profile_id, checklist_item_id)
    DO UPDATE SET
      is_done   = true,
      marked_by = v_uid,
      marked_at = now()
    RETURNING * INTO v_row;
  ELSE
    -- Unmark: hard-delete the row so the item shows pending again.
    -- This is cleaner than is_done=false because the get_learner_checklist
    -- COALESCE(c.is_done, false) presents both equivalently.
    DELETE FROM public.admission_checklist_completions
    WHERE learner_profile_id = p_learner_id
      AND checklist_item_id  = p_item_id
    RETURNING * INTO v_row;
  END IF;

  -- Best-effort audit activity. The lead row may not exist for an enquiry
  -- still in 'lead' lifecycle; if so, skip the activity log silently.
  SELECT al.id, ci.title
    INTO v_lead_id, v_title
  FROM public.admission_checklist_items ci
  LEFT JOIN public.admission_leads al ON al.learner_profile_id = p_learner_id
  WHERE ci.id = p_item_id;

  IF v_lead_id IS NOT NULL THEN
    INSERT INTO public.admission_lead_activities (
      lead_id,
      activity_type,
      subject,
      description,
      created_by,
      created_at
    ) VALUES (
      v_lead_id,
      'checklist_marked',
      CASE WHEN p_is_done THEN 'Checklist item marked done' ELSE 'Checklist item un-marked' END,
      COALESCE(v_title, 'Checklist item'),
      v_uid,
      now()
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_checklist_item(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_checklist_item(uuid, uuid, boolean) TO authenticated;
