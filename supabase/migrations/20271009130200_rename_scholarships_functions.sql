-- ─── Rename billing "discounts" → "scholarships" — part 3 of 4: functions that named the table / columns ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale and dependency scan.
-- Split from one file because a single 35 KB exec_sql call hit the 57014 statement timeout.
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).

-- ── 9. Functions whose bodies named the table / columns ─────────────────────
-- Same signature → CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.delete_bill_with_cascade(bill_id_param uuid)
 RETURNS TABLE(deleted_table text, deleted_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    bill_record RECORD;
    student_id_var UUID;
    deletion_summary JSONB := '{}';
    temp_count INTEGER;
BEGIN
    -- First, verify the bill exists and get student info
    SELECT * INTO bill_record
    FROM billing_student_bills
    WHERE id = bill_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill with ID % not found', bill_id_param;
    END IF;

    student_id_var := bill_record.student_id;

    -- Log what we're about to delete
    RAISE NOTICE 'Deleting bill % for student %', bill_id_param, student_id_var;

    -- Count related records before deletion for reporting
    SELECT COUNT(*) INTO temp_count FROM billing_scholarships WHERE bill_id = bill_id_param;
    deletion_summary := deletion_summary || jsonb_build_object('scholarships_to_delete', temp_count);

    SELECT COUNT(*) INTO temp_count FROM billing_receipt_items WHERE bill_id = bill_id_param;
    deletion_summary := deletion_summary || jsonb_build_object('receipt_items_to_delete', temp_count);

    -- The actual deletion - this will cascade automatically due to foreign key constraints
    DELETE FROM billing_student_bills WHERE id = bill_id_param;

    -- Return summary of what was deleted
    RETURN QUERY SELECT
        'billing_student_bills'::TEXT as deleted_table,
        1 as deleted_count,
        deletion_summary || jsonb_build_object(
            'bill_id', bill_id_param,
            'student_id', student_id_var,
            'bill_description', bill_record.bill_description,
            'deleted_at', NOW()
        ) as details;

    -- Note: Related records are automatically deleted by CASCADE constraints
    -- The mv_student_billing_summary will be automatically refreshed by the trigger

END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_bill_deletion(bill_id_param uuid)
 RETURNS TABLE(affected_table text, record_count integer, sample_records jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    bill_record RECORD;
BEGIN
    -- Check if bill exists
    SELECT * INTO bill_record
    FROM billing_student_bills
    WHERE id = bill_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill with ID % not found', bill_id_param;
    END IF;

    -- Show the main bill
    RETURN QUERY SELECT
        'billing_student_bills'::TEXT as affected_table,
        1 as record_count,
        jsonb_build_object(
            'id', bill_record.id,
            'description', bill_record.bill_description,
            'amount', bill_record.final_amount,
            'status', bill_record.status
        ) as sample_records;

    -- Show scholarships that would be deleted
    RETURN QUERY SELECT
        'billing_scholarships'::TEXT as affected_table,
        COUNT(*)::INTEGER as record_count,
        jsonb_agg(jsonb_build_object(
            'id', id,
            'scholarship_amount', scholarship_amount,
            'scholarship_reason', scholarship_reason
        )) as sample_records
    FROM billing_scholarships
    WHERE bill_id = bill_id_param;

    -- Show receipt items that would be deleted
    RETURN QUERY SELECT
        'billing_receipt_items'::TEXT as affected_table,
        COUNT(*)::INTEGER as record_count,
        jsonb_agg(jsonb_build_object(
            'id', id,
            'amount_paid', amount_paid,
            'receipt_id', receipt_id
        )) as sample_records
    FROM billing_receipt_items
    WHERE bill_id = bill_id_param;

END;
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_analytics_overview(p_institution_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid[];
  v_billed numeric := 0; v_collected numeric := 0; v_refunds numeric := 0;
  v_scholarships numeric := 0; v_outstanding numeric := 0;
  v_students int := 0; v_total int := 0; v_paid int := 0; v_unpaid int := 0; v_partial int := 0;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('total_billed',0,'total_collected',0,'net_collected',0,
      'total_outstanding',0,'collection_rate',0,'students_billed',0,'total_bills',0,
      'bills_paid',0,'bills_unpaid',0,'bills_partially_paid',0,'total_scholarships',0,'total_refunds',0);
  END IF;

  SELECT COALESCE(SUM(final_amount),0), COUNT(*),
         COUNT(*) FILTER (WHERE status = 'paid'),
         COUNT(*) FILTER (WHERE status = 'unpaid'),
         COUNT(*) FILTER (WHERE status = 'partially_paid'),
         COUNT(DISTINCT student_id)
  INTO v_billed, v_total, v_paid, v_unpaid, v_partial, v_students
  FROM billing_student_bills
  WHERE institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
    AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to);

  SELECT COALESCE(SUM(balance_amount),0) INTO v_outstanding
  FROM billing_student_bills
  WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0;

  SELECT COALESCE(SUM(payment_amount),0) INTO v_collected
  FROM billing_receipts
  WHERE institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
    AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to);

  SELECT COALESCE(SUM(r.refund_amount),0) INTO v_refunds
  FROM billing_refunds r JOIN billing_receipts rc ON rc.id = r.receipt_id
  WHERE rc.institution_id = ANY(v_inst) AND r.approval_status = 'processed'
    AND (p_date_from IS NULL OR r.refund_date >= p_date_from)
    AND (p_date_to   IS NULL OR r.refund_date <= p_date_to);

  SELECT COALESCE(SUM(d.scholarship_amount),0) INTO v_scholarships
  FROM billing_scholarships d JOIN billing_student_bills b ON b.id = d.bill_id
  WHERE b.institution_id = ANY(v_inst) AND d.approval_status = 'approved'
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to);

  RETURN jsonb_build_object(
    'total_billed', v_billed, 'total_collected', v_collected,
    'net_collected', GREATEST(v_collected - v_refunds, 0),
    'total_outstanding', v_outstanding,
    'collection_rate', CASE WHEN v_billed > 0 THEN round((v_collected / v_billed) * 100, 2) ELSE 0 END,
    'students_billed', v_students, 'total_bills', v_total,
    'bills_paid', v_paid, 'bills_unpaid', v_unpaid, 'bills_partially_paid', v_partial,
    'total_scholarships', v_scholarships, 'total_refunds', v_refunds);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_report_kpis(p_institution_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_academic_year_id uuid DEFAULT NULL::uuid, p_scheme text DEFAULT 'all'::text)
 RETURNS TABLE(collected numeric, outstanding numeric, cleared_bill_count integer, cleared_amount numeric, concession_amount numeric, students_billed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE((SELECT SUM(d.scholarship_amount) FROM billing_scholarships d
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
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_report_schemes(p_institution_ids uuid[] DEFAULT NULL::uuid[], p_academic_year_id uuid DEFAULT NULL::uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(scheme text, scheme_label text, student_count integer, billed numeric, collected numeric, outstanding numeric, concession_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT lp.id AS student_id, lp.academic_year_id AS academic_year_id,
      CASE
        WHEN lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE' THEN 'first_graduate'
        WHEN lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss' THEN 'pmss'
        WHEN lp.scholarship_type='7.5% SCHOLARSHIP' THEN 'scholarship_7_5'
        ELSE 'other' END AS scheme
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.institution_id = ANY(v_inst)),
  billagg AS (
    SELECT ss.scheme, COUNT(DISTINCT b.student_id) AS student_count,
      SUM(b.final_amount) FILTER (WHERE (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
                                    AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)) AS billed,
      SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding
    FROM billing_student_bills b JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  colagg AS (
    SELECT ss.scheme, SUM(r.payment_amount) AS collected
    FROM billing_receipts r
    JOIN scheme_students ss ON ss.student_id = r.student_id
    WHERE r.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
      AND (p_academic_year_id IS NULL OR ss.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  concagg AS (
    SELECT ss.scheme, SUM(d.scholarship_amount) AS concession_amount
    FROM billing_scholarships d
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
$function$;

