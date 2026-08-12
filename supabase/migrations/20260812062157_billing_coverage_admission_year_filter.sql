-- ============================================================================
-- Bill Coverage: admission year (cohort) filter
-- ============================================================================
-- Adds p_admission_year to all three coverage RPCs so the page can be narrowed
-- to a single admission cohort ("the 2025 batch"), and surfaces that cohort as
-- a column on the learners list.
--
-- WHY AN INTEGER AND NOT AN admission_year_id UUID
-- admission_years holds one row per (institution, year) — cohort 2026 exists 11
-- times, once per college, each with its own id. A uuid parameter would
-- therefore only be meaningful once an institution had been picked, exactly the
-- limitation that already forces the Academic Year filter to disable itself in
-- "All accessible institutions" mode. admission_years.year is a plain integer
-- and is the same value in every institution, so filtering on it composes with
-- the default multi-institution scope. This matches how the group dashboard
-- already presents cohorts (hooks/admission/use-group-admission-years.ts dedupes
-- the rows by year).
--
-- DISTINCT FROM p_academic_year_id
-- p_academic_year_id is the year coverage is MEASURED against and never filters
-- which learners appear (see 20260808120000). p_admission_year is the opposite:
-- it is purely a population filter and has no bearing on which bills count.
--
-- WHY DROP AND RECREATE
-- CREATE OR REPLACE with a different argument count does not replace — it adds a
-- second overload, and PostgREST then fails every call with PGRST203. Dropping
-- discards the ACL (EXECUTE reverts to PUBLIC, which includes anon), so the
-- REVOKE/GRANT pairs at the end of each block are load-bearing, not decoration.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid);

DROP FUNCTION IF EXISTS public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid);

DROP FUNCTION IF EXISTS public.get_billing_coverage_learner_bills(
  uuid, uuid[], text[], uuid, text, boolean, text, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer);

-- ── Learners list ──────────────────────────────────────────────────────────
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
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer
)
RETURNS TABLE(
  out_learner_id uuid, out_roll_number text, out_register_number text,
  out_full_name text, out_lifecycle_status text, out_gender text,
  out_institution_id uuid, out_institution_name text, out_program_name text,
  out_semester_section text, out_academic_year_id uuid,
  out_academic_year_name text, out_admission_year integer,
  out_accommodation_type text, out_uses_transport boolean,
  out_bill_count integer, out_total_billed numeric, out_total_paid numeric,
  out_coverage_state text, out_target_academic_year_name text,
  out_total_count bigint
)
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
  -- Name of an explicitly picked year, so the reported target reflects the
  -- caller's choice rather than the institution's current year.
  v_picked_ay_name text;
  -- Every admission_years id, across ALL institutions, for the requested cohort.
  -- Resolved once here rather than as a correlated subquery per learner.
  v_adm_year_ids uuid[];
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

  SELECT ay.academic_year_name::text INTO v_picked_ay_name
  FROM public.academic_years ay WHERE ay.id = p_academic_year_id;

  -- Left NULL when no cohort is requested. When a cohort is requested but no
  -- admission_years row carries that year, the array stays NULL and
  -- `= ANY(NULL)` evaluates to NULL, which correctly matches no learner.
  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr
    WHERE ayr.year = p_admission_year;
  END IF;

  RETURN QUERY
  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id, t.target_ay_name
    FROM public.fn_billing_coverage_target_years() t
  ),
  billing_inst AS (
    -- ALL-TIME test, deliberately not scoped to p_academic_year_id. An
    -- institution that billed last year and has generated nothing this year is
    -- the case this report exists to catch; scoping here would hide it.
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
  ),
  scope AS (
    -- NOTE: no lp.academic_year_id predicate. p_academic_year_id selects the
    -- year being MEASURED, never the learners being measured — see
    -- 20260808120000_billing_coverage_target_academic_year.sql.
    -- p_admission_year is the exception: a cohort IS a population.
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.gender,
           lp.lifecycle_status, lp.first_name, lp.last_name,
           lp.roll_number, lp.register_number,
           lp.accommodation_type_id, lp.admission_year_id,
           (lp.bus_required IS TRUE OR lp.transport_route_id IS NOT NULL)
             AS uses_transport
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
      AND (p_admission_year IS NULL
           OR lp.admission_year_id = ANY(v_adm_year_ids))
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
           ty.target_ay_id,
           ty.target_ay_name,
           COUNT(b.id)::integer AS bill_count,
           COALESCE(SUM(b.final_amount), 0)::numeric AS total_billed,
           -- Same expression as get_billing_coverage_learner_bills, over the
           -- same join — the XLS and the PDF must never disagree. A learner
           -- with no live bill sums to NULL and lands on 0, matching the 0 they
           -- already show for total_billed.
           COALESCE(
             SUM(b.final_amount - COALESCE(b.balance_amount, 0)), 0
           )::numeric AS total_paid
    FROM scope s
    LEFT JOIN target_year ty ON ty.institution_id = s.institution_id
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          -- A cancelled or superseded bill is not coverage: no live bill exists.
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          -- The bill's OWN year against the target year. Was s.academic_year_id.
          AND b.academic_year_id = COALESCE(p_academic_year_id, ty.target_ay_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id, ty.target_ay_id, ty.target_ay_name
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
           -- The learner's OWN year, shown for context. It is no longer what
           -- coverage is measured against; target_academic_year_name is.
           s.academic_year_id         AS academic_year_id,
           ay.academic_year_name::text AS academic_year_name,
           -- The cohort the learner was admitted in. Independent of both years
           -- above: it never rolls over, so it is the only stable way to read a
           -- row as "first-year intake" vs "continuing".
           adm.year                   AS admission_year,
           acc.name::text             AS accommodation_type,
           s.uses_transport           AS uses_transport,
           a.bill_count               AS bill_count,
           a.total_billed             AS total_billed,
           a.total_paid               AS total_paid,
           CASE
             -- Only when NO year can be resolved at all: an institution with no
             -- active year that has started yet. Never a mere mismatch.
             WHEN COALESCE(p_academic_year_id, a.target_ay_id) IS NULL
               THEN 'cannot_evaluate'
             WHEN a.bill_count > 0 THEN 'generated'
             ELSE 'not_generated'
           END                        AS coverage_state,
           COALESCE(v_picked_ay_name, a.target_ay_name)
                                      AS target_academic_year_name
    FROM scope s
    JOIN agg a                           ON a.learner_id = s.id
    LEFT JOIN public.institutions        i   ON i.id   = s.institution_id
    LEFT JOIN public.programs            p   ON p.id   = s.program_id
    LEFT JOIN public.semesters           sem ON sem.id = s.semester_id
    LEFT JOIN public.sections            sec ON sec.id = s.section_id
    LEFT JOIN public.academic_years      ay  ON ay.id  = s.academic_year_id
    LEFT JOIN public.admission_years     adm ON adm.id = s.admission_year_id
    LEFT JOIN public.accommodation_types acc ON acc.id = s.accommodation_type_id
  ),
  filtered AS (
    SELECT * FROM final f
    WHERE p_coverage_state = 'all' OR f.coverage_state = p_coverage_state
  )
  SELECT f.learner_id, f.roll_number, f.register_number, f.full_name,
         f.lifecycle_status, f.gender, f.institution_id, f.institution_name,
         f.program_name, f.semester_section,
         f.academic_year_id, f.academic_year_name, f.admission_year,
         f.accommodation_type, f.uses_transport,
         f.bill_count, f.total_billed, f.total_paid, f.coverage_state,
         f.target_academic_year_name,
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
         WHEN 'bill_count'     THEN f.bill_count::numeric
         WHEN 'total_billed'   THEN f.total_billed
         WHEN 'total_paid'     THEN f.total_paid
         WHEN 'admission_year' THEN f.admission_year::numeric
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'bill_count'     THEN f.bill_count::numeric
         WHEN 'total_billed'   THEN f.total_billed
         WHEN 'total_paid'     THEN f.total_paid
         WHEN 'admission_year' THEN f.admission_year::numeric
       END
     END) DESC NULLS LAST,
    f.institution_name NULLS LAST, f.roll_number NULLS LAST, f.full_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid, integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid, integer)
  TO authenticated, service_role;

