-- ============================================================================
-- Schools Network — facilitators (senior learners) are eligible visit coordinators
-- 2026-07-06
--
-- Director directive: "All senior learners could become the coordinators, so all
-- of them should populate while setting up the coordinators." In JKKN terminology
-- (Director ruling 2026-06-29) a "senior learner" IS a learning facilitator — the
-- `faculty` custom role (labelled "Facilitator"), NOT a senior student. There are
-- ~435 faculty vs 0 outreach_coordinator/program_lead holders today, so this is
-- what actually populates the previously-empty assign picker.
--
-- This BROADENS the earlier "coordinators & owners only" rule: the eligible pool
-- is now active school owners + outreach_coordinator + program_lead + faculty.
-- Deliberately NOT included: `school_faculty` ("School Facilitator" — a distinct,
-- possibly-external role) and `staff` (the Director declined "any staff"); widen
-- the IN(...) lists below if that changes.
--
-- SQL-only: replaces two RPC bodies. No UI change — the picker already fetches
-- fn_schools_network_list_assignable_owners and now simply gets more rows.
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
    -- staff holding an active outreach_coordinator / program_lead role OR the
    -- faculty role ("Facilitator" = senior learner; Director 2026-07-06).
    SELECT ur.user_id AS uid, cr.role_key AS r
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE cr.is_active
       AND cr.role_key IN ('outreach_coordinator', 'program_lead', 'faculty')
  ),
  dedup AS (
    -- one row per person; prefer outreach_coordinator, then program_lead, then
    -- faculty, then anything else.
    SELECT uid, (array_agg(r ORDER BY
      CASE r WHEN 'outreach_coordinator' THEN 0
             WHEN 'program_lead'         THEN 1
             WHEN 'faculty'              THEN 2
             ELSE 3 END))[1] AS r
      FROM people GROUP BY uid
  )
  SELECT p.id, p.full_name, p.email,
         CASE d.r
           WHEN 'outreach_coordinator' THEN 'Outreach Coordinator'
           WHEN 'program_lead'         THEN 'Program Lead'
           WHEN 'faculty'              THEN 'Facilitator'
           ELSE initcap(replace(d.r, '_', ' '))
         END AS role_label
    FROM dedup d
    JOIN public.profiles p ON p.id = d.uid
   ORDER BY p.full_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() TO authenticated;

-- ─── assign_visit — server-side eligibility guard must match the picker ──────
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
  -- Only external adopted feeders are on the worklist (institution_id IS NULL);
  -- reject an internal/JKKN-own school so it can't get a never-nudged assignment.
  IF NOT EXISTS (SELECT 1 FROM public.schools s
                  WHERE s.id = p_school_id AND s.institution_id IS NULL) THEN
    RAISE EXCEPTION 'school not found or not an external feeder school';
  END IF;
  -- Assignee must be an active school owner OR hold an active outreach_coordinator
  -- / program_lead / faculty (Facilitator = senior learner) role — MUST stay in
  -- sync with fn_schools_network_list_assignable_owners. NULL clears.
  -- The `profiles` row is required too: the picker INNER JOINs profiles, so a
  -- role-holder with no profiles row would pass this guard yet never appear in the
  -- picker — requiring profiles here keeps guard and picker in exact sync.
  -- NOTE (org-wide by Director directive 2026-07-06): the faculty pool is global,
  -- NOT institution-scoped — "all senior learners" are eligible for any (org-wide,
  -- external) feeder school. user_roles has no grant-level is_active/expires_at
  -- column, so an active `cr.is_active` role is the grant (revocation = row delete).
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
                         AND cr.role_key IN ('outreach_coordinator', 'program_lead', 'faculty'))
          )
     ) THEN
    RAISE EXCEPTION 'assignee must be an active facilitator, outreach coordinator, or school owner';
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
