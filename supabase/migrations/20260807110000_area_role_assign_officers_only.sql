-- Migration: assigning a department role holder is an OFFICER action (CEO / CAO / EAO)
-- Created: 2026-07-28
-- Holders now live in hr_additional_roles — institution-wide org data, not a note on a
-- playbook. Naming someone "Head of Admissions" therefore asserts something beyond the
-- improvement board, so the authority to write it moves up: only the Chief Executive
-- Officer, Chief Administrative Officer and Executive Administrative Officer may assign
-- or clear a holder. Board managers keep READ (they must see holders to review a
-- playbook) but can no longer change them.
-- Gated on a PERMISSION KEY, never a hardcoded role name (project rule), so Role
-- Management stays the single source of truth for who holds the authority.
-- Follow-up to 20260807100000_dept_role_assignments_on_hr_additional_roles.sql, which
-- shipped with the looser improvement.board.manage guard.
-- ============================================================================

-- 1) Grant the new permission to the three offices (flat key — custom_roles.permissions
--    stores keys flat). Idempotent.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('improvement.area_role.assign', true),
    updated_at  = now()
WHERE role_key IN ('ceo', 'cao', 'executive_admin_officer');

-- 2) Split the single FOR ALL policy into READ vs WRITE. The org-scoped branch is
--    unchanged in both, so existing HR behaviour is untouched.
DROP POLICY IF EXISTS hr_add_roles_tenant_isolation ON public.hr_additional_roles;

CREATE POLICY hr_add_roles_read ON public.hr_additional_roles
FOR SELECT USING (
  (hr_organization_id IS NOT NULL AND hr_organization_id = public.auth_hr_organization_id())
  OR (improvement_area_id IS NOT NULL
      AND (public.user_has_permission('improvement.board.manage')
        OR public.user_has_permission('improvement.area_role.assign')
        OR public.is_admin()))
  OR COALESCE(public.is_super_admin(), false)
);

CREATE POLICY hr_add_roles_write_insert ON public.hr_additional_roles
FOR INSERT WITH CHECK (
  (hr_organization_id IS NOT NULL AND hr_organization_id = public.auth_hr_organization_id())
  OR (improvement_area_id IS NOT NULL AND public.user_has_permission('improvement.area_role.assign'))
  OR COALESCE(public.is_super_admin(), false)
);

CREATE POLICY hr_add_roles_write_update ON public.hr_additional_roles
FOR UPDATE USING (
  (hr_organization_id IS NOT NULL AND hr_organization_id = public.auth_hr_organization_id())
  OR (improvement_area_id IS NOT NULL AND public.user_has_permission('improvement.area_role.assign'))
  OR COALESCE(public.is_super_admin(), false)
) WITH CHECK (
  (hr_organization_id IS NOT NULL AND hr_organization_id = public.auth_hr_organization_id())
  OR (improvement_area_id IS NOT NULL AND public.user_has_permission('improvement.area_role.assign'))
  OR COALESCE(public.is_super_admin(), false)
);

CREATE POLICY hr_add_roles_write_delete ON public.hr_additional_roles
FOR DELETE USING (
  (hr_organization_id IS NOT NULL AND hr_organization_id = public.auth_hr_organization_id())
  OR (improvement_area_id IS NOT NULL AND public.user_has_permission('improvement.area_role.assign'))
  OR COALESCE(public.is_super_admin(), false)
);

