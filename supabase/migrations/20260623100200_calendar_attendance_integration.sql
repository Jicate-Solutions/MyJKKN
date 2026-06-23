-- =====================================================================
-- Calendar → attendance integration                                     2026-06-23
-- A global calendar_entries holiday with blocks_attendance=true now blocks
-- attendance (is_date_blocked_by_leave) and is skipped by the HR leave-day
-- counter (hr_calc_leave_days), for institutions in its scope (or all, when
-- scope_institution_ids IS NULL). ADDITIVE: existing institution_leaves logic
-- preserved verbatim (live bodies dumped via pg_get_functiondef first).
-- NOTE: supabase/setup/02_functions.sql mirror intentionally deferred — that
-- file carried a concurrent workstream's uncommitted edits at author time.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_date_blocked_by_leave(
    p_institution_id uuid,
    p_date date,
    p_department_id uuid DEFAULT NULL::uuid,
    p_semester_id uuid DEFAULT NULL::uuid,
    p_section_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(is_blocked boolean, leave_id uuid, leave_name character varying, leave_type_name character varying, color_code character varying)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    -- existing source: institution_leaves (unchanged)
    SELECT
        true AS is_blocked,
        il.id AS leave_id,
        il.leave_name,
        lt.leave_type_name,
        lt.color_code
    FROM public.institution_leaves il
    JOIN public.leave_types lt ON lt.id = il.leave_type_id
    WHERE il.institution_id = p_institution_id
    AND il.status = 'approved'
    AND p_date BETWEEN il.start_date AND il.end_date
    AND (
        il.scope_level = 'institution'
        OR (il.scope_level = 'department' AND p_department_id IS NOT NULL AND p_department_id = ANY(il.department_ids))
        OR (il.scope_level = 'semester' AND p_semester_id IS NOT NULL AND p_semester_id = ANY(il.semester_ids))
        OR (il.scope_level = 'section' AND p_section_id IS NOT NULL AND p_section_id = ANY(il.section_ids))
    )

    UNION ALL
    -- NEW source: global calendar_entries holidays that block attendance
    SELECT
        true,
        ce.id,
        ce.title::varchar,
        COALESCE(cc.name, 'Holiday')::varchar,
        COALESCE(ce.color_code, cc.color_code, '#f59e0b')::varchar
    FROM public.calendar_entries ce
    LEFT JOIN public.calendar_categories cc ON cc.id = ce.category_id
    WHERE ce.kind = 'holiday'
      AND ce.is_active = true
      AND ce.blocks_attendance = true
      AND p_date BETWEEN ce.start_at::date AND ce.end_at::date
      AND (ce.scope_institution_ids IS NULL OR p_institution_id = ANY(ce.scope_institution_ids))

    LIMIT 1;

    -- If no blocking leave found, return is_blocked = false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.is_date_blocked_by_leave IS 'Blocks attendance on approved institution_leaves OR global calendar_entries holidays (blocks_attendance=true)';

CREATE OR REPLACE FUNCTION public.hr_calc_leave_days(
    p_start date,
    p_end date,
    p_duration character varying,
    p_skip_weekends boolean,
    p_skip_holidays boolean,
    p_hr_org uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  days_count numeric := 0;
  cur        date := p_start;
  inst_id    uuid;
BEGIN
  -- Resolve institution for holiday lookup
  SELECT institution_id INTO inst_id FROM hr_organizations WHERE id = p_hr_org;

  -- Fractional types return immediately (decision #5)
  IF p_duration = 'hourly' THEN RETURN 0.125; END IF;
  IF p_duration IN ('first_half', 'second_half') THEN RETURN 0.5; END IF;

  -- Full-day loop: iterate date range
  WHILE cur <= p_end LOOP
    IF p_skip_weekends AND EXTRACT(ISODOW FROM cur) IN (6, 7) THEN
      NULL;
    -- Skip institutional holidays (institution_leaves) OR global calendar holidays
    ELSIF p_skip_holidays AND (
      (inst_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM institution_leaves
        WHERE institution_id = inst_id
          AND cur BETWEEN start_date AND end_date
      ))
      OR EXISTS (
        SELECT 1 FROM calendar_entries ce
        WHERE ce.kind = 'holiday' AND ce.is_active = true AND ce.blocks_attendance = true
          AND cur BETWEEN ce.start_at::date AND ce.end_at::date
          AND (ce.scope_institution_ids IS NULL OR (inst_id IS NOT NULL AND inst_id = ANY(ce.scope_institution_ids)))
      )
    ) THEN
      NULL;
    ELSE
      days_count := days_count + 1;
    END IF;
    cur := cur + 1;
  END LOOP;

  RETURN days_count;
END $function$;
