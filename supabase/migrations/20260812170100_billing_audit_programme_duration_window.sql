-- ============================================================================
-- Bill Coverage Audit: bound the audited window by the PROGRAMME's duration
-- ============================================================================
-- Companion to 20260812170000, which did the same for the three Coverage RPCs.
-- The rule and its rationale live in that file's header; in short:
--
--   programme_end_year = cohort_year + CEIL(program_duration_yrs) - 1
--   expected years     = active AY start years
--                        BETWEEN GREATEST(cohort, p_earliest_academic_year)
--                        AND     LEAST(institution_current_year,
--                                      programme_end_year)
--
-- PHARMD cohort 2020 is a 6-year course running 2020-21 .. 2025-26, so 2026-27
-- must stop being listed as a bill that was never raised. A NULL duration keeps
-- today's uncapped behaviour rather than guessing — but the learner is now
-- FLAGGED so the phantom tail is attributable instead of mysterious.
--
-- Two knock-on changes worth stating:
--
-- 1. has_current_year now means "the learner's LAST EXPECTED year is billed",
--    not "the institution's current year is billed". For a cohort that has
--    finished, the institution's current year is no longer part of their
--    window, so the old reading would have marked every completed cohort as
--    lacking a current bill. The KPI it drives keeps its meaning — currently
--    billed, historically short — under the corrected window.
--
-- 2. The duplicates check gains the INVERSE finding: live tuition bills stamped
--    for a year AFTER the programme ends. Scoped to tuition-kind only and
--    deliberately so — counting every kind returns 62 learners, but a CRRI
--    intern legitimately still has hostel and mess bills after the taught years
--    end. Tuition-only returns the real anomaly.
-- ============================================================================

