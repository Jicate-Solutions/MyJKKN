-- ============================================================================
-- 20260602100000 — Add students_with_dues to get_billing_analytics_by_institution
-- ============================================================================
-- Institution-wise count of DISTINCT students who have at least one bill with a
-- positive balance (fees pending). Distinct from student_count, which is
-- students *billed* in the range — a billed student may be fully paid.
-- RETURNS TABLE columns change, so DROP + recreate (CREATE OR REPLACE can't
-- alter a function's output columns).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_billing_analytics_by_institution(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_institution(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  institution_id uuid, institution_name varchar, total_billed numeric,
  total_collected numeric, total_outstanding numeric, collection_rate numeric,
  bill_count int, student_count int, students_with_dues int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.name::varchar,
    COALESCE(b.billed,0), COALESCE(rc.collected,0), COALESCE(o.outstanding,0),
    CASE WHEN COALESCE(b.billed,0) > 0 THEN round(COALESCE(rc.collected,0)/b.billed*100,2) ELSE 0 END,
    COALESCE(b.bill_count,0)::int, COALESCE(b.student_count,0)::int,
    COALESCE(o.students_with_dues,0)::int
  FROM institutions i
  LEFT JOIN (
    SELECT institution_id, SUM(final_amount) billed, COUNT(*) bill_count, COUNT(DISTINCT student_id) student_count
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY institution_id) b ON b.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(payment_amount) collected
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY institution_id) rc ON rc.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(balance_amount) outstanding, COUNT(DISTINCT student_id) students_with_dues
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0
    GROUP BY institution_id) o ON o.institution_id = i.id
  WHERE i.id = ANY(v_inst)
    AND (COALESCE(b.billed,0) > 0 OR COALESCE(rc.collected,0) > 0 OR COALESCE(o.outstanding,0) > 0)
  ORDER BY COALESCE(o.outstanding,0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_institution(uuid[], date, date) TO authenticated;
