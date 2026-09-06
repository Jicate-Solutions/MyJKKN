-- Fix 42804 "Returned type character varying(100) does not match expected type
-- text in column 14" from fn_list_transport_collectables.
--
-- The academic-dims migration (20260619170000) added degree/department/program/
-- semester name columns declared as `text` in RETURNS TABLE, but their source
-- columns are varchar (degrees/departments = varchar(100|255), semesters =
-- varchar(255); programs is already text). PL/pgSQL checks the body's column
-- types against the declared RETURNS TABLE types EXACTLY at RETURN QUERY time --
-- varchar(n) != text -- so the function errored on the first such column
-- (degree_name, column 14). Cast every name expression to ::text.
--
-- RETURNS TABLE signature is unchanged (still all text), so CREATE OR REPLACE
-- keeps the existing grants; GRANTs restated to match the module's pattern.

CREATE OR REPLACE FUNCTION public.fn_list_transport_collectables(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_academic_year_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  student_id uuid,
  first_name text,
  last_name text,
  roll_number text,
  institution_id uuid,
  route_number text,
  route_name text,
  stop_name text,
  total_billed numeric,
  outstanding_amount numeric,
  payable_bill_ids uuid[],
  bill_count integer,
  bill_descriptions text[],
  degree_name text,
  department_name text,
  program_name text,
  semester_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_accessible uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.transport.view') THEN
    RAISE EXCEPTION 'Not authorized: billing.transport.view required';
  END IF;

  SELECT array_agg(gai.institution_id)
    INTO v_accessible
  FROM public.get_user_accessible_institutions(auth.uid()) AS gai;
  IF v_accessible IS NULL THEN
    v_accessible := ARRAY[]::uuid[];
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.institution_id,
    rt.route_number,
    rt.route_name,
    st.stop_name,
    COALESCE(SUM(bsb.final_amount) FILTER (WHERE bsb.status NOT IN ('cancelled','superseded')), 0) AS total_billed,
    COALESCE(SUM(
      CASE WHEN bsb.status IN ('unpaid','partially_paid')
           THEN COALESCE(bsb.balance_amount, bsb.final_amount, bsb.total_amount, 0)
           ELSE 0 END
    ), 0) AS outstanding_amount,
    COALESCE(
      array_agg(bsb.id) FILTER (WHERE bsb.status IN ('unpaid','partially_paid')),
      ARRAY[]::uuid[]
    ) AS payable_bill_ids,
    COUNT(bsb.id)::int AS bill_count,
    COALESCE(
      array_agg(bsb.bill_description ORDER BY bsb.due_date)
        FILTER (WHERE bsb.status NOT IN ('cancelled','superseded') AND bsb.bill_description IS NOT NULL),
      ARRAY[]::text[]
    ) AS bill_descriptions,
    COALESCE(deg.display_name, deg.degree_name)::text      AS degree_name,
    COALESCE(dept.display_name, dept.department_name)::text AS department_name,
    COALESCE(prog.display_name, prog.program_name)::text   AS program_name,
    sem.semester_name::text                                AS semester_name
  FROM public.learners_profiles lp
  JOIN public.billing_student_bills bsb
    ON bsb.student_id = lp.id
  JOIN public.billing_categories bc
    ON bc.id = bsb.item_category_id AND bc.kind = 'transport'
  LEFT JOIN public.tms_route rt      ON rt.id = lp.transport_route_id
  LEFT JOIN public.tms_route_stop st ON st.id = lp.transport_stop_id
  LEFT JOIN public.degrees deg       ON deg.id = lp.degree_id
  LEFT JOIN public.departments dept  ON dept.id = lp.department_id
  LEFT JOIN public.programs prog     ON prog.id = lp.program_id
  LEFT JOIN public.semesters sem     ON sem.id = lp.semester_id
  WHERE lp.institution_id = ANY(v_accessible)
    AND (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_academic_year_id IS NULL OR bsb.academic_year_id = p_academic_year_id)
  GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.institution_id,
           rt.route_number, rt.route_name, st.stop_name,
           deg.display_name, deg.degree_name, dept.display_name, dept.department_name,
           prog.display_name, prog.program_name, sem.semester_name
  ORDER BY lp.first_name, lp.last_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) TO authenticated, service_role;