-- ── A: summary ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_audit_missing_years_summary(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_include_non_tuition_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer,
  p_earliest_academic_year integer DEFAULT NULL::integer
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
      'in_scope', 0, 'gap', 0, 'complete', 0, 'cannot_evaluate', 0,
      'missing_slots', 0, 'backlog_only', 0, 'no_tuition_at_all', 0,
      'duration_not_set', 0,
      'excluded_institutions', 0, 'excluded_learners', 0,
      'by_institution', '[]'::jsonb, 'available_academic_years', '[]'::jsonb);
  END IF;

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr WHERE ayr.year = p_admission_year;
  END IF;

  WITH tuition_inst AS MATERIALIZED (
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE bc.kind = 'tuition'
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  target AS MATERIALIZED (
    SELECT t.institution_id, EXTRACT(YEAR FROM ay.start_date)::int AS ceiling_yr
    FROM public.fn_billing_coverage_target_years() t
    JOIN public.academic_years ay ON ay.id = t.target_ay_id
  ),
  inst_years AS MATERIALIZED (
    SELECT DISTINCT ay.institution_id, EXTRACT(YEAR FROM ay.start_date)::int AS yr
    FROM public.academic_years ay WHERE ay.is_active IS TRUE
  ),
  all_scope AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, adm.year AS cohort, t.ceiling_yr,
           p.program_duration_yrs AS dur,
           -- The window's upper bound: whichever comes first, the institution's
           -- current year or the end of this learner's programme.
           LEAST(t.ceiling_yr,
                 COALESCE(public.fn_programme_end_year(adm.year, p.program_duration_yrs),
                          t.ceiling_yr)) AS window_end_yr,
           (lp.institution_id IN (SELECT inst_id FROM tuition_inst)) AS is_tuition_inst
    FROM public.learners_profiles lp
    LEFT JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
    LEFT JOIN target t ON t.institution_id = lp.institution_id
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_admission_year IS NULL OR lp.admission_year_id = ANY(v_adm_year_ids))
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
  scope AS MATERIALIZED (
    SELECT * FROM all_scope
    WHERE p_include_non_tuition_institutions OR is_tuition_inst
  ),
  covered AS MATERIALIZED (
    SELECT DISTINCT b.student_id,
           EXTRACT(YEAR FROM ay.start_date)::int AS yr
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
    JOIN public.academic_years ay ON ay.id = b.academic_year_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  years AS (
    SELECT s.id AS learner_id, iy.yr, s.window_end_yr,
           (c.student_id IS NOT NULL) AS is_covered
    FROM scope s
    JOIN inst_years iy ON iy.institution_id = s.institution_id
     AND iy.yr BETWEEN GREATEST(s.cohort, COALESCE(p_earliest_academic_year, s.cohort))
                   AND s.window_end_yr
    LEFT JOIN covered c ON c.student_id = s.id AND c.yr = iy.yr
    WHERE s.cohort IS NOT NULL AND s.ceiling_yr IS NOT NULL
  ),
  per_learner AS (
    SELECT y.learner_id,
           COUNT(*) FILTER (WHERE y.is_covered)::int     AS billed_years,
           COUNT(*) FILTER (WHERE NOT y.is_covered)::int AS missing_years,
           -- The learner's LAST EXPECTED year, not the institution's current
           -- one — for a finished cohort those are different years.
           bool_or(y.yr = y.window_end_yr AND y.is_covered) AS has_current_year
    FROM years y GROUP BY y.learner_id
  ),
  stated AS (
    SELECT s.institution_id,
           (s.dur IS NULL) AS duration_not_set,
           COALESCE(pl.missing_years, 0)   AS missing_years,
           COALESCE(pl.billed_years, 0)    AS billed_years,
           COALESCE(pl.has_current_year, false) AS has_current_year,
           CASE
             WHEN s.cohort IS NULL OR s.ceiling_yr IS NULL THEN 'cannot_evaluate'
             WHEN COALESCE(pl.missing_years, 0) > 0        THEN 'gap'
             ELSE 'complete'
           END AS audit_state
    FROM scope s
    LEFT JOIN per_learner pl ON pl.learner_id = s.id
  )
  SELECT jsonb_build_object(
    'in_scope',        (SELECT COUNT(*) FROM stated),
    'gap',             (SELECT COUNT(*) FROM stated WHERE audit_state = 'gap'),
    'complete',        (SELECT COUNT(*) FROM stated WHERE audit_state = 'complete'),
    'cannot_evaluate', (SELECT COUNT(*) FROM stated WHERE audit_state = 'cannot_evaluate'),
    'missing_slots',   (SELECT COALESCE(SUM(missing_years), 0) FROM stated),
    'backlog_only',    (SELECT COUNT(*) FROM stated
                        WHERE audit_state = 'gap' AND has_current_year),
    'no_tuition_at_all', (SELECT COUNT(*) FROM stated
                          WHERE audit_state = 'gap' AND billed_years = 0),
    -- Data hygiene, not a verdict: these learners' windows run to the current
    -- year because their programme has no duration on file, so any tail years
    -- they show are unproven rather than confirmed gaps.
    'duration_not_set',(SELECT COUNT(*) FROM stated WHERE duration_not_set),
    'excluded_institutions',
      (SELECT COUNT(DISTINCT institution_id) FROM all_scope WHERE NOT is_tuition_inst),
    'excluded_learners',
      (SELECT COUNT(*) FROM all_scope WHERE NOT is_tuition_inst),
    'by_institution', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'institution_name')
      FROM (
        SELECT jsonb_build_object(
                 'institution_id',   st.institution_id,
                 'institution_name', COALESCE(i.name::text, 'Unknown'),
                 'in_scope',         COUNT(*),
                 'gap',              COUNT(*) FILTER (WHERE st.audit_state = 'gap'),
                 'missing_slots',    COALESCE(SUM(st.missing_years), 0)
               ) AS x
        FROM stated st
        LEFT JOIN public.institutions i ON i.id = st.institution_id
        GROUP BY st.institution_id, i.name
      ) sub
    ), '[]'::jsonb),
    'available_academic_years', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'year',  yr,
               'label', yr::text || '-' || (yr + 1)::text) ORDER BY yr DESC)
      FROM (
        SELECT DISTINCT EXTRACT(YEAR FROM ay.start_date)::int AS yr
        FROM public.academic_years ay
        WHERE ay.institution_id = ANY(v_inst)
          AND ay.is_active IS TRUE
          AND ay.start_date <= CURRENT_DATE
      ) ys
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── A: learners list ───────────────────────────────────────────────────────
-- DROP + CREATE: the RETURNS TABLE gains three columns. Dropping discards the
-- ACL, so the REVOKE/GRANT pair below is load-bearing.
DROP FUNCTION IF EXISTS public.get_billing_audit_missing_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, text, integer, integer, text, text);

