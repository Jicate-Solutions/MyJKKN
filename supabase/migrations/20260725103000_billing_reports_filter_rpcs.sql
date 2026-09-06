-- ============================================================================
-- 20260725103000 — /billing/reports hierarchy + student-category filter RPCs
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md
-- Pattern: 20260724090000_accountant_report_rpcs.sql — permission gate +
-- get_user_accessible_institutions scope hoisted into v_inst.
--
-- The academic hierarchy (degree/department/program/semester/section) exists
-- ONLY on learners_profiles; every billing table reaches it via student_id.
-- billing_report_student_cohort resolves that once and is joined by each RPC.
-- ============================================================================

-- 0) COHORT HELPER ----------------------------------------------------------
-- LANGUAGE sql (not plpgsql) and deliberately WITHOUT `SET search_path` and
-- WITHOUT SECURITY DEFINER: PostgreSQL only inlines a set-returning SQL
-- function when proconfig IS NULL and prosecdef IS false. Inlining is the
-- point — it lets the planner see lp.degree_id = $1 and use
-- idx_learners_profiles_degree_id instead of materialising a Function Scan.
-- Every object is schema-qualified to compensate for the missing search_path.
-- Callers are SECURITY DEFINER, so this inherits definer rights.
CREATE OR REPLACE FUNCTION public.billing_report_student_cohort(
  p_institution_ids uuid[] DEFAULT NULL,
  p_degree_id       uuid   DEFAULT NULL,
  p_department_id   uuid   DEFAULT NULL,
  p_program_id      uuid   DEFAULT NULL,
  p_semester_id     uuid   DEFAULT NULL,
  p_section_id      uuid   DEFAULT NULL,
  p_schemes         text[] DEFAULT NULL
) RETURNS TABLE(student_id uuid)
LANGUAGE sql STABLE
AS $$
  -- One row per learner: lp.id is the PK and quotas joins on its PK, so no
  -- DISTINCT is needed even when a learner matches two scheme buckets — the
  -- bucket predicates are a disjunction WITHIN a single row.
  SELECT lp.id
  FROM public.learners_profiles lp
  LEFT JOIN public.quotas q ON q.id = lp.quota_id
  WHERE (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
    AND (p_department_id IS NULL OR lp.department_id = p_department_id)
    AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
    AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
    AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
    AND (
      p_schemes IS NULL OR cardinality(p_schemes) = 0
      OR ('first_graduate' = ANY(p_schemes)
          AND (COALESCE(lp.first_graduate, false)
               OR COALESCE(lp.scholarship_type, '') = 'FIRST GRADUATE'))
      OR ('pmss' = ANY(p_schemes)
          AND (COALESCE(lp.scholarship_type, '') = 'PMS SCHOLARSHIP'
               OR COALESCE(q.code, '') = 'pmss'))
      OR ('scholarship_7_5' = ANY(p_schemes)
          AND COALESCE(lp.scholarship_type, '') = '7.5% SCHOLARSHIP')
      -- COALESCE is load-bearing: scholarship_type is NULL for 65 learners and
      -- NOT(NULL) is NULL, which would drop them from "other" entirely.
      OR ('other' = ANY(p_schemes)
          AND NOT (
            COALESCE(lp.first_graduate, false)
            OR COALESCE(lp.scholarship_type, '') IN
               ('FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP')
            OR COALESCE(q.code, '') = 'pmss'))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) TO authenticated, service_role;

-- 1) OUTSTANDING — paginated BY STUDENT, bills nested as jsonb --------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_outstanding(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  student_id uuid, first_name text, last_name text, roll_number text,
  institution_name text, department_name text,
  total_outstanding numeric, overdue_amount numeric,
  bills jsonb, total_count bigint)
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
    SELECT b.id, b.student_id, b.bill_description, b.due_date, b.status,
           CASE WHEN b.status = 'partially_paid' THEN COALESCE(b.balance_amount, b.final_amount)
                ELSE b.final_amount END AS amount
    FROM public.billing_student_bills b
    JOIN public.billing_report_student_cohort(
           v_inst, p_degree_id, p_department_id, p_program_id,
           p_semester_id, p_section_id, p_schemes) c ON c.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND b.status IN ('unpaid','partially_paid','overdue')
      AND COALESCE(b.balance_amount, 0) > 0
      AND (p_student_id IS NULL OR b.student_id = p_student_id)
      AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
      AND (CASE
             WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
             WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
             ELSE true END)
      AND (p_date_from IS NULL OR b.due_date >= p_date_from)
      AND (p_date_to   IS NULL OR b.due_date <= p_date_to)
  ),
  per_student AS (
    SELECT s.student_id AS sid,
           SUM(s.amount) AS total_outstanding,
           SUM(s.amount) FILTER (
             WHERE s.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS overdue_amount,
           jsonb_agg(jsonb_build_object(
             'id', s.id, 'bill_description', s.bill_description,
             'due_date', s.due_date, 'amount', s.amount, 'status', s.status
           ) ORDER BY s.due_date) AS bills
    FROM scoped s GROUP BY s.student_id
  )
  SELECT ps.sid, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, d.department_name::text,
         ps.total_outstanding, COALESCE(ps.overdue_amount, 0), ps.bills,
         COUNT(*) OVER() AS total_count
  FROM per_student ps
  JOIN public.learners_profiles lp ON lp.id = ps.sid
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  LEFT JOIN public.departments  d ON d.id = lp.department_id
  ORDER BY ps.total_outstanding DESC, ps.sid
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_outstanding(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_outstanding(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;

-- 2) COLLECTION — one row per receipt ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_collection(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  receipt_id uuid, receipt_number text, receipt_date date,
  first_name text, last_name text, roll_number text, institution_name text,
  payment_mode text, payment_amount numeric,
  total_refunds numeric, net_amount numeric, has_refunds boolean,
  total_count bigint)
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
           r.payment_amount, r.student_id, r.institution_id
    FROM public.billing_receipts r
    JOIN public.billing_report_student_cohort(
           v_inst, p_degree_id, p_department_id, p_program_id,
           p_semester_id, p_section_id, p_schemes) c ON c.student_id = r.student_id
    WHERE r.institution_id = ANY(v_inst)
      AND (p_student_id IS NULL OR r.student_id = p_student_id)
      AND (p_date_from IS NULL OR r.receipt_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.receipt_date <= p_date_to)
      -- Semi-join, NOT a join: asks "does this receipt touch a matching bill?"
      -- without multiplying the receipt row per allocation.
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
  )
  SELECT s.id, s.receipt_number::text, s.receipt_date,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         s.payment_mode::text, s.payment_amount,
         COALESCE(refs.total_refunds, 0),
         GREATEST(0, s.payment_amount - COALESCE(refs.total_refunds, 0)),
         COALESCE(refs.total_refunds, 0) > 0,
         COUNT(*) OVER() AS total_count
  FROM scoped s
  LEFT JOIN refs ON refs.rid = s.id
  LEFT JOIN public.learners_profiles lp ON lp.id = s.student_id
  LEFT JOIN public.institutions i ON i.id = s.institution_id
  ORDER BY s.receipt_date DESC, s.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_collection(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_collection(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;

-- 3) INVOICES ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_invoices(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  invoice_id uuid, invoice_number text, invoice_date date,
  first_name text, last_name text, roll_number text, institution_name text,
  invoice_type text, grand_total numeric,
  billing_period_from date, billing_period_to date, total_count bigint)
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
  SELECT inv.id, inv.invoice_number::text, inv.invoice_date,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         inv.invoice_type::text, inv.grand_total,
         inv.billing_period_from, inv.billing_period_to,
         COUNT(*) OVER() AS total_count
  FROM public.billing_invoices inv
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = inv.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = inv.student_id
  LEFT JOIN public.institutions i ON i.id = inv.institution_id
  WHERE inv.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR inv.student_id = p_student_id)
    AND (p_date_from IS NULL OR inv.invoice_date >= p_date_from)
    AND (p_date_to   IS NULL OR inv.invoice_date <= p_date_to)
    AND (
      (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT COALESCE(p_academic_year_unspecified, false))
      OR EXISTS (
        SELECT 1
        FROM public.billing_invoice_items ii
        JOIN public.billing_receipt_items ri ON ri.receipt_id = ii.receipt_id
        JOIN public.billing_student_bills b  ON b.id = ri.bill_id
        WHERE ii.invoice_id = inv.id
          AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
          AND (CASE
                 WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
                 WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
                 ELSE true END))
    )
  ORDER BY inv.invoice_date DESC, inv.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_invoices(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_invoices(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;

-- 4) DISCOUNTS — reached entirely through bill_id ----------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_discounts(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  discount_id uuid, first_name text, last_name text, roll_number text,
  institution_name text, bill_description text,
  discount_category text, discount_type text,
  discount_value numeric, discount_amount numeric,
  approval_status text, effective_date date, total_count bigint)
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
  SELECT d.id, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, b.bill_description::text,
         d.discount_category::text, d.discount_type::text,
         d.discount_value, d.discount_amount,
         d.approval_status::text, d.effective_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_discounts d
  JOIN public.billing_student_bills b ON b.id = d.bill_id
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = b.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN public.institutions i ON i.id = b.institution_id
  WHERE b.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR b.student_id = p_student_id)
    AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
    AND (CASE
           WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
           WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
           ELSE true END)
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to)
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_discounts(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_discounts(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;

-- 5) REFUNDS — reached entirely through receipt_id ---------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_refunds(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  refund_id uuid, receipt_number text,
  first_name text, last_name text, roll_number text, institution_name text,
  refund_category text, refund_method text,
  refund_amount numeric, processing_fee numeric, net_refund_amount numeric,
  approval_status text, refund_date date, total_count bigint)
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
  SELECT rf.id, r.receipt_number::text,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         rf.refund_category::text, rf.refund_method::text,
         rf.refund_amount, rf.processing_fee, rf.net_refund_amount,
         rf.approval_status::text, rf.refund_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_refunds rf
  JOIN public.billing_receipts r ON r.id = rf.receipt_id
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = r.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = r.student_id
  LEFT JOIN public.institutions i ON i.id = r.institution_id
  WHERE r.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR r.student_id = p_student_id)
    AND (p_date_from IS NULL OR rf.refund_date >= p_date_from)
    AND (p_date_to   IS NULL OR rf.refund_date <= p_date_to)
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
  ORDER BY rf.created_at DESC, rf.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_refunds(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_refunds(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;

-- 6) DASHBOARD — one jsonb payload replacing 15 client round-trips -----------
CREATE OR REPLACE FUNCTION public.get_billing_reports_dashboard(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_students uuid[];
  v_billed numeric; v_collected numeric;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN
    RETURN jsonb_build_object(
      'total_students', 0, 'total_bills', 0, 'total_amount_billed', 0,
      'total_amount_collected', 0, 'total_outstanding', 0, 'total_overdue', 0,
      'collection_rate', 0,
      'recent_transactions', jsonb_build_object('receipts', '[]'::jsonb, 'bills', '[]'::jsonb, 'refunds', '[]'::jsonb),
      'monthly_collection', '[]'::jsonb, 'institution_wise_summary', '[]'::jsonb);
  END IF;

  -- Cohort hoisted ONCE into an array. Do not inline the helper into the
  -- sub-queries below: it would be re-planned per aggregate.
  SELECT array_agg(student_id) INTO v_students
  FROM public.billing_report_student_cohort(
    v_inst, p_degree_id, p_department_id, p_program_id,
    p_semester_id, p_section_id, p_schemes);
  v_students := COALESCE(v_students, ARRAY[]::uuid[]);

  WITH bills AS (
    SELECT b.*
    FROM public.billing_student_bills b
    WHERE b.institution_id = ANY(v_inst)
      AND b.student_id = ANY(v_students)
      AND (p_student_id IS NULL OR b.student_id = p_student_id)
      AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
      AND (CASE
             WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
             WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
             ELSE true END)
  ),
  bills_in_range AS (
    SELECT * FROM bills
    WHERE (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
  ),
  receipts AS (
    SELECT r.*
    FROM public.billing_receipts r
    WHERE r.institution_id = ANY(v_inst)
      AND r.student_id = ANY(v_students)
      AND (p_student_id IS NULL OR r.student_id = p_student_id)
      AND (p_date_from IS NULL OR r.receipt_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.receipt_date <= p_date_to)
      AND (
        (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT COALESCE(p_academic_year_unspecified, false))
        OR EXISTS (SELECT 1 FROM bills b2
                   JOIN public.billing_receipt_items ri ON ri.bill_id = b2.id
                   WHERE ri.receipt_id = r.id)
      )
  )
  SELECT jsonb_build_object(
    'total_students', (SELECT COUNT(DISTINCT student_id) FROM bills),
    'total_bills',    (SELECT COUNT(*) FROM bills_in_range),
    'total_amount_billed',    COALESCE((SELECT SUM(final_amount) FROM bills_in_range), 0),
    'total_amount_collected', COALESCE((SELECT SUM(payment_amount) FROM receipts), 0),
    'total_outstanding', COALESCE((SELECT SUM(balance_amount) FROM bills
                                   WHERE status IN ('unpaid','partially_paid','overdue')
                                     AND COALESCE(balance_amount,0) > 0), 0),
    'total_overdue', COALESCE((SELECT SUM(balance_amount) FROM bills
                               WHERE status IN ('unpaid','partially_paid','overdue')
                                 AND COALESCE(balance_amount,0) > 0
                                 AND due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date), 0),
    'collection_rate', 0,  -- filled below once billed/collected are known
    'recent_transactions', jsonb_build_object(
      'receipts', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT id, receipt_number, receipt_date, payment_amount, payment_mode
          FROM receipts ORDER BY receipt_date DESC LIMIT 10) x), '[]'::jsonb),
      'bills', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT id, bill_description, due_date, final_amount, status
          FROM bills_in_range ORDER BY created_at DESC LIMIT 10) x), '[]'::jsonb),
      'refunds', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT rf.id, rf.refund_amount, rf.refund_date, rf.approval_status
          FROM public.billing_refunds rf
          JOIN receipts r2 ON r2.id = rf.receipt_id
          ORDER BY rf.created_at DESC LIMIT 10) x), '[]'::jsonb)),
    'monthly_collection', COALESCE((SELECT jsonb_agg(x ORDER BY x.month) FROM (
        SELECT to_char(receipt_date, 'YYYY-MM') AS month, SUM(payment_amount) AS amount
        FROM receipts GROUP BY 1) x), '[]'::jsonb),
    'institution_wise_summary', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT i.id AS institution_id, i.name AS institution_name,
               COUNT(b.id) AS total_bills,
               COALESCE(SUM(b.final_amount), 0) AS amount_billed,
               COALESCE((SELECT SUM(r3.payment_amount) FROM receipts r3
                         WHERE r3.institution_id = i.id), 0) AS amount_collected,
               COALESCE(SUM(b.balance_amount) FILTER (
                 WHERE b.status IN ('unpaid','partially_paid','overdue')
                   AND COALESCE(b.balance_amount,0) > 0), 0) AS outstanding
        FROM public.institutions i
        LEFT JOIN bills b ON b.institution_id = i.id
        WHERE i.id = ANY(v_inst)
        GROUP BY i.id, i.name
        ORDER BY i.name) x), '[]'::jsonb)
  ) INTO v_result;

  v_billed    := (v_result->>'total_amount_billed')::numeric;
  v_collected := (v_result->>'total_amount_collected')::numeric;

  RETURN jsonb_set(v_result, '{collection_rate}', to_jsonb(
    CASE WHEN v_billed > 0 THEN round(v_collected / v_billed * 100, 2) ELSE 0 END));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_dashboard(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_dashboard(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst;
