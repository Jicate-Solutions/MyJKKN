-- ============================================================================
-- 20260602094000 — Billing Analytics Dashboard RPCs (7 SECURITY DEFINER fns)
-- ============================================================================
-- Powers /billing/analytics. Every function:
--   1. Gates with user_has_permission('billing.analytics.view') — the catalog
--      key, NOT a bare billing.view (which no role holds → would 403 everyone).
--      user_has_permission() already returns true for super_admin.
--   2. Resolves institution scope = caller's accessible institutions
--      (get_user_accessible_institutions, which mirrors role_has_institution_
--      access) INTERSECTED with the optional p_institution_ids filter. All
--      aggregates then filter institution_id = ANY(v_inst), so a non-super-admin
--      only ever sees their own institutions.
--
-- Data semantics (see design doc):
--   - billed    = billing_student_bills.final_amount, date-ranged by created_at (IST)
--   - collected = billing_receipts.payment_amount, date-ranged by payment_paid_date
--   - outstanding/aging/category = SNAPSHOT of balance_amount > 0 (ignores date filter)
--   - overdue is DERIVED from due_date < today (no 'overdue' status exists)
-- ============================================================================

-- Supporting indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_bsb_inst_status      ON public.billing_student_bills (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_bsb_inst_balance     ON public.billing_student_bills (institution_id) WHERE balance_amount > 0;
CREATE INDEX IF NOT EXISTS idx_bsb_inst_created     ON public.billing_student_bills (institution_id, created_at);
CREATE INDEX IF NOT EXISTS idx_brc_inst_paiddate    ON public.billing_receipts (institution_id, payment_paid_date);
CREATE INDEX IF NOT EXISTS idx_brc_created_by       ON public.billing_receipts (created_by);
CREATE INDEX IF NOT EXISTS idx_ual_inst_res_created ON public.user_activity_logs (institution_id, resource_type, created_at);

-- ── 1. Overview KPIs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_overview(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_billed numeric := 0; v_collected numeric := 0; v_refunds numeric := 0;
  v_discounts numeric := 0; v_outstanding numeric := 0;
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
      'bills_paid',0,'bills_unpaid',0,'bills_partially_paid',0,'total_discounts',0,'total_refunds',0);
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

  SELECT COALESCE(SUM(d.discount_amount),0) INTO v_discounts
  FROM billing_discounts d JOIN billing_student_bills b ON b.id = d.bill_id
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
    'total_discounts', v_discounts, 'total_refunds', v_refunds);
END;
$$;

-- ── 2. Live "Today's Collections" ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_today_collections(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_total numeric := 0; v_count int := 0;
  v_by_mode jsonb; v_by_inst jsonb; v_recent jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('today_total',0,'today_count',0,
      'by_mode','[]'::jsonb,'by_institution','[]'::jsonb,'recent','[]'::jsonb);
  END IF;

  SELECT COALESCE(SUM(payment_amount),0), COUNT(*) INTO v_total, v_count
  FROM billing_receipts WHERE institution_id = ANY(v_inst) AND payment_paid_date = v_today;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('payment_mode', payment_mode, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]'::jsonb)
  INTO v_by_mode FROM (
    SELECT payment_mode, SUM(payment_amount) amt, COUNT(*) cnt
    FROM billing_receipts WHERE institution_id = ANY(v_inst) AND payment_paid_date = v_today
    GROUP BY payment_mode) m;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('institution_id', i_id, 'institution_name', i_name, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]'::jsonb)
  INTO v_by_inst FROM (
    SELECT r.institution_id i_id, i.name i_name, SUM(r.payment_amount) amt, COUNT(*) cnt
    FROM billing_receipts r JOIN institutions i ON i.id = r.institution_id
    WHERE r.institution_id = ANY(v_inst) AND r.payment_paid_date = v_today
    GROUP BY r.institution_id, i.name) s;

  SELECT COALESCE(jsonb_agg(j ORDER BY ca DESC), '[]'::jsonb)
  INTO v_recent FROM (
    SELECT jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number,
      'payer_name', r.payer_name, 'payment_amount', r.payment_amount,
      'payment_mode', r.payment_mode, 'institution_name', i.name, 'created_at', r.created_at) AS j,
      r.created_at AS ca
    FROM billing_receipts r JOIN institutions i ON i.id = r.institution_id
    WHERE r.institution_id = ANY(v_inst) AND r.payment_paid_date = v_today
    ORDER BY r.created_at DESC LIMIT 10) rec;

  RETURN jsonb_build_object('today_total', v_total, 'today_count', v_count,
    'by_mode', v_by_mode, 'by_institution', v_by_inst, 'recent', v_recent);
END;
$$;