CREATE FUNCTION public.get_billing_audit_missing_years(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_include_non_tuition_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer,
  p_earliest_academic_year integer DEFAULT NULL::integer,
  p_audit_state text DEFAULT 'gap'::text,
  p_search text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT NULL::text,
  p_sort_dir text DEFAULT 'asc'::text
)
RETURNS TABLE(
  out_learner_id uuid, out_roll_number text, out_register_number text,
  out_full_name text, out_lifecycle_status text, out_gender text,
  out_institution_id uuid, out_institution_name text, out_program_name text,
  out_semester_section text, out_admission_year integer,
  out_expected_years integer, out_billed_years integer, out_missing_years integer,
  out_missing_year_names text, out_first_missing_year text,
  out_has_current_year boolean, out_tuition_bill_count integer,
  out_total_billed numeric, out_total_paid numeric,
  out_unassigned_tuition_bills integer, out_audit_state text,
  out_program_duration_yrs numeric, out_programme_end_year text,
  out_duration_configured boolean,
  out_total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(NULLIF(p_page_size, 0), 50), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0)
                      * LEAST(GREATEST(COALESCE(NULLIF(p_page_size, 0), 50), 1), 5000);
  v_asc    boolean := COALESCE(LOWER(p_sort_dir), 'asc') <> 'desc';
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

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr WHERE ayr.year = p_admission_year;
  END IF;

  RETURN QUERY
  WITH tuition_inst AS MATERIALIZED (
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE bc.kind = 'tuition'
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  target AS MATERIALIZED (
    SELECT t.institution_id, EXTRACT(YEAR FROM ay.start_date)::int AS ceiling_yr
    FROM public.fn_billing_coverage_target_years() t
    JOIN public.academic_years ay ON ay.id = t.target_ay_id
  ),
  inst_years AS MATERIALIZED (
    SELECT DISTINCT ay.institution_id, EXTRACT(YEAR FROM ay.start_date)::int AS yr
    FROM public.academic_years ay WHERE ay.is_active IS TRUE
  ),
  scope AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, lp.program_id, lp.semester_id, lp.section_id,
           lp.gender, lp.lifecycle_status, lp.first_name, lp.last_name,
           lp.roll_number, lp.register_number, lp.accommodation_type_id,
           adm.year AS cohort, t.ceiling_yr,
           p.program_duration_yrs AS dur,
           LEAST(t.ceiling_yr,
                 COALESCE(public.fn_programme_end_year(adm.year, p.program_duration_yrs),
                          t.ceiling_yr)) AS window_end_yr
    FROM public.learners_profiles lp
    LEFT JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
    LEFT JOIN target t ON t.institution_id = lp.institution_id
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_tuition_institutions
           OR lp.institution_id IN (SELECT inst_id FROM tuition_inst))
      AND (p_admission_year IS NULL OR lp.admission_year_id = ANY(v_adm_year_ids))
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
  covered AS MATERIALIZED (
    SELECT DISTINCT b.student_id, EXTRACT(YEAR FROM ay.start_date)::int AS yr
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
    JOIN public.academic_years ay ON ay.id = b.academic_year_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  bill_stats AS MATERIALIZED (
    SELECT b.student_id,
           COUNT(*)::integer AS tuition_bill_count,
           COALESCE(SUM(b.final_amount), 0)::numeric AS total_billed,
           COALESCE(SUM(b.final_amount - COALESCE(b.balance_amount, 0)), 0)::numeric
             AS total_paid,
           COUNT(*) FILTER (WHERE b.academic_year_id IS NULL)::integer
             AS unassigned_tuition_bills
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id
  ),
  years AS (
    SELECT s.id AS learner_id, iy.yr, s.window_end_yr,
           (c.student_id IS NOT NULL) AS is_covered
    FROM scope s
    JOIN inst_years iy ON iy.institution_id = s.institution_id
     AND iy.yr BETWEEN GREATEST(s.cohort, COALESCE(p_earliest_academic_year, s.cohort))
                   AND s.window_end_yr
    LEFT JOIN covered c ON c.student_id = s.id AND c.yr = iy.yr
    WHERE s.cohort IS NOT NULL AND s.ceiling_yr IS NOT NULL
  ),
  per_learner AS (
    SELECT y.learner_id,
           COUNT(*)::integer                             AS expected_years,
           COUNT(*) FILTER (WHERE y.is_covered)::integer AS billed_years,
           COUNT(*) FILTER (WHERE NOT y.is_covered)::integer AS missing_years,
           string_agg(y.yr::text || '-' || (y.yr + 1)::text, ', ' ORDER BY y.yr)
             FILTER (WHERE NOT y.is_covered)             AS missing_year_names,
           MIN(y.yr) FILTER (WHERE NOT y.is_covered)     AS first_missing_yr,
           bool_or(y.yr = y.window_end_yr AND y.is_covered) AS has_current_year
    FROM years y GROUP BY y.learner_id
  ),
  final AS (
    SELECT s.id AS learner_id,
           s.roll_number::text     AS roll_number,
           s.register_number::text AS register_number,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
                                   AS full_name,
           s.lifecycle_status::text AS lifecycle_status,
           NULLIF(TRIM(s.gender), '')::text AS gender,
           s.institution_id        AS institution_id,
           i.name::text            AS institution_name,
           p.program_name          AS program_name,
           CASE
             WHEN sem.semester_name IS NULL AND sec.section_name IS NULL THEN NULL
             WHEN sec.section_name IS NULL THEN sem.semester_name::text
             WHEN sem.semester_name IS NULL THEN sec.section_name::text
             ELSE sem.semester_name::text || ' · ' || sec.section_name::text
           END                     AS semester_section,
           s.cohort                AS admission_year,
           COALESCE(pl.expected_years, 0) AS expected_years,
           COALESCE(pl.billed_years, 0)   AS billed_years,
           COALESCE(pl.missing_years, 0)  AS missing_years,
           pl.missing_year_names   AS missing_year_names,
           CASE WHEN pl.first_missing_yr IS NULL THEN NULL
                ELSE pl.first_missing_yr::text || '-' || (pl.first_missing_yr + 1)::text
           END                     AS first_missing_year,
           COALESCE(pl.has_current_year, false) AS has_current_year,
           COALESCE(bs.tuition_bill_count, 0)   AS tuition_bill_count,
           COALESCE(bs.total_billed, 0)::numeric AS total_billed,
           COALESCE(bs.total_paid, 0)::numeric   AS total_paid,
           COALESCE(bs.unassigned_tuition_bills, 0) AS unassigned_tuition_bills,
           s.dur                   AS program_duration_yrs,
           public.fn_programme_end_year(s.cohort, s.dur) AS programme_end_yr,
           (s.dur IS NOT NULL)     AS duration_configured,
           CASE
             WHEN s.cohort IS NULL OR s.ceiling_yr IS NULL THEN 'cannot_evaluate'
             WHEN COALESCE(pl.missing_years, 0) > 0        THEN 'gap'
             ELSE 'complete'
           END                     AS audit_state
    FROM scope s
    LEFT JOIN per_learner pl              ON pl.learner_id = s.id
    LEFT JOIN bill_stats  bs              ON bs.student_id = s.id
    LEFT JOIN public.institutions i       ON i.id   = s.institution_id
    LEFT JOIN public.programs     p       ON p.id   = s.program_id
    LEFT JOIN public.semesters    sem     ON sem.id = s.semester_id
    LEFT JOIN public.sections     sec     ON sec.id = s.section_id
  ),
  filtered AS (
    SELECT * FROM final f
    WHERE COALESCE(p_audit_state, 'gap') = 'all'
       OR f.audit_state = COALESCE(p_audit_state, 'gap')
  )
  SELECT f.learner_id, f.roll_number, f.register_number, f.full_name,
         f.lifecycle_status, f.gender, f.institution_id, f.institution_name,
         f.program_name, f.semester_section, f.admission_year,
         f.expected_years, f.billed_years, f.missing_years,
         f.missing_year_names, f.first_missing_year, f.has_current_year,
         f.tuition_bill_count, f.total_billed, f.total_paid,
         f.unassigned_tuition_bills, f.audit_state,
         f.program_duration_yrs,
         CASE WHEN f.programme_end_yr IS NULL THEN NULL
              ELSE f.programme_end_yr::text || '-' || (f.programme_end_yr + 1)::text
         END,
         f.duration_configured,
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
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'gender'             THEN f.gender
         WHEN 'first_missing_year' THEN f.first_missing_year
         WHEN 'programme_end_year' THEN f.programme_end_yr::text
         WHEN 'audit_state'        THEN f.audit_state
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
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'gender'             THEN f.gender
         WHEN 'first_missing_year' THEN f.first_missing_year
         WHEN 'programme_end_year' THEN f.programme_end_yr::text
         WHEN 'audit_state'        THEN f.audit_state
       END
     END) DESC NULLS LAST,
    (CASE WHEN v_asc THEN
       CASE p_sort_by
         WHEN 'admission_year'        THEN f.admission_year::numeric
         WHEN 'expected_years'        THEN f.expected_years::numeric
         WHEN 'billed_years'          THEN f.billed_years::numeric
         WHEN 'missing_years'         THEN f.missing_years::numeric
         WHEN 'tuition_bill_count'    THEN f.tuition_bill_count::numeric
         WHEN 'total_billed'          THEN f.total_billed
         WHEN 'total_paid'            THEN f.total_paid
         WHEN 'program_duration_yrs'  THEN f.program_duration_yrs
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'admission_year'        THEN f.admission_year::numeric
         WHEN 'expected_years'        THEN f.expected_years::numeric
         WHEN 'billed_years'          THEN f.billed_years::numeric
         WHEN 'missing_years'         THEN f.missing_years::numeric
         WHEN 'tuition_bill_count'    THEN f.tuition_bill_count::numeric
         WHEN 'total_billed'          THEN f.total_billed
         WHEN 'total_paid'            THEN f.total_paid
         WHEN 'program_duration_yrs'  THEN f.program_duration_yrs
       END
     END) DESC NULLS LAST,
    f.missing_years DESC, f.institution_name NULLS LAST,
    f.roll_number NULLS LAST, f.full_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_missing_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, text, integer, integer, text, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_missing_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, text, integer, integer, text, text)
  TO authenticated, service_role;

