-- ============================================================================
-- Bill Coverage: expose Total Paid alongside Total Billed
-- ============================================================================
-- REQUEST (2026-08-11, /billing/coverage): the XLS/CSV export carries "Total
-- Billed" but no "Total Paid", so a coverage sheet cannot be reconciled without
-- pulling a second report. The column did not exist to export — the list RPC's
-- RETURNS TABLE only ever produced out_bill_count and out_total_billed.
--
-- PAID IS NOT REDEFINED HERE. get_billing_coverage_learner_bills (the PDF
-- export, migration 20260729) already settled the arithmetic:
--
--     paid = SUM(final_amount - balance_amount)
--
-- over the SAME live-bill set the coverage verdict itself is computed from —
-- status NOT IN ('cancelled','superseded'), the bill's OWN academic_year_id
-- equal to the target year, and the optional category filter. Deriving paid any
-- other way here (e.g. from receipts, or over all years) would let the XLS and
-- the PDF report different figures for the same learner on the same filters,
-- which is the failure mode 20260808120000 was written to end.
--
-- COALESCE on balance_amount is deliberate. The column is nullable with DEFAULT
-- 0; a NULL would make `final_amount - balance_amount` NULL, SUM would skip that
-- bill, and total_paid would silently understate while total_billed still
-- counted it. Zero live bills are NULL today (13,425 checked 2026-08-11) — the
-- guard is there so that stays true by construction rather than by luck.
--
-- 'total_paid' also joins the sort whitelist. A header the RPC does not
-- recognise falls through to the default order while the UI still draws a sort
-- arrow, so a sortable column MUST be added in both places or it lies.
-- ============================================================================

-- ── Learner list ────────────────────────────────────────────────────────────
-- DROP + CREATE, not CREATE OR REPLACE: out_total_paid is a new RETURNS TABLE
-- column and Postgres cannot replace a function whose output type changed.
-- DROP discards the ACL, so the grants at the bottom are mandatory, not
-- tidy-up — without them EXECUTE reverts to the PUBLIC default.
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
  out_total_paid numeric,
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
    -- year being MEASURED, never the learners being measured — see
    -- 20260808120000_billing_coverage_target_academic_year.sql.
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
         WHEN 'bill_count'   THEN f.bill_count::numeric
         WHEN 'total_billed' THEN f.total_billed
         WHEN 'total_paid'   THEN f.total_paid
       END
     END) ASC NULLS LAST,
    (CASE WHEN NOT v_asc THEN
       CASE p_sort_by
         WHEN 'bill_count'   THEN f.bill_count::numeric
         WHEN 'total_billed' THEN f.total_billed
         WHEN 'total_paid'   THEN f.total_paid
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
