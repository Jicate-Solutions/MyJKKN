-- Transport fee collectables — say WHICH KIND OF PERSON each row is.
--
-- fn_list_transport_collectables has always returned two populations UNIONed
-- together: learners (billing_student_bills joined to a 'transport' billing
-- category) and Senior Learners (tms_fee_bill where person_type = 'staff').
-- Today that is 1,266 learners and 35 Senior Learners in one undifferentiated list.
--
-- It returned NO discriminator, so /billing/transport could not tell them apart,
-- could not filter by type, and could not stop itself linking a Senior Learner's
-- name at /billing/schedule/students/<id> — a learner billing page that will
-- never resolve a staff.id. The only signal available to the UI was "degree,
-- programme and semester are all NULL", which is a guess, not a fact: a learner
-- whose programme has not been assigned matches it too.
--
-- This adds `person_type` ('learner' | 'staff') as the LAST column, so the two
-- CTEs and the UNION stay positionally aligned.
--
-- ── WHY DROP + CREATE ────────────────────────────────────────────────────────
-- CREATE OR REPLACE cannot change a function's RETURNS TABLE signature. The drop
-- takes the grants with it, so they are restored explicitly below — this database
-- has lost EXECUTE on a SECURITY DEFINER function this exact way before, which
-- 403'd every caller who legitimately held the permission. Restored to the
-- pre-migration ACL, verified from pg_proc.proacl:
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ─────────────────────────────────────────
-- Team-member rows are still excluded whenever p_academic_year_id is supplied
-- (`AND p_academic_year_id IS NULL`). That is not an oversight to quietly patch:
-- tms_fee_bill is keyed by transport_year_id, a different dimension from the
-- academic_year_id this filter carries, and there is no defensible mapping
-- between them. Inventing one here would silently attribute a Senior Learner's
-- transport bill to an academic year nobody assigned it to. The UI now states
-- this in words instead.

DROP FUNCTION IF EXISTS public.fn_list_transport_collectables(uuid[], uuid);

CREATE FUNCTION public.fn_list_transport_collectables(
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
  semester_name text,
  person_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  WITH learners AS (
    SELECT
      lp.id AS student_id,
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
      COALESCE(deg.display_name, deg.degree_name)::text       AS degree_name,
      COALESCE(dept.display_name, dept.department_name)::text AS department_name,
      COALESCE(prog.display_name, prog.program_name)::text    AS program_name,
      sem.semester_name::text                                 AS semester_name,
      'learner'::text                                         AS person_type
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
  ),
  staff_rows AS (
    SELECT
      s.id AS student_id,
      s.first_name,
      s.last_name,
      s.staff_id AS roll_number,
      s.institution_id,
      rt.route_number,
      rt.route_name,
      st.stop_name,
      COALESCE(SUM(fb.amount) FILTER (WHERE fb.status <> 'cancelled'), 0) AS total_billed,
      COALESCE(SUM(fb.amount) FILTER (WHERE fb.status IN ('staff_deferred','generated')), 0) AS outstanding_amount,
      ARRAY[]::uuid[] AS payable_bill_ids,
      COUNT(fb.id)::int AS bill_count,
      COALESCE(
        array_agg('Staff Transport Fee — Term ' || fb.term_no ORDER BY fb.due_date)
          FILTER (WHERE fb.status <> 'cancelled'),
        ARRAY[]::text[]
      ) AS bill_descriptions,
      NULL::text AS degree_name,
      COALESCE(dept.display_name, dept.department_name)::text AS department_name,
      NULL::text AS program_name,
      NULL::text AS semester_name,
      'staff'::text AS person_type
    FROM public.staff s
    JOIN public.tms_fee_bill fb
      ON fb.person_id = s.id AND fb.person_type = 'staff'
    LEFT JOIN public.tms_route rt      ON rt.id = s.transport_route_id
    LEFT JOIN public.tms_route_stop st ON st.id = s.transport_stop_id
    LEFT JOIN public.departments dept  ON dept.id = s.department_id
    WHERE s.institution_id = ANY(v_accessible)
      AND (p_institution_ids IS NULL OR s.institution_id = ANY(p_institution_ids))
      AND p_academic_year_id IS NULL
    GROUP BY s.id, s.first_name, s.last_name, s.staff_id, s.institution_id,
             rt.route_number, rt.route_name, st.stop_name,
             dept.display_name, dept.department_name
  )
  SELECT u.*
  FROM (SELECT * FROM learners UNION ALL SELECT * FROM staff_rows) u
  ORDER BY u.first_name, u.last_name;
END;
$function$;

-- Restore the OWNER. CREATE FUNCTION makes the running role the owner, and a
-- SECURITY DEFINER function executes with its owner's privileges — so applying
-- this migration as supabase_admin (or any migrator that is not postgres) would
-- silently change whose privileges a privilege-bypassing function runs with.
-- One level deeper than the grant loss the header warns about.
ALTER FUNCTION public.fn_list_transport_collectables(uuid[], uuid) OWNER TO postgres;

-- Restore the pre-drop ACL exactly. Without this the function is executable by
-- nobody but its owner and every caller gets a permission error.
--
-- anon is revoked EXPLICITLY, not just via PUBLIC. Supabase issues a standing
-- GRANT EXECUTE ON ALL FUNCTIONS TO anon, and that explicit grant SURVIVES a
-- REVOKE ... FROM PUBLIC — so "revoke PUBLIC + grant authenticated" alone can
-- leave a SECURITY DEFINER function callable by any holder of the anon key,
-- which is embedded in every browser bundle. This function reads billing
-- figures for a whole institution.
REVOKE ALL ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) TO service_role;
