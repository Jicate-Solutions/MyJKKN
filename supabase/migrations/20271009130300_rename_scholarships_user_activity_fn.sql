-- ─── Rename billing "discounts" → "scholarships" — part 3a: get_billing_user_activity (scholarships_count) ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale and dependency scan.
-- Applied through the Supabase MCP apply_migration as "rename_scholarships_user_activity_fn"; ledger version aligned to 20271009130300.

-- Return shape changes (discounts_count → scholarships_count) → DROP + CREATE + explicit grants.
-- It was granted to authenticated + service_role only (no PUBLIC / anon).

DROP FUNCTION IF EXISTS public.get_billing_user_activity(uuid[], date, date);

CREATE FUNCTION public.get_billing_user_activity(p_institution_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, full_name text, role text, actions_count integer, receipts_count integer, amount_collected numeric, scholarships_count integer, refunds_count integer, last_active timestamp with time zone)
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
  WITH acts AS (
    SELECT ual.user_id uid, COUNT(*) c, MAX(ual.created_at) last_at
    FROM user_activity_logs ual
    WHERE ual.institution_id = ANY(v_inst)
      AND (ual.resource_type IN ('bill','receipt','invoice','scholarship','refund')
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
  sch AS (
    SELECT d.created_by uid, COUNT(*) c
    FROM billing_scholarships d JOIN billing_student_bills b ON b.id = d.bill_id
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
    UNION SELECT uid FROM sch WHERE uid IS NOT NULL
    UNION SELECT uid FROM ref WHERE uid IS NOT NULL)
  SELECT ids.uid, COALESCE(p.full_name,'Unknown')::text, COALESCE(p.role,'')::text,
    COALESCE(a.c,0)::int, COALESCE(r.c,0)::int, COALESCE(r.amt,0),
    COALESCE(s.c,0)::int, COALESCE(rf.c,0)::int,
    NULLIF(GREATEST(COALESCE(a.last_at,'-infinity'::timestamptz), COALESCE(r.last_at,'-infinity'::timestamptz)), '-infinity'::timestamptz)
  FROM ids
  LEFT JOIN profiles p ON p.id = ids.uid
  LEFT JOIN acts a ON a.uid = ids.uid
  LEFT JOIN rec r ON r.uid = ids.uid
  LEFT JOIN sch s ON s.uid = ids.uid
  LEFT JOIN ref rf ON rf.uid = ids.uid
  ORDER BY COALESCE(r.amt,0) DESC, COALESCE(a.c,0) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_user_activity(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_user_activity(uuid[], date, date) TO authenticated, service_role;
