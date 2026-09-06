-- ============================================================================
-- BILL COVERAGE LEARNER BILLS — LEARNER-CONTIGUOUS ROW ORDER
-- ============================================================================
-- get_billing_coverage_learner_bills feeds ONE consumer: the PDF export on
-- /billing/coverage ("Learner-wise bill details"). That document groups rows
-- into one box per learner by walking the result and starting a new box when
-- learner_id changes — which is only correct while a learner's rows arrive
-- adjacent.
--
-- They did not. The final ORDER BY carried no learner key:
--
--   ORDER BY institution_name, roll_number, due_date, bill_description
--
-- Learner identity was merely IMPLIED by roll_number. Every learner who ties on
-- it falls through to due_date then bill_description — a sort that clusters the
-- entire institution by bill NAME and interleaves the learners. The PDF then
-- reprinted the same learner once per billing category, e.g.
--
--   MEIRHUNA A.S · BPHARM · Semester I      1,40,000.00  45,000.00  95,000.00
--     1 Year Tuition Fee ...
--   MEIRHUNA A.S · BPHARM · Semester I          5,000.00   5,000.00      0.00
--     University Fee ...
--
-- so no single box ever showed a learner's full liability.
--
-- The tie is routine, not rare: 1,120 learners have roll_number IS NULL (that
-- learner among them), and the 6,139 that have one collapse to 5,682 distinct
-- (institution, roll_number) pairs — 457 duplicates.
--
-- ORDERING ONLY. No predicate, join, aggregate or output column changes, so
-- the row SET and every amount in it are byte-identical to before; only the
-- sequence changes. The `capped` CTE gets e.id for the same reason — its
-- LIMIT was picking an arbitrary member of each tie group, so the same filter
-- could cap in a different 1,000 learners between runs.
--
-- The PDF was hardened in the same change to group by learner_id rather than by
-- runs of rows, so it no longer depends on this ordering — but a report RPC
-- that returns a learner's bills scattered across the result is wrong on its
-- own terms, and any future consumer would inherit the same trap.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_coverage_learner_bills(
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
  v_inst               uuid[];
  v_adm_year_ids       uuid[];
  v_picked_ay_start_yr integer;
  v_cap                integer := LEAST(GREATEST(COALESCE(p_max_learners, 1000), 1), 5000);
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

  SELECT EXTRACT(YEAR FROM ay.start_date)::integer INTO v_picked_ay_start_yr
  FROM public.academic_years ay WHERE ay.id = p_academic_year_id;

  IF p_admission_year IS NOT NULL THEN
    SELECT array_agg(ayr.id) INTO v_adm_year_ids
    FROM public.admission_years ayr
    WHERE ayr.year = p_admission_year;
  END IF;

  RETURN QUERY
  WITH target_year AS MATERIALIZED (
    SELECT t.institution_id, t.target_ay_id,
           EXTRACT(YEAR FROM ay.start_date)::integer AS target_start_yr
    FROM public.fn_billing_coverage_target_years() t
    JOIN public.academic_years ay ON ay.id = t.target_ay_id
  ),
  billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.lifecycle_status,
           lp.first_name, lp.last_name, lp.roll_number, lp.register_number,
           adm.year AS cohort, p.program_duration_yrs AS dur
    FROM public.learners_profiles lp
    LEFT JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
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
    SELECT s.*, ls.bill_count, ls.total_amount, ls.paid_amount, ls.pending_amount,
           CASE
             WHEN ls.bill_count > 0 THEN 'generated'
             WHEN public.fn_programme_end_year(s.cohort, s.dur) IS NOT NULL
              AND COALESCE(v_picked_ay_start_yr, ty.target_start_yr)
                    > public.fn_programme_end_year(s.cohort, s.dur)
               THEN 'not_applicable'
             ELSE 'not_generated'
           END AS cov_state
    FROM scope s
    JOIN learner_state ls ON ls.id = s.id
    LEFT JOIN target_year ty ON ty.institution_id = s.institution_id
  ),
  picked AS (
    SELECT * FROM eligible e
    WHERE p_coverage_state = 'all' OR e.cov_state = p_coverage_state
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
    FROM picked e
    LEFT JOIN public.institutions i   ON i.id   = e.institution_id
    LEFT JOIN public.programs     p   ON p.id   = e.program_id
    LEFT JOIN public.semesters    sem ON sem.id = e.semester_id
    LEFT JOIN public.sections     sec ON sec.id = e.section_id
    -- e.id last: without a unique tiebreaker the LIMIT picks a different set
    -- of learners between runs whenever the leading keys tie.
    ORDER BY i.name NULLS LAST, e.roll_number NULLS LAST,
             e.last_name, e.first_name, e.id
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
  -- LEARNER KEYS BEFORE BILL KEYS, and c.id to close the tie for good.
  -- Without them the sort fell through from roll_number straight to
  -- lb.due_date / lb.bill_description, which sorts the WHOLE institution by
  -- bill name and interleaves every learner who ties on roll number. The PDF
  -- export groups on runs of rows, so it printed one box per billing category
  -- per learner instead of one box per learner. 1,120 learners carry a NULL
  -- roll number and 457 more share one inside their institution, so the tie is
  -- routine, not a corner case.
  ORDER BY c.institution_name NULLS LAST, c.roll_number NULLS LAST,
           c.last_name, c.first_name, c.id,
           lb.due_date NULLS LAST, lb.bill_description;
END;
$function$;
