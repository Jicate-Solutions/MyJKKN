-- Bill Coverage: add accommodation + transport filters.
--
-- WHY TWO FILTERS AND NOT ONE: transport is not an accommodation type.
-- accommodation_types holds exactly four rows (Day Scholar, Hostel, Paying
-- Guest, Not Applicable); transport lives on learners_profiles.bus_required /
-- transport_route_id. The two dimensions OVERLAP — 1,148 of 4,345 day scholars
-- use the bus, and so do 11 hostellers. Folding transport into the
-- accommodation dropdown would present overlapping values as mutually
-- exclusive and make "day scholars who use the bus" unaskable. Transport fees
-- are billed separately (billing_categories.kind = 'transport'), so that
-- combination is exactly the gap accountants need to find.
--
-- MUST DROP FIRST: CREATE OR REPLACE with ADDED parameters creates an
-- OVERLOAD rather than replacing the function, leaving two live signatures and
-- a PostgREST ambiguity error at call time.

DROP FUNCTION IF EXISTS public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean);

-- ---------------------------------------------------------------------------

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
    -- ALL-TIME test, deliberately not scoped to p_academic_year_id.
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
  ),
  scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.lifecycle_status, lp.first_name, lp.last_name,
           lp.roll_number, lp.register_number,
           lp.accommodation_type_id,
           -- A learner counts as using transport when either signal is set:
           -- bus_required is NULL on 3,970 in-scope learners, so relying on it
           -- alone would miss the 1,135 who have a route assigned.
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
    JOIN agg a                          ON a.learner_id = s.id
    LEFT JOIN public.institutions       i   ON i.id   = s.institution_id
    LEFT JOIN public.programs           p   ON p.id   = s.program_id
    LEFT JOIN public.academic_years     ay  ON ay.id  = s.academic_year_id
    LEFT JOIN public.accommodation_types acc ON acc.id = s.accommodation_type_id
  ),
  filtered AS (
    SELECT * FROM final f
    WHERE p_coverage_state = 'all' OR f.coverage_state = p_coverage_state
  )
  SELECT f.learner_id, f.roll_number, f.register_number, f.full_name,
         f.lifecycle_status, f.institution_id, f.institution_name,
         f.program_name, f.academic_year_id, f.academic_year_name,
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

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_billing_coverage_summary(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_include_non_billing_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_transport text DEFAULT 'any'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND (p_accommodation_type_ids IS NULL
           OR lp.accommodation_type_id = ANY(p_accommodation_type_ids))
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
$$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text) TO authenticated;