-- ── 3. Collection trend (billed vs collected over time) ─────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_collection_trend(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_granularity text DEFAULT 'day'
) RETURNS TABLE(period text, billed numeric, collected numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_fmt text := CASE WHEN p_granularity = 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH b AS (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Kolkata'), v_fmt) p, SUM(final_amount) amt
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY 1),
  c AS (
    SELECT to_char(payment_paid_date, v_fmt) p, SUM(payment_amount) amt
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY 1)
  SELECT COALESCE(b.p, c.p), COALESCE(b.amt,0), COALESCE(c.amt,0)
  FROM b FULL OUTER JOIN c ON b.p = c.p
  ORDER BY 1;
END;
$$;

-- ── 4. Institution comparison ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_institution(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  institution_id uuid, institution_name varchar, total_billed numeric,
  total_collected numeric, total_outstanding numeric, collection_rate numeric,
  bill_count int, student_count int)
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
    COALESCE(b.bill_count,0)::int, COALESCE(b.student_count,0)::int
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
    SELECT institution_id, SUM(balance_amount) outstanding
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0
    GROUP BY institution_id) o ON o.institution_id = i.id
  WHERE i.id = ANY(v_inst)
    AND (COALESCE(b.billed,0) > 0 OR COALESCE(rc.collected,0) > 0 OR COALESCE(o.outstanding,0) > 0)
  ORDER BY COALESCE(o.outstanding,0) DESC;
END;
$$;

-- ── 5. Aging buckets (snapshot of bills with balance > 0) ───────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_aging(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS TABLE(bucket text, bill_count int, balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[]; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.bucket, COUNT(*)::int, SUM(a.balance_amount)
  FROM (
    SELECT balance_amount,
      CASE
        WHEN due_date >= v_today THEN 'not_due'
        WHEN v_today - due_date <= 30 THEN '0-30'
        WHEN v_today - due_date <= 60 THEN '31-60'
        WHEN v_today - due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0) a
  GROUP BY a.bucket
  ORDER BY CASE a.bucket WHEN 'not_due' THEN 0 WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
END;
$$;

-- ── 6. Pending fees by category kind (snapshot) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_category(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS TABLE(kind text, total_billed numeric, total_outstanding numeric, paid_to_date numeric, bill_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  SELECT COALESCE(c.kind::text, 'uncategorized'),
    SUM(b.final_amount), SUM(COALESCE(b.balance_amount,0)),
    SUM(b.final_amount - COALESCE(b.balance_amount,0)), COUNT(*)::int
  FROM billing_student_bills b
  LEFT JOIN billing_categories c ON c.id = b.item_category_id
  WHERE b.institution_id = ANY(v_inst)
  GROUP BY COALESCE(c.kind::text, 'uncategorized')
  ORDER BY SUM(COALESCE(b.balance_amount,0)) DESC;
END;
$$;

-- ── 7. Per-account-user activity (actions + ₹ collected) ────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_user_activity(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  user_id uuid, full_name text, role text, actions_count int, receipts_count int,
  amount_collected numeric, discounts_count int, refunds_count int, last_active timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  WITH acts AS (
    SELECT ual.user_id uid, COUNT(*) c, MAX(ual.created_at) last_at
    FROM user_activity_logs ual
    WHERE ual.institution_id = ANY(v_inst)
      AND (ual.resource_type IN ('bill','receipt','invoice','discount','refund')
           OR (ual.resource_type = 'category' AND ual.metadata->>'sub_type' LIKE 'billing_%'))
      AND (p_date_from IS NULL OR ual.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (ual.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY ual.user_id),
  rec AS (
    SELECT COALESCE(created_by, accountant_id) uid, COUNT(*) c, SUM(payment_amount) amt, MAX(created_at) last_at
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY COALESCE(created_by, accountant_id)),
  disc AS (
    SELECT d.created_by uid, COUNT(*) c
    FROM billing_discounts d JOIN billing_student_bills b ON b.id = d.bill_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR d.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (d.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY d.created_by),
  ref AS (
    SELECT rf.created_by uid, COUNT(*) c
    FROM billing_refunds rf JOIN billing_receipts rc ON rc.id = rf.receipt_id
    WHERE rc.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR rf.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (rf.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY rf.created_by),
  ids AS (
    SELECT uid FROM acts WHERE uid IS NOT NULL
    UNION SELECT uid FROM rec WHERE uid IS NOT NULL
    UNION SELECT uid FROM disc WHERE uid IS NOT NULL
    UNION SELECT uid FROM ref WHERE uid IS NOT NULL)
  SELECT ids.uid, COALESCE(p.full_name,'Unknown')::text, COALESCE(p.role,'')::text,
    COALESCE(a.c,0)::int, COALESCE(r.c,0)::int, COALESCE(r.amt,0),
    COALESCE(d.c,0)::int, COALESCE(rf.c,0)::int,
    NULLIF(GREATEST(COALESCE(a.last_at,'-infinity'::timestamptz), COALESCE(r.last_at,'-infinity'::timestamptz)), '-infinity'::timestamptz)
  FROM ids
  LEFT JOIN profiles p ON p.id = ids.uid
  LEFT JOIN acts a ON a.uid = ids.uid
  LEFT JOIN rec r ON r.uid = ids.uid
  LEFT JOIN disc d ON d.uid = ids.uid
  LEFT JOIN ref rf ON rf.uid = ids.uid
  ORDER BY COALESCE(r.amt,0) DESC, COALESCE(a.c,0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_analytics_overview(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_today_collections(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_collection_trend(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_institution(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_aging(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_user_activity(uuid[], date, date) TO authenticated;
