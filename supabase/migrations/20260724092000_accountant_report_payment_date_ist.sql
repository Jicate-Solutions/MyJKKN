-- ============================================================================
-- 20260724092000 — Accountant reports: IST-correct payment_date filtering
-- ============================================================================
-- CORRECTION to 20260724091000 (and 090000). billing_student_bills.payment_date
-- is `timestamp with time zone`, but the cleared-bill filters compared it to the
-- `date` bounds p_date_from / p_date_to directly. Under a UTC session TZ, a bare
-- `payment_date <= DATE '2026-07-24'` casts the bound to 2026-07-24 00:00:00 UTC,
-- so every payment made later that day (and, via UTC↔IST skew, everything from
-- ~18:30 UTC the prior day) is silently dropped from "cleared" figures. Proven
-- against production: the default "This Month" preset returned 373 bills / ₹56.9L
-- with the bare filter vs 442 bills / ₹146.8L with the IST-date cast, and the
-- "Today" preset returned 0 vs 69.
--
-- This migration CREATE OR REPLACEs the two functions whose cleared-bill logic
-- touches payment_date, wrapping every comparison (and, in the date branch, the
-- GROUP BY key) in `(payment_date AT TIME ZONE 'Asia/Kolkata')::date` — the exact
-- pattern already used for created_at. The date branch previously grouped by the
-- raw timestamptz, which also fragmented cleared bills into per-instant rows and
-- mismatched the date-keyed collections; grouping by the IST date fixes both.
--
-- Unchanged from 091000: collected = SUM(billing_receipts.payment_amount) with
-- academic-year attribution, the union-of-keys merge, and the scheme cohort
-- predicate. get_billing_report_outstanding_by_year (090000) and
-- get_billing_report_schemes (091000) do not filter cleared bills by
-- payment_date and are left as-is. Scheme cohort definitions in the global
-- filter (inclusive OR) and the Schemes breakdown (CASE precedence) are
-- equivalent for current data (0 students match more than one scheme).
-- ============================================================================

-- 1) COLLECTIONS -------------------------------------------------------------
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
      SELECT lp.program_id AS k, SUM(r.payment_amount) AS collected
      FROM billing_receipts r
      LEFT JOIN learners_profiles lp ON lp.id = r.student_id
      WHERE r.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR r.student_id = ANY(v_students))
      GROUP BY lp.program_id),
    bills AS (
      SELECT lp.program_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from) AND (p_date_to IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from) AND (p_date_to IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)) AS cleared_amount
      FROM billing_student_bills b JOIN learners_profiles lp ON lp.id = b.student_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY lp.program_id)
    SELECT COALESCE(keys.k::text,'unassigned'), COALESCE(p.program_name,'Unassigned')::text,
      COALESCE(bills.bill_count,0)::int, COALESCE(bills.student_count,0)::int,
      COALESCE(col.collected,0), COALESCE(bills.outstanding,0),
      CASE WHEN COALESCE(col.collected,0)+COALESCE(bills.outstanding,0) > 0
        THEN round(COALESCE(col.collected,0)/(COALESCE(col.collected,0)+COALESCE(bills.outstanding,0))*100,2) ELSE 0 END,
      COALESCE(bills.cleared_bill_count,0)::int, COALESCE(bills.cleared_amount,0)
    FROM (SELECT k FROM col UNION SELECT k FROM bills) keys
    LEFT JOIN col   ON col.k   IS NOT DISTINCT FROM keys.k
    LEFT JOIN bills ON bills.k IS NOT DISTINCT FROM keys.k
    LEFT JOIN programs p ON p.id = keys.k
    ORDER BY COALESCE(col.collected,0) DESC;

  ELSIF p_group_by = 'date' THEN
    RETURN QUERY
    WITH col AS (
      SELECT r.payment_paid_date AS k, SUM(r.payment_amount) AS collected
      FROM billing_receipts r
      LEFT JOIN learners_profiles lp ON lp.id = r.student_id
      WHERE r.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR r.student_id = ANY(v_students))
      GROUP BY r.payment_paid_date),
    clr AS (
      SELECT (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date AS k, COUNT(*) AS cleared_bill_count, SUM(b.final_amount) AS cleared_amount
      FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid' AND b.payment_date IS NOT NULL
        AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
        AND (p_date_to   IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date)
    SELECT to_char(d.k,'YYYY-MM-DD')::text, to_char(d.k,'DD Mon')::text,
      0::int, 0::int, COALESCE(col.collected,0), 0::numeric, 0::numeric,
      COALESCE(clr.cleared_bill_count,0)::int, COALESCE(clr.cleared_amount,0)
    FROM (SELECT k FROM col UNION SELECT k FROM clr) d
    LEFT JOIN col ON col.k = d.k LEFT JOIN clr ON clr.k = d.k
    ORDER BY d.k;

  ELSE  -- 'college'
    RETURN QUERY
    WITH col AS (
      SELECT r.institution_id AS k, SUM(r.payment_amount) AS collected
      FROM billing_receipts r
      LEFT JOIN learners_profiles lp ON lp.id = r.student_id
      WHERE r.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR r.student_id = ANY(v_students))
      GROUP BY r.institution_id),
    bills AS (
      SELECT b.institution_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from) AND (p_date_to IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from) AND (p_date_to IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)) AS cleared_amount
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
    FROM (SELECT k FROM col UNION SELECT k FROM bills) keys
    JOIN institutions i ON i.id = keys.k
    LEFT JOIN col ON col.k = keys.k
    LEFT JOIN bills ON bills.k = keys.k
    WHERE i.id = ANY(v_inst)
    ORDER BY COALESCE(col.collected,0) DESC;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_collections(uuid[], date, date, uuid, text, text) TO authenticated;

-- 2) HEADLINE KPIs (payment_date cleared filters → IST date) ------------------
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
    COALESCE((SELECT SUM(r.payment_amount) FROM billing_receipts r
      LEFT JOIN learners_profiles lp ON lp.id = r.student_id
      WHERE r.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR r.student_id = ANY(v_students))),0),
    COALESCE((SELECT SUM(b.balance_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT COUNT(*) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
        AND (p_date_to   IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0)::int,
    COALESCE((SELECT SUM(b.final_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
        AND (p_date_to   IS NULL OR (b.payment_date AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
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
