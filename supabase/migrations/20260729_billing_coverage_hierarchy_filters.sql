-- /billing/coverage: degree → department → programme → semester → section filters.
--
-- learners_profiles already carries degree_id, department_id, program_id,
-- semester_id and section_id as uuid FKs; the coverage RPCs simply never
-- exposed them. Both gain five optional uuid params, defaulted NULL so every
-- existing call site keeps working unchanged.
--
-- DROP + CREATE, NOT CREATE OR REPLACE:
--   Postgres keys a function by its argument list, so CREATE OR REPLACE with
--   EXTRA parameters creates an OVERLOAD rather than replacing. With both the
--   14-arg and 19-arg versions present and every new param defaulted, a 14-arg
--   call is AMBIGUOUS -- Postgres raises, and PostgREST answers 300. The old
--   signatures are dropped first so exactly one version exists.
--
-- DROP also discards the grants, so they are restored below. The originals held
-- EXECUTE for PUBLIC (the Postgres default); that is tightened to authenticated
-- + service_role, matching the repo convention and the "SECURITY DEFINER locks
-- anon" CI gate. Both functions self-authorize on billing.coverage.view, so anon
-- could never have got data out of them anyway.

DROP FUNCTION IF EXISTS public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text);

CREATE FUNCTION public.get_billing_coverage_learners(
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_billing_category_id uuid DEFAULT NULL::uuid,
  p_coverage_state text DEFAULT 'not_generated'::text,
  p_include_non_billing_institutions boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_sort_by text DEFAULT NULL::text,
  p_sort_dir text DEFAULT 'asc'::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(out_learner_id uuid, out_roll_number text, out_register_number text, out_full_name text, out_lifecycle_status text, out_gender text, out_institution_id uuid, out_institution_name text, out_program_name text, out_semester_section text, out_academic_year_id uuid, out_academic_year_name text, out_accommodation_type text, out_uses_transport boolean, out_bill_count integer, out_total_billed numeric, out_coverage_state text, out_total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0)
                      * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_asc    boolean := COALESCE(LOWER(p_sort_dir), 'asc') <> 'desc';
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
  ),
  scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.gender,
           lp.lifecycle_status, lp.first_name, lp.last_name,
           lp.roll_number, lp.register_number,
           lp.accommodation_type_id,
           (lp.bus_required IS TRUE OR lp.transport_route_id IS NOT NULL)
             AS uses_transport
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      -- Academic hierarchy. Each level is independent here rather than nested:
      -- a learner row already carries every level, so filtering on the deepest
      -- selected one is sufficient and a mid-level NULL never drops rows.
      AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
      AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
      AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
      AND (p_accommodation_type_ids IS NULL
           OR lp.accommodation_type_id = ANY(p_accommodation_type_ids))
      AND (
        p_gender IS NULL
        OR (p_gender = '__unset__' AND NULLIF(TRIM(lp.gender), '') IS NULL)
        OR (p_gender <> '__unset__'
            AND UPPER(TRIM(lp.gender)) = UPPER(TRIM(p_gender)))
      )
      AND (
        COALESCE(p_transport, 'any') = 'any'
        OR (p_transport = 'bus'
            AND (lp.bus_required IS TRUE OR lp.transport_route_id IS NOT NULL))
        OR (p_transport = 'no_bus'
            AND lp.bus_required IS NOT TRUE AND lp.transport_route_id IS NULL)
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR lp.roll_number ILIKE '%' || p_search || '%'
        OR lp.register_number ILIKE '%' || p_search || '%'
        OR (COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,''))
             ILIKE '%' || p_search || '%'
      )
  ),
  agg AS (
    SELECT s.id AS learner_id,
           COUNT(b.id)::integer AS bill_count,
           COALESCE(SUM(b.final_amount), 0)::numeric AS total_billed
    FROM scope s
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          AND b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id
  ),
  final AS (
    SELECT s.id AS learner_id,
           s.roll_number::text        AS roll_number,
           s.register_number::text    AS register_number,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
                                      AS full_name,
           s.lifecycle_status::text   AS lifecycle_status,
           NULLIF(TRIM(s.gender), '')::text AS gender,
           s.institution_id           AS institution_id,
           i.name::text               AS institution_name,
           p.program_name             AS program_name,
           CASE
             WHEN sem.semester_name IS NULL AND sec.section_name IS NULL
               THEN NULL
             WHEN sec.section_name IS NULL THEN sem.semester_name::text
             WHEN sem.semester_name IS NULL THEN sec.section_name::text
             ELSE sem.semester_name::text || ' · ' || sec.section_name::text
           END                        AS semester_section,
           s.academic_year_id         AS academic_year_id,
           ay.academic_year_name::text AS academic_year_name,
           acc.name::text             AS accommodation_type,
           s.uses_transport           AS uses_transport,
           a.bill_count               AS bill_count,
           a.total_billed             AS total_billed,
           CASE
             WHEN COALESCE(p_academic_year_id, s.academic_year_id) IS NULL
               THEN 'cannot_evaluate'
             WHEN a.bill_count > 0 THEN 'generated'
             ELSE 'not_generated'
           END                        AS coverage_state
    FROM scope s
    JOIN agg a                           ON a.learner_id = s.id
    LEFT JOIN public.institutions        i   ON i.id   = s.institution_id
    LEFT JOIN public.programs            p   ON p.id   = s.program_id
    LEFT JOIN public.semesters           sem ON sem.id = s.semester_id
    LEFT JOIN public.sections            sec ON sec.id = s.section_id
    LEFT JOIN public.academic_years      ay  ON ay.id  = s.academic_year_id
    LEFT JOIN public.accommodation_types acc ON acc.id = s.accommodation_type_id
  ),
  filtered AS (
    SELECT * FROM final f
    WHERE p_coverage_state = 'all' OR f.coverage_state = p_coverage_state
  )
  SELECT f.learner_id, f.roll_number, f.register_number, f.full_name,
         f.lifecycle_status, f.gender, f.institution_id, f.institution_name,
         f.program_name, f.semester_section,
         f.academic_year_id, f.academic_year_name,
         f.accommodation_type, f.uses_transport,
         f.bill_count, f.total_billed, f.coverage_state,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    (CASE WHEN v_asc THEN
       CASE p_sort_by
         WHEN 'full_name'          THEN f.full_name
         WHEN 'roll_number'        THEN f.roll_number
         WHEN 'register_number'    THEN f.register_number
         WHEN 'institution_name'   THEN f.institution_name
         WHEN 'program_name'       THEN f.program_name
         WHEN 'semester_section'   THEN f.semester_section
         WHEN 'academic_year_name' THEN f.academic_year_name
         WHEN 'accommodation_type' THEN f.accommodation_type
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'gender'             THEN f.gender
         WHEN 'coverage_state'     THEN f.coverage_state
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'full_name'          THEN f.full_name
         WHEN 'roll_number'        THEN f.roll_number
         WHEN 'register_number'    THEN f.register_number
         WHEN 'institution_name'   THEN f.institution_name
         WHEN 'program_name'       THEN f.program_name
         WHEN 'semester_section'   THEN f.semester_section
         WHEN 'academic_year_name' THEN f.academic_year_name
         WHEN 'accommodation_type' THEN f.accommodation_type
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'gender'             THEN f.gender
         WHEN 'coverage_state'     THEN f.coverage_state
       END
     END) DESC NULLS LAST,
    (CASE WHEN v_asc THEN
       CASE p_sort_by
         WHEN 'bill_count'   THEN f.bill_count::numeric
         WHEN 'total_billed' THEN f.total_billed
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'bill_count'   THEN f.bill_count::numeric
         WHEN 'total_billed' THEN f.total_billed
       END
     END) DESC NULLS LAST,
    f.institution_name NULLS LAST, f.roll_number NULLS LAST, f.full_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Summary: the KPI cards must narrow with the table, or the counts contradict
