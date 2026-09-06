-- Bill Coverage: add a combined "Semester · Section" column.
--
-- Combined in SQL rather than in the React table so the grid and the Excel
-- export share one definition and cannot drift apart.
--
-- Partial data is the norm, not the exception: of 5,209 in-scope learners,
-- 5,189 have a semester, 4,702 have a section, and only 4,686 have both. The
-- CASE below therefore handles all four combinations explicitly - naive
-- concatenation would render a dangling separator ("3 Year · ") for the 503
-- learners who have a semester but no section.
--
-- MUST DROP FIRST: CREATE OR REPLACE cannot change a function's return type,
-- and this adds out_semester_section to RETURNS TABLE.

DROP FUNCTION IF EXISTS public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer, uuid[], text);

CREATE OR REPLACE FUNCTION public.get_billing_coverage_learners(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_coverage_state text DEFAULT 'not_generated',
  p_include_non_billing_institutions boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_transport text DEFAULT 'any'
)
RETURNS TABLE (
  out_learner_id uuid,
  out_roll_number text,
  out_register_number text,
  out_full_name text,
  out_lifecycle_status text,
  out_institution_id uuid,
  out_institution_name text,
  out_program_name text,
  out_semester_section text,
  out_academic_year_id uuid,
  out_academic_year_name text,
  out_accommodation_type text,
  out_uses_transport boolean,
  out_bill_count integer,
  out_total_billed numeric,
  out_coverage_state text,
  out_total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst   uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0)
                      * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
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
           lp.semester_id, lp.section_id,
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
      AND (p_accommodation_type_ids IS NULL
           OR lp.accommodation_type_id = ANY(p_accommodation_type_ids))
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
           s.institution_id           AS institution_id,
           i.name::text               AS institution_name,
           p.program_name             AS program_name,
           -- All four combinations handled explicitly; 503 in-scope learners
           -- have a semester but no section.
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
         f.lifecycle_status, f.institution_id, f.institution_name,
         f.program_name, f.semester_section,
         f.academic_year_id, f.academic_year_name,
         f.accommodation_type, f.uses_transport,
         f.bill_count, f.total_billed, f.coverage_state,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY f.institution_name NULLS LAST, f.roll_number NULLS LAST, f.full_name
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer, uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
