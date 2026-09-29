-- Collection report (day-wise view) for /billing/reports?tab=collection.
--
-- Same scope contract as get_billing_reports_collection (20260725160000):
-- institution access via get_user_accessible_institutions, cohort via
-- billing_report_student_cohort, bill-level academic-year / category as a
-- semi-join. Adds the transaction detail the counter needs when tallying a
-- day: reference / transaction number, DD bank + branch, remitter name, date
-- of credit, payer name + contact, who collected it (accountant, falling
-- back to created_by — gateway receipts have neither and read as "System"),
-- and the fee categories the receipt settled: `categories` is the distinct
-- names joined for display, `category_breakdown` is [{category, amount}]
-- (amount_paid per category, gross of refunds) for the category pivot.
--
-- Ordered ASC by receipt_date then receipt_number so the client can group
-- consecutive rows into day sections without re-sorting. Refund columns match
-- the collection RPC so net figures reconcile with the Collection tab.
--
-- No LIMIT/OFFSET: a day-wise sheet is always the whole range. Capped at
-- 10,000 rows like the other report RPCs.

-- The return type grew (categories, category_breakdown) after a first cut of
-- this function was hand-applied; CREATE OR REPLACE cannot change a RETURNS
-- TABLE shape (42P13), so drop first. Safe: no other object depends on it.
DROP FUNCTION IF EXISTS public.get_billing_reports_collection_daywise(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], text[], uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_billing_reports_collection_daywise(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_accommodation_codes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
) RETURNS TABLE(
  receipt_id uuid, receipt_number text, receipt_date date,
  first_name text, last_name text, roll_number text,
  institution_name text, program_name text, semester_name text,
  payment_mode text, payment_reference_number text,
  dd_bank_name text, dd_branch text, remitter_name text,
  payment_paid_date date, date_of_credit date,
  payer_name text, payer_contact text, collected_by text,
  payment_remarks text,
  categories text, category_breakdown jsonb,
  payment_amount numeric, total_refunds numeric, net_amount numeric,
  has_refunds boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  WITH scoped AS (
    SELECT r.id, r.receipt_number, r.receipt_date, r.payment_mode,
           r.payment_reference_number, r.dd_bank_name, r.dd_branch,
           r.remitter_name, r.payment_paid_date, r.date_of_credit,
           r.payer_name, r.payer_contact, r.payment_remarks,
           r.accountant_id, r.created_by,
           r.payment_amount, r.student_id, r.institution_id
    FROM public.billing_receipts r
    JOIN public.billing_report_student_cohort(
           p_degree_id, p_department_id, p_program_id,
           p_semester_id, p_section_id, p_schemes, p_accommodation_codes) c ON c.student_id = r.student_id
    WHERE r.institution_id = ANY(v_inst)
      AND (p_student_id IS NULL OR r.student_id = p_student_id)
      AND (p_date_from IS NULL OR r.receipt_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.receipt_date <= p_date_to)
      AND (
        (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT COALESCE(p_academic_year_unspecified, false))
        OR EXISTS (
          SELECT 1
          FROM public.billing_receipt_items ri
          JOIN public.billing_student_bills b ON b.id = ri.bill_id
          WHERE ri.receipt_id = r.id
            AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
            AND (CASE
                   WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
                   WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
                   ELSE true END))
      )
  ),
  refs AS (
    SELECT rf.receipt_id AS rid, SUM(rf.refund_amount) AS total_refunds
    FROM public.billing_refunds rf
    WHERE rf.approval_status = 'processed'
    GROUP BY rf.receipt_id
  ),
  cats AS (
    -- One row per receipt x category. Bills with no category read as
    -- 'Uncategorised' so the amounts still reconcile to payment_amount.
    SELECT x.receipt_id AS rid,
           string_agg(x.category, ', ' ORDER BY x.category) AS categories,
           jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount)
                     ORDER BY x.amount DESC) AS category_breakdown
    FROM (
      SELECT ri.receipt_id,
             COALESCE(ic.category_name, 'Uncategorised')::text AS category,
             SUM(ri.amount_paid) AS amount
      FROM public.billing_receipt_items ri
      JOIN public.billing_student_bills b ON b.id = ri.bill_id
      LEFT JOIN public.billing_categories ic ON ic.id = b.item_category_id
      WHERE ri.receipt_id IN (SELECT id FROM scoped)
      GROUP BY ri.receipt_id, COALESCE(ic.category_name, 'Uncategorised')
    ) x
    GROUP BY x.receipt_id
  )
  SELECT s.id, s.receipt_number::text, s.receipt_date,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, pr.program_name::text, sem.semester_name::text,
         s.payment_mode::text, s.payment_reference_number::text,
         s.dd_bank_name::text, s.dd_branch::text, s.remitter_name::text,
         s.payment_paid_date, s.date_of_credit,
         s.payer_name::text, s.payer_contact::text,
         COALESCE(acc.full_name, cr.full_name)::text,
         s.payment_remarks::text,
         cats.categories, COALESCE(cats.category_breakdown, '[]'::jsonb),
         s.payment_amount,
         COALESCE(refs.total_refunds, 0),
         GREATEST(0, s.payment_amount - COALESCE(refs.total_refunds, 0)),
         COALESCE(refs.total_refunds, 0) > 0
  FROM scoped s
  LEFT JOIN refs ON refs.rid = s.id
  LEFT JOIN cats ON cats.rid = s.id
  LEFT JOIN public.learners_profiles lp ON lp.id = s.student_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.semesters sem ON sem.id = lp.semester_id
  LEFT JOIN public.institutions i ON i.id = s.institution_id
  LEFT JOIN public.profiles acc ON acc.id = s.accountant_id
  LEFT JOIN public.profiles cr ON cr.id = s.created_by
  ORDER BY s.receipt_date ASC, s.receipt_number ASC, s.id ASC
  LIMIT 10000;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_billing_reports_collection_daywise(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], text[], uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_collection_daywise(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], text[], uuid, date, date) TO authenticated, service_role;