-- ── Summary (KPI cards) ────────────────────────────────────────────────────
-- The same predicate has to land here or the cards would count a wider
-- population than the table below them shows.
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
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst         uuid[];
  v_adm_year_ids uuid[];
  v_result       jsonb;
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

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr
    WHERE ayr.year = p_admission_year;
  END IF;

  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id
    FROM public.fn_billing_coverage_target_years() t
  ),
  billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  all_scope AS (
    -- No lp.academic_year_id predicate — see get_billing_coverage_learners.
    SELECT lp.id, lp.institution_id,
           (lp.institution_id IN (SELECT inst_id FROM billing_inst)) AS is_billing_inst
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_admission_year IS NULL
           OR lp.admission_year_id = ANY(v_adm_year_ids))
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
    SELECT s.id, s.institution_id, ty.target_ay_id,
           COUNT(b.id)::integer AS bill_count
    FROM scope s
    LEFT JOIN target_year ty ON ty.institution_id = s.institution_id
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          AND b.academic_year_id = COALESCE(p_academic_year_id, ty.target_ay_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id, s.institution_id, ty.target_ay_id
  ),
  stated AS (
    SELECT a.institution_id,
           CASE
             WHEN COALESCE(p_academic_year_id, a.target_ay_id) IS NULL
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
  uuid, uuid, uuid, uuid, uuid, integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer)
  TO authenticated, service_role;