-- 3) Re-guard the three RPCs. Bodies are byte-identical to the migration above except
--    for the authorization block; _sync returns 0 rather than raising, so a board
--    manager approving a playbook is never interrupted — it simply syncs nothing.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignment_set(
  p_area_id     uuid,
  p_role_type   text,
  p_staff_id    uuid DEFAULT NULL,
  p_holder_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       uuid;
  v_role     text;
  v_note     text;
  v_cur_id   uuid;
  v_cur_sid  uuid;
  v_cur_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: requires improvement.area_role.assign (CEO / CAO / EAO)';
  END IF;

  v_role := btrim(COALESCE(p_role_type, ''));
  v_note := NULLIF(btrim(COALESCE(p_holder_note, '')), '');

  IF v_role = '' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: role_type is required';
  END IF;
  IF p_staff_id IS NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: a holder is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such improvement_area %', p_area_id;
  END IF;
  IF p_staff_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_staff_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such team member %', p_staff_id;
  END IF;

  SELECT id, staff_id, notes INTO v_cur_id, v_cur_sid, v_cur_note
  FROM public.hr_additional_roles
  WHERE improvement_area_id = p_area_id
    AND lower(btrim(role_type)) = lower(v_role)
    AND is_current
  FOR UPDATE;

  -- Same holder already standing: refresh the label/name only.
  IF v_cur_id IS NOT NULL
     AND v_cur_sid IS NOT DISTINCT FROM p_staff_id
     AND v_cur_note IS NOT DISTINCT FROM v_note THEN
    UPDATE public.hr_additional_roles
    SET role_type = v_role, updated_at = now()
    WHERE id = v_cur_id;
    RETURN v_cur_id;
  END IF;

  -- Handover: close the standing assignment, then open a new one.
  IF v_cur_id IS NOT NULL THEN
    UPDATE public.hr_additional_roles
    SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
    WHERE id = v_cur_id;
  END IF;

  INSERT INTO public.hr_additional_roles (
    improvement_area_id, hr_organization_id, role_type, role_category,
    staff_id, hr_employee_id, notes,
    start_date, end_date, is_current, assigned_by
  ) VALUES (
    p_area_id, NULL, v_role, 'Department Playbook',
    p_staff_id, NULL, v_note,
    CURRENT_DATE, NULL, true, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) TO authenticated;

-- 8) RPC — clear one assignment (end-date it; history is kept) ──────────────
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignment_clear(
  p_area_id   uuid,
  p_role_type text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_clear: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_clear: requires improvement.area_role.assign (CEO / CAO / EAO)';
  END IF;

  UPDATE public.hr_additional_roles
  SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
  WHERE improvement_area_id = p_area_id
    AND lower(btrim(role_type)) = lower(btrim(COALESCE(p_role_type, '')))
    AND is_current;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_clear(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_clear(uuid, text) TO authenticated;

-- 9) RPC — sync the whole organogram in one call ───────────────────────────
-- p_assignments: jsonb array of {role_type, staff_id, holder_note}. Entries with
-- no holder are skipped, and any standing area assignment whose role is no longer
-- in the organogram is end-dated. One call so an approve cannot leave a
-- department half-assigned.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignments_sync(
  p_area_id     uuid,
  p_assignments jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   jsonb;
  v_role  text;
  v_note  text;
  v_sid   uuid;
  v_keep  text[] := ARRAY[]::text[];
  v_kept  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RETURN 0;  -- caller may approve playbooks but not assign holders; sync is a no-op for them
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: no such improvement_area %', p_area_id;
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: p_assignments must be a jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    v_role := btrim(COALESCE(v_row->>'role_type', ''));
    v_note := NULLIF(btrim(COALESCE(v_row->>'holder_note', '')), '');
    BEGIN
      v_sid := NULLIF(btrim(COALESCE(v_row->>'staff_id', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_sid := NULL;
    END;

    CONTINUE WHEN v_role = '';
    -- A team member who no longer exists cannot be linked; keep any typed name.
    IF v_sid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_sid) THEN
      v_sid := NULL;
    END IF;
    -- Nobody named yet for this role — nothing to remember.
    CONTINUE WHEN v_sid IS NULL AND v_note IS NULL;
    -- A duplicated role title in the same organogram: first entry wins.
    CONTINUE WHEN lower(v_role) = ANY (v_keep);

    v_keep := v_keep || lower(v_role);
    v_kept := v_kept + 1;
    PERFORM public.fn_mba_dept_role_assignment_set(p_area_id, v_role, v_sid, v_note);
  END LOOP;

  -- End assignments for roles the organogram no longer carries (or that were
  -- cleared back to "nobody yet"). History rows are untouched.
  UPDATE public.hr_additional_roles
  SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
  WHERE improvement_area_id = p_area_id
    AND is_current
    AND NOT (lower(btrim(role_type)) = ANY (v_keep));

  RETURN v_kept;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) TO authenticated;
