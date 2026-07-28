-- ============================================================================
-- 20260724090000 — Accountant advanced-reports RPCs
-- ============================================================================
-- Four SECURITY DEFINER aggregations for /billing/reports/accountant. Pattern
-- copied from 20260602094000/20260602100000 (billing analytics): permission
-- gate + get_user_accessible_institutions scope + IST dates.
-- Scheme cohort filter (p_scheme) resolves eligible student ids once.
--
-- SUPERSEDED (partial): get_billing_report_collections, get_billing_report_kpis
-- and get_billing_report_schemes were later CREATE OR REPLACEd — collected moved
-- from allocation-based receipt_items.amount_paid to receipts.payment_amount in
-- 20260724091000, and the cleared-bill payment_date filters moved to IST-date in
-- 20260724092000. get_billing_report_outstanding_by_year below is still the live
-- definition. Read those two migrations for the current collections/kpis/schemes
-- logic; the bodies here are retained only for migration history.
-- ============================================================================

-- 1) COLLECTIONS — grouped by college | course | date -------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_collections(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all',
  p_group_by text DEFAULT 'college'
) RETURNS TABLE(
  group_key text, group_label text, bill_count int, student_count int,
  collected numeric, outstanding numeric, collection_rate numeric,
  cleared_bill_count int, cleared_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme = 'first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type = 'FIRST GRADUATE'))
       OR (p_scheme = 'pmss' AND (lp.scholarship_type = 'PMS SCHOLARSHIP' OR q.code = 'pmss'))
       OR (p_scheme = 'scholarship_7_5' AND lp.scholarship_type = '7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  IF p_group_by = 'course' THEN
    RETURN QUERY
    WITH col AS (
      SELECT lp.program_id AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      JOIN learners_profiles lp ON lp.id = b.student_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY lp.program_id),
    bills AS (
      SELECT lp.program_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_amount
      FROM billing_student_bills b JOIN learners_profiles lp ON lp.id = b.student_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY lp.program_id)
    SELECT bills.k::text, COALESCE(p.program_name,'Unassigned')::text,
      COALESCE(bills.bill_count,0)::int, COALESCE(bills.student_count,0)::int,
      COALESCE(col.collected,0), COALESCE(bills.outstanding,0),
      CASE WHEN COALESCE(col.collected,0)+COALESCE(bills.outstanding,0) > 0
        THEN round(COALESCE(col.collected,0)/(COALESCE(col.collected,0)+COALESCE(bills.outstanding,0))*100,2) ELSE 0 END,
      COALESCE(bills.cleared_bill_count,0)::int, COALESCE(bills.cleared_amount,0)
    FROM bills LEFT JOIN col ON col.k = bills.k LEFT JOIN programs p ON p.id = bills.k
    ORDER BY COALESCE(col.collected,0) DESC;

  ELSIF p_group_by = 'date' THEN
    RETURN QUERY
    WITH col AS (
      SELECT r.payment_paid_date AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY r.payment_paid_date),
    clr AS (
      SELECT b.payment_date AS k, COUNT(*) AS cleared_bill_count, SUM(b.final_amount) AS cleared_amount
      FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid' AND b.payment_date IS NOT NULL
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.payment_date)
    SELECT to_char(d.k,'YYYY-MM-DD')::text, to_char(d.k,'DD Mon')::text,
      0::int, 0::int, COALESCE(col.collected,0), 0::numeric, 0::numeric,
      COALESCE(clr.cleared_bill_count,0)::int, COALESCE(clr.cleared_amount,0)
    FROM (SELECT k FROM col UNION SELECT k FROM clr) d
    LEFT JOIN col ON col.k = d.k LEFT JOIN clr ON clr.k = d.k
    ORDER BY d.k;

  ELSE  -- 'college'
    RETURN QUERY
    WITH col AS (
      SELECT b.institution_id AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.institution_id),
    bills AS (
      SELECT b.institution_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_amount
      FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.institution_id)
    SELECT i.id::text, i.name::text,
      COALESCE(bills.bill_count,0)::int, COALESCE(bills.student_count,0)::int,
      COALESCE(col.collected,0), COALESCE(bills.outstanding,0),
      CASE WHEN COALESCE(col.collected,0)+COALESCE(bills.outstanding,0) > 0
        THEN round(COALESCE(col.collected,0)/(COALESCE(col.collected,0)+COALESCE(bills.outstanding,0))*100,2) ELSE 0 END,
      COALESCE(bills.cleared_bill_count,0)::int, COALESCE(bills.cleared_amount,0)
    FROM institutions i JOIN bills ON bills.k = i.id LEFT JOIN col ON col.k = i.id
    WHERE i.id = ANY(v_inst)
    ORDER BY COALESCE(col.collected,0) DESC;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_collections(uuid[], date, date, uuid, text, text) TO authenticated;

-- 2) OUTSTANDING BY ACADEMIC YEAR --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_outstanding_by_year(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all'
) RETURNS TABLE(
  academic_year_id uuid, academic_year_name text, institution_id uuid,
  institution_name text, students_with_dues int, bill_count int, outstanding numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme='first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE'))
       OR (p_scheme='pmss' AND (lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss'))
       OR (p_scheme='scholarship_7_5' AND lp.scholarship_type='7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  RETURN QUERY
  SELECT b.academic_year_id, COALESCE(ay.academic_year_name,'Unassigned')::text,
    b.institution_id, i.name::text,
    COUNT(DISTINCT b.student_id)::int, COUNT(*)::int, SUM(b.balance_amount)
  FROM billing_student_bills b
  JOIN institutions i ON i.id = b.institution_id
  LEFT JOIN academic_years ay ON ay.id = b.academic_year_id
  WHERE b.institution_id = ANY(v_inst)
    AND b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0
    AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
  GROUP BY b.academic_year_id, ay.academic_year_name, b.institution_id, i.name
  ORDER BY ay.academic_year_name NULLS LAST, SUM(b.balance_amount) DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_outstanding_by_year(uuid[], uuid, text) TO authenticated;

-- 3) SCHEMES (First Graduate / PMSS / 7.5%) with approved concessions ---------
CREATE OR REPLACE FUNCTION public.get_billing_report_schemes(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  scheme text, scheme_label text, student_count int,
  billed numeric, collected numeric, outstanding numeric, concession_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH scheme_students AS (
    SELECT lp.id AS student_id,
      CASE
        WHEN lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE' THEN 'first_graduate'
        WHEN lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss' THEN 'pmss'
        WHEN lp.scholarship_type='7.5% SCHOLARSHIP' THEN 'scholarship_7_5'
        ELSE 'other' END AS scheme
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.institution_id = ANY(v_inst)),
  billagg AS (
    SELECT ss.scheme, COUNT(DISTINCT b.student_id) AS student_count,
      SUM(b.final_amount) FILTER (
        WHERE (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
          AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
      ) AS billed,
      SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding
    FROM billing_student_bills b JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  colagg AS (
    SELECT ss.scheme, SUM(ri.amount_paid) AS collected
    FROM billing_receipt_items ri
    JOIN billing_receipts r ON r.id = ri.receipt_id
    JOIN billing_student_bills b ON b.id = ri.bill_id
    JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  concagg AS (
    SELECT ss.scheme, SUM(d.discount_amount) AS concession_amount
    FROM billing_discounts d
    JOIN billing_student_bills b ON b.id = d.bill_id
    JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst) AND d.approval_status = 'approved'
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme)
  SELECT s.scheme,
    CASE s.scheme WHEN 'first_graduate' THEN 'First Graduate'
                  WHEN 'pmss' THEN 'PMSS'
                  WHEN 'scholarship_7_5' THEN '7.5% Scholarship' END::text,
    COALESCE(ba.student_count,0)::int, COALESCE(ba.billed,0), COALESCE(ca.collected,0),
    COALESCE(ba.outstanding,0), COALESCE(cc.concession_amount,0)
  FROM (SELECT unnest(ARRAY['first_graduate','pmss','scholarship_7_5']) AS scheme) s
  LEFT JOIN billagg ba ON ba.scheme = s.scheme
  LEFT JOIN colagg ca ON ca.scheme = s.scheme
  LEFT JOIN concagg cc ON cc.scheme = s.scheme
  ORDER BY s.scheme;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_schemes(uuid[], uuid, date, date) TO authenticated;

-- 4) HEADLINE KPIs -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_kpis(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all'
) RETURNS TABLE(
  collected numeric, outstanding numeric, cleared_bill_count int,
  cleared_amount numeric, concession_amount numeric, students_billed int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN
    RETURN QUERY SELECT 0::numeric,0::numeric,0,0::numeric,0::numeric,0; RETURN;
  END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme='first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE'))
       OR (p_scheme='pmss' AND (lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss'))
       OR (p_scheme='scholarship_7_5' AND lp.scholarship_type='7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  RETURN QUERY SELECT
    COALESCE((SELECT SUM(ri.amount_paid) FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id=ri.receipt_id JOIN billing_student_bills b ON b.id=ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT SUM(b.balance_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT COUNT(*) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0)::int,
    COALESCE((SELECT SUM(b.final_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT SUM(d.discount_amount) FROM billing_discounts d
      JOIN billing_student_bills b ON b.id=d.bill_id
      WHERE b.institution_id = ANY(v_inst) AND d.approval_status='approved'
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT COUNT(DISTINCT b.student_id) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
        AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0)::int;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_kpis(uuid[], date, date, uuid, text) TO authenticated;
