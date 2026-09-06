-- Per-student current-academic-year billing rollup for the Campus Living
-- Residents → Learners tab. SECURITY DEFINER so campus-living operators (who
-- typically lack billing.schedule.view) can read aggregates; scoped to the
-- caller's accessible institutions to prevent cross-institution leakage.

CREATE OR REPLACE FUNCTION public.campus_living_get_hostelite_bill_status(p_student_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  academic_year_id uuid,
  academic_year_name text,
  bill_count integer,
  total_billed numeric,
  total_paid numeric,
  total_outstanding numeric,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('campus_living.residents.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.residents.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH students AS (
    SELECT lp.id AS sid, lp.academic_year_id AS ayid
    FROM learners_profiles lp
    WHERE lp.id = ANY(p_student_ids)
      AND lp.institution_id = ANY(public._user_accessible_institutions())
  ),
  agg AS (
    SELECT b.student_id AS sid,
           count(*)::int AS bill_count,
           COALESCE(sum(b.final_amount), 0) AS total_billed,
           COALESCE(sum(b.balance_amount), 0) AS total_outstanding
    FROM billing_student_bills b
    JOIN students s ON s.sid = b.student_id
    WHERE s.ayid IS NOT NULL
      AND b.academic_year_id = s.ayid
      AND b.status NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id
  )
  SELECT
    s.sid,
    s.ayid,
    ay.academic_year_name::text,
    COALESCE(a.bill_count, 0)::int,
    COALESCE(a.total_billed, 0)::numeric,
    (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0))::numeric,
    COALESCE(a.total_outstanding, 0)::numeric,
    (CASE
      WHEN COALESCE(a.bill_count, 0) = 0 THEN 'none'
      WHEN COALESCE(a.total_outstanding, 0) <= 0 THEN 'paid'
      WHEN (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0)) > 0 THEN 'partial'
      ELSE 'unpaid'
    END)::text
  FROM students s
  LEFT JOIN agg a ON a.sid = s.sid
  LEFT JOIN academic_years ay ON ay.id = s.ayid;
END
$function$;

GRANT EXECUTE ON FUNCTION public.campus_living_get_hostelite_bill_status(uuid[]) TO authenticated;