-- ── B: summary ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_audit_duplicate_years_summary(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_include_non_tuition_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer,
  p_earliest_academic_year integer DEFAULT NULL::integer
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
      'combos', 0, 'learners', 0, 'bills', 0, 'extra_bills', 0,
      'total_billed', 0, 'outstanding', 0, 'generator_signature', 0,
      'unassigned_tuition_bills', 0,
      'past_end_bills', 0, 'past_end_learners', 0, 'past_end_outstanding', 0,
      'by_institution', '[]'::jsonb);
  END IF;

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr WHERE ayr.year = p_admission_year;
  END IF;

  WITH tuition_inst AS MATERIALIZED (
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE bc.kind = 'tuition'
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  scope AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, adm.year AS cohort,
           public.fn_programme_end_year(adm.year, p.program_duration_yrs) AS end_yr
    FROM public.learners_profiles lp
    LEFT JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_tuition_institutions
           OR lp.institution_id IN (SELECT inst_id FROM tuition_inst))
      AND (p_admission_year IS NULL OR lp.admission_year_id = ANY(v_adm_year_ids))
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
  tuition_bills AS MATERIALIZED (
    SELECT b.id, b.student_id, s.institution_id, s.end_yr,
           EXTRACT(YEAR FROM ay.start_date)::int AS yr,
           b.final_amount, COALESCE(b.balance_amount, 0) AS balance_amount,
           b.created_at, b.due_date
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
    JOIN public.academic_years ay ON ay.id = b.academic_year_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      AND (p_earliest_academic_year IS NULL
           OR EXTRACT(YEAR FROM ay.start_date)::int >= p_earliest_academic_year)
  ),
  dup AS (
    SELECT tb.student_id AS learner_id, tb.institution_id,
           COUNT(*)::integer AS bill_count,
           SUM(tb.final_amount)::numeric AS total_billed,
           SUM(tb.balance_amount)::numeric AS outstanding,
           (COUNT(DISTINCT tb.created_at::date) = 1
            AND COUNT(DISTINCT EXTRACT(YEAR FROM tb.due_date)) > 1) AS is_generator_artefact
    FROM tuition_bills tb
    GROUP BY tb.student_id, tb.institution_id, tb.yr
    HAVING COUNT(*) > 1
  ),
  -- The INVERSE finding: a live tuition bill for a year after the programme
  -- ends. Tuition-kind only — a CRRI intern legitimately still has hostel and
  -- mess bills once the taught years finish, so widening this to every kind
  -- would report normal operation as an anomaly.
  past_end AS (
    SELECT tb.id, tb.student_id, tb.balance_amount
    FROM tuition_bills tb
    WHERE tb.end_yr IS NOT NULL AND tb.yr > tb.end_yr
  )
  SELECT jsonb_build_object(
    'combos',       (SELECT COUNT(*) FROM dup),
    'learners',     (SELECT COUNT(DISTINCT learner_id) FROM dup),
    'bills',        (SELECT COALESCE(SUM(bill_count), 0) FROM dup),
    'extra_bills',  (SELECT COALESCE(SUM(bill_count - 1), 0) FROM dup),
    'total_billed', (SELECT COALESCE(SUM(total_billed), 0) FROM dup),
    'outstanding',  (SELECT COALESCE(SUM(outstanding), 0) FROM dup),
    'generator_signature',
      (SELECT COUNT(*) FROM dup WHERE is_generator_artefact),
    'unassigned_tuition_bills', (
      SELECT COUNT(*)
      FROM public.billing_student_bills b
      JOIN scope s ON s.id = b.student_id
      JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
      WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
        AND b.academic_year_id IS NULL
    ),
    'past_end_bills',       (SELECT COUNT(*) FROM past_end),
    'past_end_learners',    (SELECT COUNT(DISTINCT student_id) FROM past_end),
    'past_end_outstanding', (SELECT COALESCE(SUM(balance_amount), 0) FROM past_end),
    'by_institution', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'institution_name')
      FROM (
        SELECT jsonb_build_object(
                 'institution_id',   d.institution_id,
                 'institution_name', COALESCE(i.name::text, 'Unknown'),
                 'combos',           COUNT(*),
                 'learners',         COUNT(DISTINCT d.learner_id),
                 'extra_bills',      COALESCE(SUM(d.bill_count - 1), 0)
               ) AS x
        FROM dup d
        LEFT JOIN public.institutions i ON i.id = d.institution_id
        GROUP BY d.institution_id, i.name
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── B: list ────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_billing_audit_duplicate_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, integer, integer, text, text);