-- ── Per-learner bill detail (PDF export) ───────────────────────────────────
CREATE FUNCTION public.get_billing_coverage_learner_bills(
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_billing_category_id uuid DEFAULT NULL::uuid,
  p_coverage_state text DEFAULT 'all'::text,
  p_include_non_billing_institutions boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_max_learners integer DEFAULT 1000,
  p_admission_year integer DEFAULT NULL::integer
)
RETURNS TABLE(
  out_learner_id uuid, out_roll_number text, out_register_number text,
  out_full_name text, out_institution_name text, out_program_name text,
  out_semester_section text, out_lifecycle_status text,
  out_learner_total numeric, out_learner_paid numeric,
  out_learner_pending numeric, out_bill_id uuid, out_bill_description text,
  out_category_name text, out_bill_academic_year text, out_due_date date,
  out_bill_status text, out_total_amount numeric, out_paid_amount numeric,
  out_pending_amount numeric, out_learner_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst         uuid[];
  v_adm_year_ids uuid[];
  v_cap          integer := LEAST(GREATEST(COALESCE(p_max_learners, 1000), 1), 5000);
BEGIN
  IF NOT public.user_has_permission('billing.coverage.export') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.export' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr
    WHERE ayr.year = p_admission_year;
  END IF;

  RETURN QUERY
  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id
    FROM public.fn_billing_coverage_target_years() t
  ),
  billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  scope AS (
    -- No lp.academic_year_id predicate — see get_billing_coverage_learners.
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.lifecycle_status,
           lp.first_name, lp.last_name, lp.roll_number, lp.register_number
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
      AND (p_admission_year IS NULL
           OR lp.admission_year_id = ANY(v_adm_year_ids))
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
  live_bills AS (
    -- Was `p_academic_year_id IS NULL OR ...`, i.e. any year — which made the
    -- PDF disagree with the table for the very learners this fix is about.
    SELECT b.*
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    LEFT JOIN target_year ty ON ty.institution_id = s.institution_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      AND (p_billing_category_id IS NULL OR b.item_category_id = p_billing_category_id)
      AND b.academic_year_id = COALESCE(p_academic_year_id, ty.target_ay_id)
  ),
  learner_state AS (
    SELECT s.id,
           COUNT(lb.id)::integer AS bill_count,
           COALESCE(SUM(lb.final_amount), 0)::numeric   AS total_amount,
           COALESCE(SUM(lb.final_amount - lb.balance_amount), 0)::numeric AS paid_amount,
           COALESCE(SUM(lb.balance_amount), 0)::numeric AS pending_amount
    FROM scope s
    LEFT JOIN live_bills lb ON lb.student_id = s.id
    GROUP BY s.id
  ),
  eligible AS (
    SELECT s.*, ls.bill_count, ls.total_amount, ls.paid_amount, ls.pending_amount
    FROM scope s
    JOIN learner_state ls ON ls.id = s.id
    WHERE p_coverage_state = 'all'
       OR (p_coverage_state = 'generated'     AND ls.bill_count > 0)
       OR (p_coverage_state = 'not_generated' AND ls.bill_count = 0)
  ),
  capped AS (
    SELECT e.*, i.name::text AS institution_name, p.program_name,
           CASE
             WHEN sem.semester_name IS NULL AND sec.section_name IS NULL THEN NULL
             WHEN sec.section_name IS NULL THEN sem.semester_name::text
             WHEN sem.semester_name IS NULL THEN sec.section_name::text
             ELSE sem.semester_name::text || ' · ' || sec.section_name::text
           END AS semester_section,
           COUNT(*) OVER ()::bigint AS learner_count
    FROM eligible e
    LEFT JOIN public.institutions i   ON i.id   = e.institution_id
    LEFT JOIN public.programs     p   ON p.id   = e.program_id
    LEFT JOIN public.semesters    sem ON sem.id = e.semester_id
    LEFT JOIN public.sections     sec ON sec.id = e.section_id
    ORDER BY i.name NULLS LAST, e.roll_number NULLS LAST, e.last_name, e.first_name
    LIMIT v_cap
  )
  SELECT c.id,
         c.roll_number::text,
         c.register_number::text,
         TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),
         c.institution_name,
         c.program_name,
         c.semester_section,
         c.lifecycle_status::text,
         c.total_amount,
         c.paid_amount,
         c.pending_amount,
         lb.id,
         lb.bill_description::text,
         cat.category_name::text,
         -- 59 live bills carry no academic year; label rather than drop the row.
         COALESCE(ay.academic_year_name::text, '—'),
         lb.due_date,
         lb.status::text,
         lb.final_amount,
         (lb.final_amount - lb.balance_amount),
         lb.balance_amount,
         c.learner_count
  FROM capped c
  LEFT JOIN live_bills lb              ON lb.student_id = c.id
  LEFT JOIN public.billing_categories cat ON cat.id = lb.item_category_id
  LEFT JOIN public.academic_years ay    ON ay.id  = lb.academic_year_id
  ORDER BY c.institution_name NULLS LAST, c.roll_number NULLS LAST,
           lb.due_date NULLS LAST, lb.bill_description;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_learner_bills(
  uuid, uuid[], text[], uuid, text, boolean, text, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer, integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learner_bills(
  uuid, uuid[], text[], uuid, text, boolean, text, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer, integer)
  TO authenticated, service_role;

-- No new indexes: learners_profiles.admission_year_id already carries
-- idx_learners_profiles_admission_year_id, and the cohort→ids lookup reads a
-- ~44-row table once per call.
