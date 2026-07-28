-- Security and parity fixes for leave type assignment scope, from the
-- adversarial review on PR #2282.
--
-- CRITICAL — cross-tenant read. hlta_select ORed
-- user_has_permission('hr.leave.types.manage') with NO organization term, so
-- any holder of that permission could read every tenant's assignment rows —
-- staff ids and per-department entitlements included. hlta_write was scoped;
-- the read path was not.
--
-- This is the THIRD appearance of this shape: 20260721120150 fixed it in
-- generate_hr_leave_balances, 20260722170000 fixed it in hr_comp_off_balance.
-- The rule it keeps violating: a permission check alone is never a tenant
-- boundary — it must be ANDed with organization membership. Worth stating
-- plainly here because the pattern has now cost three fixes.
--
-- HIGH — the coverage preview claimed exact parity with the generator but
-- omitted two of its predicates. generate_hr_leave_balances also filters on
-- applicable_cadre_ids and applicable_gender; without them the preview
-- overstates reach, so a gender-restricted type would report reached > 0 and
-- then write zero balances. No type uses either filter today, which is
-- precisely why the number would have been trusted.
--
-- Verified after applying:
--   Dental staff reading a Pharmacy assignment -> 0 rows
--   student (no staff record, no permission)   -> 0 rows

DROP POLICY IF EXISTS hlta_select ON public.hr_leave_type_assignments;
CREATE POLICY hlta_select ON public.hr_leave_type_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    -- Staff at the owning institution: they may see what applies to them.
    OR hr_organization_id IN (SELECT unnest(public.hr_staff_visible_org_ids()))
    -- Managers: permission AND membership, mirroring hlta_write exactly.
    OR (
      public.user_has_permission('hr.leave.types.manage')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  );

CREATE OR REPLACE FUNCTION public.hr_leave_type_coverage(p_leave_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_org   uuid;
  v_inst  uuid;
  v_count integer;
  v_out   jsonb;
BEGIN
  SELECT t.hr_organization_id, o.institution_id
    INTO v_org, v_inst
  FROM public.hr_leave_types t
  JOIN public.hr_organizations o ON o.id = t.hr_organization_id
  WHERE t.id = p_leave_type_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Unknown leave_type_id %', p_leave_type_id;
  END IF;

  IF NOT public.is_super_admin()
     AND NOT (public.user_has_permission('hr.leave.types.manage')
              AND v_org IN (SELECT unnest(public.fn_my_hr_organization_ids()))) THEN
    RAISE EXCEPTION 'Not authorized to inspect this leave type';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.hr_leave_type_assignments
  WHERE leave_type_id = p_leave_type_id AND is_active;

  WITH lt AS (
    SELECT applicable_cadre_ids, applicable_gender
    FROM public.hr_leave_types WHERE id = p_leave_type_id
  ),
  eligible AS (
    SELECT s.id, s.department_id, m.scope_kind, m.entitled_days
    FROM public.staff s
    CROSS JOIN lt
    -- Needed for the cadre predicate, exactly as the generator joins it.
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN LATERAL (
      SELECT a.entitled_days, a.scope_kind
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = p_leave_type_id
        AND a.is_active
        AND (
             (a.scope_kind = 'staff'      AND a.staff_id      = s.id)
          OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
          OR (a.scope_kind = 'organization')
        )
      ORDER BY CASE a.scope_kind
                 WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
      LIMIT 1
    ) m ON true
    WHERE s.institution_id = v_inst
      AND s.is_active
      AND (v_count = 0 OR m.scope_kind IS NOT NULL)
      -- Mirrors the generator. Kept verbatim rather than paraphrased: if these
      -- two ever disagree again, the generator is right — it writes the rows.
      AND (lt.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(lt.applicable_cadre_ids))
      AND (
        lt.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = lt.applicable_gender
      )
  )
  SELECT jsonb_build_object(
    'assignment_count', v_count,
    'is_org_wide',      (v_count = 0),
    'reached',          (SELECT count(*) FROM eligible),
    'active_staff',     (SELECT count(*) FROM public.staff
                          WHERE institution_id = v_inst AND is_active),
    'by_scope', COALESCE((
      SELECT jsonb_object_agg(k, c) FROM (
        SELECT COALESCE(scope_kind, 'unassigned') AS k, count(*) AS c
        FROM eligible GROUP BY 1
      ) z
    ), '{}'::jsonb),
    'without_department', (
      SELECT count(*) FROM public.staff
      WHERE institution_id = v_inst AND is_active AND department_id IS NULL
    ),
    'has_department_scope', EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments
      WHERE leave_type_id = p_leave_type_id AND is_active AND scope_kind = 'department'
    )
  )
  INTO v_out;

  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_type_coverage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_type_coverage(uuid) TO authenticated;
