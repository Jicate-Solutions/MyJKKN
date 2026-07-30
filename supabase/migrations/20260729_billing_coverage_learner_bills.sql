-- Per-learner, per-bill detail behind the /billing/coverage PDF export.
--
-- The existing get_billing_coverage_learners returns ONE row per learner with
-- bill_count and total_billed. The PDF needs the bills themselves — academic
-- year, due date, total, paid and pending, per bill — so this returns one row
-- per (learner, bill).
--
-- LEFT JOIN, deliberately: the coverage screen defaults to coverage_state
-- 'not_generated', i.e. learners with NO bills. Those learners must still appear
-- in the PDF (as "No bills generated") or exporting the default view would
-- produce an empty document.
--
-- Doing this server-side rather than fetching learner ids and then their bills
-- avoids a large .in() list, which this repo has hit as a 400 URL-too-long.
--
-- ⚠ The scope predicate below MIRRORS get_billing_coverage_learners. The two
--   must move together — if a filter is added there and not here, the PDF
--   silently reports on a different population than the screen it was exported
--   from. Any new filter belongs in BOTH.

DROP FUNCTION IF EXISTS public.get_billing_coverage_learner_bills(
  uuid, uuid[], text[], uuid, text, boolean, text, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer);

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
  p_max_learners integer DEFAULT 1000
)
RETURNS TABLE(
  out_learner_id uuid,
  out_roll_number text,
  out_register_number text,
  out_full_name text,
  out_institution_name text,
  out_program_name text,
  out_semester_section text,
  out_lifecycle_status text,
  out_learner_total numeric,
  out_learner_paid numeric,
  out_learner_pending numeric,
  out_bill_id uuid,
  out_bill_description text,
  out_category_name text,
  out_bill_academic_year text,
  out_due_date date,
  out_bill_status text,
  out_total_amount numeric,
  out_paid_amount numeric,
  out_pending_amount numeric,
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
  -- Same key as the screen itself: exporting must never widen access.
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
  WITH billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.semester_id, lp.section_id, lp.lifecycle_status,
           lp.first_name, lp.last_name, lp.roll_number, lp.register_number
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
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
      AND (
        p_search IS NULL OR p_search = ''
        OR lp.roll_number ILIKE '%' || p_search || '%'
        OR lp.register_number ILIKE '%' || p_search || '%'
        OR (COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,''))
             ILIKE '%' || p_search || '%'
      )
  ),
  -- Live bills only. 'cancelled' and 'superseded' are BOTH void states; counting
  -- either would overstate what the learner actually owes.
  live_bills AS (
    SELECT b.*
    FROM public.billing_student_bills b
    JOIN scope s ON s.id = b.student_id
    WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      AND (p_billing_category_id IS NULL OR b.item_category_id = p_billing_category_id)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
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
         -- 62 bills carry no academic year; label rather than drop the row.
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
  uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learner_bills(
  uuid, uuid[], text[], uuid, text, boolean, text, uuid[], text, text,
  uuid, uuid, uuid, uuid, uuid, integer) TO authenticated, service_role;
