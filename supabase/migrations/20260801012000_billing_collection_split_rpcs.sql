-- =============================================================================
-- Billing: Management vs Government collection split
-- =============================================================================
-- billing_receipts has NO category column. The only path from cash to a category
-- is billing_receipt_items -> billing_student_bills.item_category_id ->
-- billing_categories.collection_type, so the split has to walk that join.
--
-- Coverage reality (measured 2026-08-01 on production data):
--   2,438 receipts allocate exactly            ₹4.83 cr
--     388 receipts have NO line items at all   ₹14.95 cr   <- 75% of all cash
--      31 receipts are OVER-allocated          ₹0.04 cr
-- The no-item receipts are bulk/legacy entries and are still being created, so
-- 'unallocated' is a first-class bucket here, not a rounding footnote. It is
-- reported explicitly instead of being folded into management, which would
-- overstate institution revenue by roughly 3x.
--
-- Invariant this function guarantees:
--   management_collected + government_collected + unallocated_collected
--     = total_collected  (exactly, for any filter)
-- Over-allocated receipts are scaled proportionally to hold that invariant.
--
-- Accrual figures (*_billed / *_outstanding) are included alongside because they
-- come off the BILL, which is categorised for 10,564 of 10,565 rows — near-total
-- coverage. They answer "how much of what we charged belongs to government",
-- which the cash split cannot while receipt items are this sparse.
--
-- Semantics deliberately match the existing analytics RPCs:
--   billed      — final_amount, date-ranged on created_at (IST)
--   collected   — payment_amount, date-ranged on payment_paid_date
--   outstanding — balance_amount > 0, POINT-IN-TIME snapshot, ignores the dates
--   refunds     — processed only, date-ranged on refund_date, pro-rated across
--                 their receipt's own management/government mix
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_collection_split(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid[];
  v_mgmt_collected numeric := 0;
  v_govt_collected numeric := 0;
  v_unal_collected numeric := 0;
  v_mgmt_refunds numeric := 0;
  v_govt_refunds numeric := 0;
  v_unal_refunds numeric := 0;
  v_mgmt_billed numeric := 0;
  v_govt_billed numeric := 0;
  v_mgmt_outstanding numeric := 0;
  v_govt_outstanding numeric := 0;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object(
      'management_collected', 0, 'government_collected', 0, 'unallocated_collected', 0,
      'management_refunds', 0, 'government_refunds', 0, 'unallocated_refunds', 0,
      'management_net', 0, 'government_net', 0, 'unallocated_net', 0,
      'total_collected', 0,
      'management_billed', 0, 'government_billed', 0,
      'management_outstanding', 0, 'government_outstanding', 0);
  END IF;

  -- ---------------------------------------------------------------------
  -- Collections, attributed receipt by receipt.
  -- `factor` scales an over-allocated receipt back down so its parts can
  -- never exceed the money that actually arrived.
  -- ---------------------------------------------------------------------
  WITH scoped AS (
    SELECT r.id, r.payment_amount
    FROM billing_receipts r
    WHERE r.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
  ),
  alloc AS (
    SELECT s.id AS receipt_id,
           COALESCE(SUM(i.amount_paid) FILTER (
             WHERE COALESCE(c.collection_type, 'management') = 'management'), 0) AS mgmt,
           COALESCE(SUM(i.amount_paid) FILTER (
             WHERE COALESCE(c.collection_type, 'management') = 'government'), 0) AS govt,
           COALESCE(SUM(i.amount_paid), 0) AS allocated
    FROM scoped s
    JOIN billing_receipt_items i ON i.receipt_id = s.id
    JOIN billing_student_bills b ON b.id = i.bill_id
    LEFT JOIN billing_categories c ON c.id = b.item_category_id
    GROUP BY s.id
  ),
  scaled AS (
    SELECT s.payment_amount,
           COALESCE(a.mgmt, 0) AS mgmt,
           COALESCE(a.govt, 0) AS govt,
           COALESCE(a.allocated, 0) AS allocated,
           CASE
             WHEN COALESCE(a.allocated, 0) > s.payment_amount AND a.allocated > 0
               THEN s.payment_amount / a.allocated
             ELSE 1
           END AS factor
    FROM scoped s
    LEFT JOIN alloc a ON a.receipt_id = s.id
  )
  SELECT COALESCE(SUM(mgmt * factor), 0),
         COALESCE(SUM(govt * factor), 0),
         COALESCE(SUM(GREATEST(payment_amount - allocated, 0)), 0)
  INTO v_mgmt_collected, v_govt_collected, v_unal_collected
  FROM scaled;

  -- ---------------------------------------------------------------------
  -- Processed refunds, pro-rated across their own receipt's mix. A refund on
  -- a receipt we could never attribute stays in the unallocated bucket.
  -- ---------------------------------------------------------------------
  WITH refunded AS (
    SELECT f.receipt_id, SUM(f.refund_amount) AS amt
    FROM billing_refunds f
    JOIN billing_receipts rc ON rc.id = f.receipt_id
    WHERE rc.institution_id = ANY(v_inst)
      AND f.approval_status = 'processed'
      AND (p_date_from IS NULL OR f.refund_date >= p_date_from)
      AND (p_date_to   IS NULL OR f.refund_date <= p_date_to)
    GROUP BY f.receipt_id
  ),
  mix AS (
    SELECT rf.receipt_id, rf.amt,
           COALESCE(SUM(i.amount_paid) FILTER (
             WHERE COALESCE(c.collection_type, 'management') = 'management'), 0) AS mgmt,
           COALESCE(SUM(i.amount_paid) FILTER (
             WHERE COALESCE(c.collection_type, 'management') = 'government'), 0) AS govt,
           COALESCE(SUM(i.amount_paid), 0) AS tot
    FROM refunded rf
    LEFT JOIN billing_receipt_items i ON i.receipt_id = rf.receipt_id
    LEFT JOIN billing_student_bills b ON b.id = i.bill_id
    LEFT JOIN billing_categories c ON c.id = b.item_category_id
    GROUP BY rf.receipt_id, rf.amt
  )
  SELECT COALESCE(SUM(CASE WHEN tot > 0 THEN amt * mgmt / tot ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN tot > 0 THEN amt * govt / tot ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN tot > 0 THEN 0 ELSE amt END), 0)
  INTO v_mgmt_refunds, v_govt_refunds, v_unal_refunds
  FROM mix;

  -- ---------------------------------------------------------------------
  -- Accrual view — straight off the bill, so effectively full coverage.
  -- ---------------------------------------------------------------------
  SELECT COALESCE(SUM(b.final_amount) FILTER (
           WHERE COALESCE(c.collection_type, 'management') = 'management'), 0),
         COALESCE(SUM(b.final_amount) FILTER (
           WHERE COALESCE(c.collection_type, 'management') = 'government'), 0)
  INTO v_mgmt_billed, v_govt_billed
  FROM billing_student_bills b
  LEFT JOIN billing_categories c ON c.id = b.item_category_id
  WHERE b.institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
    AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to);

  -- Outstanding is a snapshot "as of now" — it deliberately ignores the date
  -- filter, matching get_billing_analytics_overview.
  SELECT COALESCE(SUM(b.balance_amount) FILTER (
           WHERE COALESCE(c.collection_type, 'management') = 'management'), 0),
         COALESCE(SUM(b.balance_amount) FILTER (
           WHERE COALESCE(c.collection_type, 'management') = 'government'), 0)
  INTO v_mgmt_outstanding, v_govt_outstanding
  FROM billing_student_bills b
  LEFT JOIN billing_categories c ON c.id = b.item_category_id
  WHERE b.institution_id = ANY(v_inst)
    AND COALESCE(b.balance_amount, 0) > 0;

  RETURN jsonb_build_object(
    'management_collected',   round(v_mgmt_collected, 2),
    'government_collected',   round(v_govt_collected, 2),
    'unallocated_collected',  round(v_unal_collected, 2),
    'management_refunds',     round(v_mgmt_refunds, 2),
    'government_refunds',     round(v_govt_refunds, 2),
    'unallocated_refunds',    round(v_unal_refunds, 2),
    'management_net',         round(GREATEST(v_mgmt_collected - v_mgmt_refunds, 0), 2),
    'government_net',         round(GREATEST(v_govt_collected - v_govt_refunds, 0), 2),
    'unallocated_net',        round(GREATEST(v_unal_collected - v_unal_refunds, 0), 2),
    'total_collected',        round(v_mgmt_collected + v_govt_collected + v_unal_collected, 2),
    'management_billed',      round(v_mgmt_billed, 2),
    'government_billed',      round(v_govt_billed, 2),
    'management_outstanding', round(v_mgmt_outstanding, 2),
    'government_outstanding', round(v_govt_outstanding, 2));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_collection_split(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_collection_split(uuid[], date, date) TO authenticated;


-- =============================================================================
-- get_billing_analytics_by_category — add the collection_type dimension.
-- =============================================================================
-- The RETURNS TABLE column set changes, so this must be DROP + CREATE: adding
-- columns via CREATE OR REPLACE registers an OVERLOAD rather than replacing the
-- function, and PostgREST would then fail to pick one. Every column is cast
-- explicitly so a varchar/text mismatch can't raise 42804 at call time.
--
-- paid_to_date stays the accrual figure (billed - outstanding) it always was;
-- collected_actual is the new receipt-traced number. They differ a lot while
-- receipt items are sparse — that gap is real information, not a bug.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_billing_analytics_by_category(uuid[]);

CREATE FUNCTION public.get_billing_analytics_by_category(
  p_institution_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(
  kind text,
  collection_type text,
  total_billed numeric,
  total_outstanding numeric,
  paid_to_date numeric,
  collected_actual numeric,
  bill_count integer
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

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH bills AS (
    SELECT b.id,
           COALESCE(c.kind::text, 'uncategorized') AS k,
           COALESCE(c.collection_type, 'management') AS ct,
           b.final_amount,
           COALESCE(b.balance_amount, 0) AS balance
    FROM billing_student_bills b
    LEFT JOIN billing_categories c ON c.id = b.item_category_id
    WHERE b.institution_id = ANY(v_inst)
  ),
  agg AS (
    SELECT bl.k, bl.ct,
           SUM(bl.final_amount) AS billed,
           SUM(bl.balance) AS outstanding,
           COUNT(*) AS n
    FROM bills bl
    GROUP BY bl.k, bl.ct
  ),
  cash AS (
    SELECT bl.k, bl.ct, COALESCE(SUM(i.amount_paid), 0) AS collected
    FROM bills bl
    JOIN billing_receipt_items i ON i.bill_id = bl.id
    GROUP BY bl.k, bl.ct
  )
  SELECT a.k::text,
         a.ct::text,
         a.billed::numeric,
         a.outstanding::numeric,
         (a.billed - a.outstanding)::numeric,
         COALESCE(ca.collected, 0)::numeric,
         a.n::int
  FROM agg a
  LEFT JOIN cash ca ON ca.k = a.k AND ca.ct = a.ct
  ORDER BY a.outstanding DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_analytics_by_category(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) TO authenticated;
