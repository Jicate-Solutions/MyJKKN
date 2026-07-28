-- Teach the balance generator about assignment scope.
--
-- Rebuilt from 20260722110000 (the honest-dry-run revision), NOT from an
-- earlier one — replacing an older body would silently drop both the
-- role_has_institution_access cross-tenant check and the dry-run conflict
-- probe.
--
-- Eligibility: a type with NO active assignments stays organization-wide, so
-- all 66 existing types are unaffected. Once a type HAS assignments, only
-- staff matching one of them receive it.
--
-- Entitlement precedence: assignment override > cadre entitlement > type
-- default. The assignment override may legitimately be 0, so the check is
-- IS NOT NULL rather than a truthiness test.
--
-- The per-pair resolution is a LATERAL, not a function call: this loop runs
-- over roughly (active staff x active types) per organization, and a per-row
-- PL/pgSQL call there is a needless round trip.
--
-- Verified against production before cleanup, on JKKN College of Pharmacy:
--   no assignments        -> 75 of 75 reached, is_org_wide true
--   +department (15 days) -> 19 reached, all via 'department'
--   +staff (20 days) on someone inside that department
--    and +staff (8 days) on someone outside it
--                         -> 20 reached; by_scope staff 2, department 18
--   resolved entitlements -> MEENA 20 (staff beats department 15),
--                            SENTHIL 8 (eligible though outside the dept),
--                            18 others 15, rest of org not reached

CREATE OR REPLACE FUNCTION public.generate_hr_leave_balances(
  p_hr_org_id        uuid,
  p_academic_year_id uuid,
  p_dry_run          boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  jsonb   := '[]'::jsonb;
  v_inst_id   uuid;
  v_prior_ay  uuid;
  v_start     date;
  r           record;
BEGIN
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT institution_id INTO v_inst_id FROM public.hr_organizations WHERE id = p_hr_org_id;
  IF v_inst_id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  IF NOT public.role_has_institution_access(v_inst_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst_id;
  END IF;

  SELECT start_date INTO v_start FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Unknown academic_year_id %', p_academic_year_id;
  END IF;

  SELECT id INTO v_prior_ay
  FROM public.academic_years
  WHERE institution_id = v_inst_id AND end_date < v_start
  ORDER BY end_date DESC
  LIMIT 1;

  FOR r IN
    SELECT
      s.id  AS staff_id,
      s.staff_id AS staff_code,
      s.first_name,
      s.last_name,
      d.cadre_id,
      t.id  AS leave_type_id,
      t.default_entitled_days,
      t.allow_carry_forward,
      t.max_carry_forward_days,
      e.entitled_days AS cadre_entitled,
      asg.n           AS assignment_count,
      m.entitled_days AS assigned_entitled,
      m.scope_kind    AS assigned_scope
    FROM public.staff s
    CROSS JOIN public.hr_leave_types t
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN public.hr_leave_type_entitlements e
           ON e.leave_type_id = t.id AND e.cadre_id = d.cadre_id
    -- Does this type restrict itself at all?
    LEFT JOIN LATERAL (
      SELECT count(*) AS n
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id AND a.is_active
    ) asg ON true
    -- Most specific assignment matching this person: staff > dept > org.
    LEFT JOIN LATERAL (
      SELECT a.entitled_days, a.scope_kind
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id
        AND a.is_active
        AND (
             (a.scope_kind = 'staff'        AND a.staff_id      = s.id)
          OR (a.scope_kind = 'department'   AND a.department_id = s.department_id)
          OR (a.scope_kind = 'organization')
        )
      ORDER BY CASE a.scope_kind
                 WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
      LIMIT 1
    ) m ON true
    WHERE s.institution_id = v_inst_id
      AND s.is_active
      AND t.hr_organization_id = p_hr_org_id
      AND t.is_active
      -- Unassigned type = organization-wide (backward compatible).
      -- Assigned type = only those the assignment reaches.
      AND (asg.n = 0 OR m.scope_kind IS NOT NULL)
      AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
      AND (
        t.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = t.applicable_gender
      )
  LOOP
    DECLARE
      v_entitled numeric;
      v_carried  numeric := 0;
      v_written  boolean := false;
    BEGIN
      -- IS NOT NULL, not COALESCE-truthiness: an override of 0 is a real
      -- decision ("eligible, but no days"), not an absent one.
      v_entitled := CASE
        WHEN r.assigned_entitled IS NOT NULL THEN r.assigned_entitled
        WHEN r.cadre_entitled    IS NOT NULL THEN r.cadre_entitled
        ELSE r.default_entitled_days
      END;

      IF r.allow_carry_forward AND v_prior_ay IS NOT NULL THEN
        SELECT GREATEST(0, (b.entitled + b.carried_forward - b.used))
          INTO v_carried
        FROM public.hr_leave_balances b
        WHERE b.employee_id      = r.staff_id
          AND b.leave_type_id    = r.leave_type_id
          AND b.academic_year_id = v_prior_ay;

        v_carried := COALESCE(v_carried, 0);
        IF r.max_carry_forward_days IS NOT NULL THEN
          v_carried := LEAST(v_carried, r.max_carry_forward_days);
        END IF;
      END IF;

      IF p_dry_run THEN
        IF EXISTS (
          SELECT 1 FROM public.hr_leave_balances b
          WHERE b.employee_id      = r.staff_id
            AND b.leave_type_id    = r.leave_type_id
            AND b.academic_year_id = p_academic_year_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_created := v_created + 1;
          v_written := true;
        END IF;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, academic_year_id) DO NOTHING;

        IF FOUND THEN
          v_created := v_created + 1;
          v_written := true;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

      -- Report only rows that fell all the way through to the type default.
      -- An assignment override is a deliberate figure, not a fallback.
      IF v_written
         AND r.assigned_entitled IS NULL
         AND r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',       p_dry_run,
    'created',       v_created,
    'skipped',       v_skipped,
    'prior_year_id', v_prior_ay,
    'fallback_count', jsonb_array_length(v_fallback),
    'fallback',      v_fallback
  );
END $fn$;

REVOKE ALL ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) TO authenticated;
