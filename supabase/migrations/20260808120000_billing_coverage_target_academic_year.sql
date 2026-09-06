-- ============================================================================
-- Bill Coverage: measure against a real target academic year, not the learner's
-- ============================================================================
-- BUG (reported 2026-08-08, /billing/coverage): learners whose bill HAD been
-- generated were listed as "Not generated". Example 23DT05 PRIYADHARSHINI A —
-- profile academic year 2025-2026, live ₹1,40,000 "3 Year Tuition Fee" bill
-- stamped 2026-2027. The report showed her as a gap.
--
-- ROOT CAUSE. Both list and summary decided coverage with:
--
--     AND b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
--                                                           ^^^^^^^^^^^^^^^^^^
-- With no year selected (the page's default) the fallback was the LEARNER'S OWN
-- profile year, so a bill only counted if it happened to carry the same year the
-- learner's profile was sitting on. Those are two independent columns:
--   * learners_profiles.academic_year_id  — the year the learner is in
--   * billing_student_bills.academic_year_id — the year the bill was raised for
-- They only agreed by accident. fn_billing_bill_default_academic_year() copies
-- the learner's year onto a bill ONLY when the bill's year is NULL, so any run
-- that stamps an explicit year (bulk-create-bills-service.ts passes the operator's
-- chosen year) breaks the assumption. Bill generation moved to 2026-2027 while
-- learner profiles still read 2025-2026, and 167 learners went false-negative.
--
-- The same lesson is already recorded in billing-receipt-service.ts:983 —
-- "Academic year lives ON the bill, not on the learner" — measured 2026-07-31 at
-- 1,774 of 6,598 outstanding bills (26.9%) carrying a year that differs from
-- their learner's. Receipts and the schedule page were fixed then; these three
-- coverage RPCs, written 2026-07-25, were not.
--
-- FIX. p_academic_year_id now means ONE thing: the year whose coverage we are
-- measuring. When it is null we resolve the institution's CURRENT academic year
-- by date, never the learner's own. Two consequences, both deliberate:
--
--  1. The learner-scope predicate `lp.academic_year_id = p_academic_year_id` is
--     REMOVED. It made the control do double duty — picking 2026-2027 at Allied
--     Health narrowed the population to the 79 learners whose profile had already
--     rolled over, hiding the 206 who had not, i.e. exactly the learners most
--     likely to be missing a bill. A coverage report must not let its target year
--     shrink the population it is auditing.
--  2. 190 learners flip from "generated" to "not generated". They are real gaps
--     the old rule concealed: a lagging profile year plus a bill for that lagging
--     year read as covered. Verified — each has bills only in 2025-2026 and none
--     for 2026-2027. Measured against 5,440 in-scope learners: 83 false negatives
--     cleared, 190 hidden true gaps surfaced, cannot_evaluate 16 -> 0.
-- ============================================================================

-- ── Target-year resolution ──────────────────────────────────────────────────
-- Greatest start_date <= today, per institution. Deliberately NOT end_date
-- BETWEEN: the Jun 1 -> Mar 31 convention leaves Apr-May covered by no row, and
-- a BETWEEN would return nothing for those two months. "Most recently started"
-- keeps Apr-May on the session that is finishing, which is what accounts mean.
--
-- is_active IS TRUE is load-bearing, not decoration. JKKN Dental carries
-- duplicate rows on the same start_date — '2026-2027' alongside an inactive
-- '2026-2027 Additional 2' (and four rows on 2025-06-01). Without the flag the
-- ORDER BY picks arbitrarily and could resolve every Dental learner against an
-- empty "Additional" year, flagging the whole college as unbilled. The name
-- tiebreak keeps it deterministic if two rows are ever active at once — the
-- canonical '2026-2027' sorts before '2026-2027 Additional 2'.
--
-- SECURITY INVOKER on purpose: it is only ever called from inside the SECURITY
-- DEFINER coverage RPCs (so it already runs as the owner and sees every row),
-- and EXECUTE is withheld from authenticated so it is not independently callable.
CREATE OR REPLACE FUNCTION public.fn_billing_coverage_target_years()
RETURNS TABLE(institution_id uuid, target_ay_id uuid, target_ay_name text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (ay.institution_id)
         ay.institution_id,
         ay.id,
         ay.academic_year_name::text
  FROM public.academic_years ay
  WHERE ay.is_active IS TRUE
    AND ay.start_date <= CURRENT_DATE
  ORDER BY ay.institution_id, ay.start_date DESC, ay.academic_year_name ASC;
$function$;

REVOKE ALL ON FUNCTION public.fn_billing_coverage_target_years()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billing_coverage_target_years()
  TO service_role;

-- ── Learner list ────────────────────────────────────────────────────────────
-- DROP + CREATE, not CREATE OR REPLACE: out_target_academic_year_name is a new
-- RETURNS TABLE column and Postgres cannot replace a function whose output type
-- changed. DROP discards the ACL, so the grants below are mandatory, not tidy-up.
DROP FUNCTION IF EXISTS public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid);

CREATE FUNCTION public.get_billing_coverage_learners(
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
  p_transport text DEFAULT 'any',
  p_gender text DEFAULT NULL,
  p_sort_by text DEFAULT NULL,
  p_sort_dir text DEFAULT 'asc',
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL
)
RETURNS TABLE(
  out_learner_id uuid,
  out_roll_number text,
  out_register_number text,
  out_full_name text,
  out_lifecycle_status text,
  out_gender text,
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
  out_target_academic_year_name text,
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
    -- year being MEASURED, never the learners being measured — see header.
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
           COALESCE(SUM(b.final_amount), 0)::numeric AS total_billed
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
           acc.name::text             AS accommodation_type,
           s.uses_transport           AS uses_transport,
           a.bill_count               AS bill_count,
           a.total_billed             AS total_billed,
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
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer,
  uuid[], text, text, text, text, uuid, uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── Summary (KPI cards) ─────────────────────────────────────────────────────
-- Must move with the list. The cards counting one population while the table
-- shows another is the failure mode the shared baseParams() in
-- bill-coverage-service.ts already guards against on the filter side.
CREATE OR REPLACE FUNCTION public.get_billing_coverage_summary(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_include_non_billing_institutions boolean DEFAULT false,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_transport text DEFAULT 'any',
  p_gender text DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL
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

  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id
    FROM public.fn_billing_coverage_target_years() t
  ),
  billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  all_scope AS (
    -- No lp.academic_year_id predicate — see the list RPC above.
    SELECT lp.id, lp.institution_id,
           (lp.institution_id IN (SELECT inst_id FROM billing_inst)) AS is_billing_inst
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
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

-- ── PDF export ──────────────────────────────────────────────────────────────
-- This one had the OPPOSITE bug: `p_academic_year_id IS NULL OR ...` meant an
-- unfiltered export counted bills from ANY year, so the same learner read
-- "Not generated" in the table and "generated" in the PDF. Aligned to the same
-- target year so the three RPCs finally agree.
CREATE OR REPLACE FUNCTION public.get_billing_coverage_learner_bills(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_coverage_state text DEFAULT 'all',
  p_include_non_billing_institutions boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_transport text DEFAULT 'any',
  p_gender text DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_max_learners integer DEFAULT 1000
)
RETURNS TABLE(
  out_learner_id uuid, out_roll_number text, out_register_number text,
  out_full_name text, out_institution_name text, out_program_name text,
  out_semester_section text, out_lifecycle_status text,
  out_learner_total numeric, out_learner_paid numeric, out_learner_pending numeric,
  out_bill_id uuid, out_bill_description text, out_category_name text,
  out_bill_academic_year text, out_due_date date, out_bill_status text,
  out_total_amount numeric, out_paid_amount numeric, out_pending_amount numeric,
  out_learner_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst  uuid[];
  v_cap   integer := LEAST(GREATEST(COALESCE(p_max_learners, 1000), 1), 5000);
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

  RETURN QUERY
  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id
    FROM public.fn_billing_coverage_target_years() t
  ),
  billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  scope AS (
    -- No lp.academic_year_id predicate — see the list RPC above.
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.lifecycle_status,
           lp.first_name, lp.last_name, lp.roll_number, lp.register_number
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
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