-- the rows on screen.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text, text);

CREATE FUNCTION public.get_billing_coverage_summary(
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_billing_category_id uuid DEFAULT NULL::uuid,
  p_include_non_billing_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object(
      'in_scope', 0, 'generated', 0, 'not_generated', 0, 'cannot_evaluate', 0,
      'excluded_institutions', 0, 'excluded_learners', 0,
      'by_institution', '[]'::jsonb);
  END IF;

  WITH billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  all_scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id,
           (lp.institution_id IN (SELECT inst_id FROM billing_inst)) AS is_billing_inst
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
      AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
      AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
      AND (p_accommodation_type_ids IS NULL
           OR lp.accommodation_type_id = ANY(p_accommodation_type_ids))
      AND (
        p_gender IS NULL
        OR (p_gender = '__unset__' AND NULLIF(TRIM(lp.gender), '') IS NULL)
        OR (p_gender <> '__unset__'
            AND UPPER(TRIM(lp.gender)) = UPPER(TRIM(p_gender)))
      )
      AND (
        COALESCE(p_transport, 'any') = 'any'
        OR (p_transport = 'bus'
            AND (lp.bus_required IS TRUE OR lp.transport_route_id IS NOT NULL))
        OR (p_transport = 'no_bus'
            AND lp.bus_required IS NOT TRUE AND lp.transport_route_id IS NULL)
      )
  ),
  scope AS (
    SELECT * FROM all_scope
    WHERE p_include_non_billing_institutions OR is_billing_inst
  ),
  agg AS (
    SELECT s.id, s.institution_id, s.academic_year_id,
           COUNT(b.id)::integer AS bill_count
    FROM scope s
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          AND b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id, s.institution_id, s.academic_year_id
  ),
  stated AS (
    SELECT a.institution_id,
           CASE
             WHEN COALESCE(p_academic_year_id, a.academic_year_id) IS NULL
               THEN 'cannot_evaluate'
             WHEN a.bill_count > 0 THEN 'generated'
             ELSE 'not_generated'
           END AS coverage_state
    FROM agg a
  )
  SELECT jsonb_build_object(
    'in_scope',        (SELECT COUNT(*) FROM stated),
    'generated',       (SELECT COUNT(*) FROM stated WHERE coverage_state = 'generated'),
    'not_generated',   (SELECT COUNT(*) FROM stated WHERE coverage_state = 'not_generated'),
    'cannot_evaluate', (SELECT COUNT(*) FROM stated WHERE coverage_state = 'cannot_evaluate'),
    'excluded_institutions',
      (SELECT COUNT(DISTINCT institution_id) FROM all_scope WHERE NOT is_billing_inst),
    'excluded_learners',
      (SELECT COUNT(*) FROM all_scope WHERE NOT is_billing_inst),
    'by_institution', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'institution_name')
      FROM (
        SELECT jsonb_build_object(
                 'institution_id',   st.institution_id,
                 'institution_name', COALESCE(i.name::text, 'Unknown'),
                 'in_scope',         COUNT(*),
                 'generated',        COUNT(*) FILTER (WHERE st.coverage_state = 'generated'),
                 'not_generated',    COUNT(*) FILTER (WHERE st.coverage_state = 'not_generated')
               ) AS x
        FROM stated st
        LEFT JOIN public.institutions i ON i.id = st.institution_id
        GROUP BY st.institution_id, i.name
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
