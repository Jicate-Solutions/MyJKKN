-- ============================================================================
-- Fix: get_billing_daily_activity — "column reference institution_id is ambiguous" (42702)
-- ============================================================================
-- The RETURNS TABLE OUT column `institution_id` shadows the unqualified
-- `institution_id` in the scoping query (it could refer to either the PL/pgSQL
-- OUT variable or the column returned by get_user_accessible_institutions).
-- The sibling analytics RPCs don't hit this because none of them return an
-- `institution_id` column. Fix: alias get_user_accessible_institutions(...) as
-- `gua` and qualify the reference. (Corrects migration 20260618150000.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_daily_activity(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(
  activity_date date,
  institution_id uuid,
  institution_name text,
  bills_created integer,
  amount_billed numeric,
  students_billed integer,
  receipts_created integer,
  amount_collected numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(gua.institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) gua
  WHERE (p_institution_ids IS NULL OR gua.institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH bills AS (
    SELECT (b.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           b.institution_id AS inst,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(b.final_amount), 0) AS amt,
           COUNT(DISTINCT b.student_id)::int AS students
    FROM billing_student_bills b
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY 1, 2
  ),
  rec AS (
    SELECT r.payment_paid_date AS d,
           r.institution_id AS inst,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(r.payment_amount), 0) AS amt
    FROM billing_receipts r
    WHERE r.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
    GROUP BY 1, 2
  ),
  merged AS (
    SELECT
      COALESCE(b.d, rec.d)              AS d,
      COALESCE(b.inst, rec.inst)        AS inst,
      COALESCE(b.cnt, 0)                AS bills_created,
      COALESCE(b.amt, 0)                AS amount_billed,
      COALESCE(b.students, 0)           AS students_billed,
      COALESCE(rec.cnt, 0)              AS receipts_created,
      COALESCE(rec.amt, 0)              AS amount_collected
    FROM bills b
    FULL JOIN rec ON rec.d = b.d AND rec.inst = b.inst
  )
  SELECT m.d, m.inst, COALESCE(i.name, 'Unknown')::text,
         m.bills_created, m.amount_billed, m.students_billed,
         m.receipts_created, m.amount_collected
  FROM merged m
  LEFT JOIN institutions i ON i.id = m.inst
  WHERE m.d IS NOT NULL
  ORDER BY m.d DESC, COALESCE(i.name, '') ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_daily_activity(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_daily_activity(uuid[], date, date) TO authenticated, service_role;
