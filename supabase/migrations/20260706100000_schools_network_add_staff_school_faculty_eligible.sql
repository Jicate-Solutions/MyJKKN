-- ============================================================================
-- Schools Network — broaden visit-coordinator eligibility to School Facilitators
-- and Staff (Director decision 2026-07-06, follow-up to 20260706090000)
--
-- Director chose the broadest pool: eligible = active school owners +
-- outreach_coordinator + program_lead + faculty + school_faculty + staff.
-- (school_faculty ≈ 2 holders; staff ≈ 200; faculty ≈ 435.) Kept in sync across
-- the picker (list_assignable_owners) AND the server-side guard (assign_visit),
-- both still requiring a `profiles` row so a role-holder without a profile can't
-- be assigned via a crafted POST while being absent from the picker.
--
-- SQL-only: two CREATE OR REPLACE bodies. No UI change (picker layout stays a
-- single searchable list; assign still nudges only when a school slips — Director
-- confirmed both).
-- ============================================================================

-- ─── list_assignable_owners — the assign picker's source ────────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_list_assignable_owners()
RETURNS TABLE(id uuid, full_name text, email text, role_label text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.edit')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.edit'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH people AS (
    -- active school owners / coordinators
    SELECT o.jkkn_user_id AS uid, o.role::text AS r
      FROM public.school_jkkn_owners o
     WHERE o.is_active AND o.jkkn_user_id IS NOT NULL
    UNION
    -- holders of an active coordinator / facilitator / staff role (Director
    -- 2026-07-06: "all senior learners" = facilitators, plus school facilitators
    -- and staff by the broadest-pool choice).
    SELECT ur.user_id AS uid, cr.role_key AS r
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE cr.is_active
       AND cr.role_key IN ('outreach_coordinator', 'program_lead', 'faculty',
                           'school_faculty', 'staff')
  ),
  dedup AS (
    -- one row per person; prefer the most outreach-specific role for the label.
    SELECT uid, (array_agg(r ORDER BY
      CASE r WHEN 'outreach_coordinator' THEN 0
             WHEN 'program_lead'         THEN 1
             WHEN 'faculty'              THEN 2
             WHEN 'school_faculty'       THEN 3
             WHEN 'staff'                THEN 4
             ELSE 5 END))[1] AS r
      FROM people GROUP BY uid
  )
  SELECT p.id, p.full_name, p.email,
         CASE d.r
           WHEN 'outreach_coordinator' THEN 'Outreach Coordinator'
           WHEN 'program_lead'         THEN 'Program Lead'
           WHEN 'faculty'              THEN 'Facilitator'
           WHEN 'school_faculty'       THEN 'School Facilitator'
           WHEN 'staff'                THEN 'Team Member'   -- JKKN: staff → team members
           ELSE initcap(replace(d.r, '_', ' '))
         END AS role_label
    FROM dedup d
    JOIN public.profiles p ON p.id = d.uid
   ORDER BY p.full_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() TO authenticated;

-- ─── assign_visit — server-side eligibility guard, kept in sync with the picker
CREATE OR REPLACE FUNCTION public.fn_schools_network_assign_visit(
  p_school_id   uuid,
  p_assigned_to uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.edit')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.edit'
      USING ERRCODE = '42501';
  END IF;
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'school_id is required';
  END IF;
  -- Only external adopted feeders are on the worklist (institution_id IS NULL).
  IF NOT EXISTS (SELECT 1 FROM public.schools s
                  WHERE s.id = p_school_id AND s.institution_id IS NULL) THEN
    RAISE EXCEPTION 'school not found or not an external feeder school';
  END IF;
  -- Assignee must be an active owner OR hold an active outreach_coordinator /
  -- program_lead / faculty / school_faculty / staff role, AND have a profiles row
  -- (the picker INNER JOINs profiles). MUST stay in sync with
  -- fn_schools_network_list_assignable_owners. NULL clears.
  IF p_assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles pr
        WHERE pr.id = p_assigned_to
          AND (
            EXISTS (SELECT 1 FROM public.school_jkkn_owners o
                     WHERE o.jkkn_user_id = p_assigned_to AND o.is_active)
            OR EXISTS (SELECT 1 FROM public.user_roles ur
                        JOIN public.custom_roles cr ON cr.id = ur.role_id
                       WHERE ur.user_id = p_assigned_to AND cr.is_active
                         AND cr.role_key IN ('outreach_coordinator', 'program_lead',
                                             'faculty', 'school_faculty', 'staff'))
          )
     ) THEN
    RAISE EXCEPTION 'assignee must be an active facilitator, staff member, coordinator, or school owner';
  END IF;

  INSERT INTO public.school_visit_assignments (school_id, assigned_to, assigned_by)
  VALUES (p_school_id, p_assigned_to, auth.uid())
  ON CONFLICT (school_id) DO UPDATE
    SET assigned_to = EXCLUDED.assigned_to,
        assigned_by = auth.uid(),
        updated_at  = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_assign_visit(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_assign_visit(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