CREATE FUNCTION public.get_billing_audit_duplicate_years(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_lifecycle_statuses text[] DEFAULT ARRAY['active'::text, 'reserved'::text, 'admitted'::text, 'account'::text],
  p_include_non_tuition_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL::uuid[],
  p_transport text DEFAULT 'any'::text,
  p_gender text DEFAULT NULL::text,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_admission_year integer DEFAULT NULL::integer,
  p_earliest_academic_year integer DEFAULT NULL::integer,
  p_search text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT NULL::text,
  p_sort_dir text DEFAULT 'asc'::text
)
RETURNS TABLE(
  out_audit_row_id text, out_learner_id uuid, out_roll_number text,
  out_register_number text, out_full_name text, out_lifecycle_status text,
  out_institution_id uuid, out_institution_name text, out_program_name text,
  out_semester_section text, out_admission_year integer,
  out_academic_year_name text, out_bill_count integer, out_category_names text,
  out_total_billed numeric, out_total_paid numeric, out_outstanding numeric,
  out_created_same_day boolean, out_due_year_span integer,
  out_programme_end_year text, out_is_past_programme_end boolean,
  out_total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(NULLIF(p_page_size, 0), 50), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0)
                      * LEAST(GREATEST(COALESCE(NULLIF(p_page_size, 0), 50), 1), 5000);
  v_asc    boolean := COALESCE(LOWER(p_sort_dir), 'asc') <> 'desc';
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

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr WHERE ayr.year = p_admission_year;
  END IF;

  RETURN QUERY
  WITH tuition_inst AS MATERIALIZED (
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE bc.kind = 'tuition'
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
  ),
  scope AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, lp.program_id, lp.semester_id, lp.section_id,
           lp.lifecycle_status, lp.first_name, lp.last_name, lp.roll_number,
           lp.register_number, adm.year AS cohort,
           public.fn_programme_end_year(adm.year, p.program_duration_yrs) AS end_yr
    FROM public.learners_profiles lp
    LEFT JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_tuition_institutions
           OR lp.institution_id IN (SELECT inst_id FROM tuition_inst))
      AND (p_admission_year IS NULL OR lp.admission_year_id = ANY(v_adm_year_ids))
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
  dup AS (
    SELECT b.student_id AS learner_id,
           EXTRACT(YEAR FROM ay.start_date)::integer AS yr,
           COUNT(*)::integer AS bill_count,
           string_agg(DISTINCT bc.category_name::text, ', '
                      ORDER BY bc.category_name::text) AS category_names,
           SUM(b.final_amount)::numeric AS total_billed,
           SUM(b.final_amount - COALESCE(b.balance_amount, 0))::numeric AS total_paid,
           SUM(COALESCE(b.balance_amount, 0))::numeric AS outstanding,
           (COUNT(DISTINCT b.created_at::date) = 1) AS created_same_day,
           COUNT(DISTINCT EXTRACT(YEAR FROM b.due_date))::integer AS due_year_span
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id AND bc.kind = 'tuition'
    JOIN public.academic_years ay ON ay.id = b.academic_year_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      AND (p_earliest_academic_year IS NULL
           OR EXTRACT(YEAR FROM ay.start_date)::int >= p_earliest_academic_year)
    GROUP BY b.student_id, EXTRACT(YEAR FROM ay.start_date)::integer
    HAVING COUNT(*) > 1
  ),
  final AS (
    SELECT (s.id::text || ':' || d.yr::text) AS audit_row_id,
           s.id AS learner_id,
           s.roll_number::text     AS roll_number,
           s.register_number::text AS register_number,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
                                   AS full_name,
           s.lifecycle_status::text AS lifecycle_status,
           s.institution_id        AS institution_id,
           i.name::text            AS institution_name,
           p.program_name          AS program_name,
           CASE
             WHEN sem.semester_name IS NULL AND sec.section_name IS NULL THEN NULL
             WHEN sec.section_name IS NULL THEN sem.semester_name::text
             WHEN sem.semester_name IS NULL THEN sec.section_name::text
             ELSE sem.semester_name::text || ' · ' || sec.section_name::text
           END                     AS semester_section,
           s.cohort                AS admission_year,
           (d.yr::text || '-' || (d.yr + 1)::text) AS academic_year_name,
           d.bill_count, d.category_names, d.total_billed, d.total_paid,
           d.outstanding, d.created_same_day, d.due_year_span,
           s.end_yr                AS programme_end_yr,
           (s.end_yr IS NOT NULL AND d.yr > s.end_yr) AS is_past_programme_end
    FROM dup d
    JOIN scope s ON s.id = d.learner_id
    LEFT JOIN public.institutions i   ON i.id   = s.institution_id
    LEFT JOIN public.programs     p   ON p.id   = s.program_id
    LEFT JOIN public.semesters    sem ON sem.id = s.semester_id
    LEFT JOIN public.sections     sec ON sec.id = s.section_id
  )
  SELECT f.audit_row_id, f.learner_id, f.roll_number, f.register_number,
         f.full_name, f.lifecycle_status, f.institution_id, f.institution_name,
         f.program_name, f.semester_section, f.admission_year,
         f.academic_year_name, f.bill_count, f.category_names,
         f.total_billed, f.total_paid, f.outstanding,
         f.created_same_day, f.due_year_span,
         CASE WHEN f.programme_end_yr IS NULL THEN NULL
              ELSE f.programme_end_yr::text || '-' || (f.programme_end_yr + 1)::text
         END,
         f.is_past_programme_end,
         COUNT(*) OVER ()::bigint
  FROM final f
  ORDER BY
    (CASE WHEN v_asc THEN
       CASE p_sort_by
         WHEN 'full_name'          THEN f.full_name
         WHEN 'roll_number'        THEN f.roll_number
         WHEN 'register_number'    THEN f.register_number
         WHEN 'institution_name'   THEN f.institution_name
         WHEN 'program_name'       THEN f.program_name
         WHEN 'semester_section'   THEN f.semester_section
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'academic_year_name' THEN f.academic_year_name
         WHEN 'category_names'     THEN f.category_names
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
         WHEN 'lifecycle_status'   THEN f.lifecycle_status
         WHEN 'academic_year_name' THEN f.academic_year_name
         WHEN 'category_names'     THEN f.category_names
       END
     END) DESC NULLS LAST,
    (CASE WHEN v_asc THEN
       CASE p_sort_by
         WHEN 'admission_year' THEN f.admission_year::numeric
         WHEN 'bill_count'     THEN f.bill_count::numeric
         WHEN 'total_billed'   THEN f.total_billed
         WHEN 'total_paid'     THEN f.total_paid
         WHEN 'outstanding'    THEN f.outstanding
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'admission_year' THEN f.admission_year::numeric
         WHEN 'bill_count'     THEN f.bill_count::numeric
         WHEN 'total_billed'   THEN f.total_billed
         WHEN 'total_paid'     THEN f.total_paid
         WHEN 'outstanding'    THEN f.outstanding
       END
     END) DESC NULLS LAST,
    -- Bills sitting past the programme end float to the top: they are the
    -- least explicable rows on the screen.
    f.is_past_programme_end DESC, f.bill_count DESC,
    f.institution_name NULLS LAST, f.roll_number NULLS LAST, f.academic_year_name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_duplicate_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, integer, integer, text, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_duplicate_years(
  uuid[], text[], boolean, uuid[], text, text, uuid, uuid, uuid, uuid, uuid,
  integer, integer, text, integer, integer, text, text)
  TO authenticated, service_role;
