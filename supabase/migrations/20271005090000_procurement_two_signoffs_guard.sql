-- Procurement: the two sign-offs can't be skipped, and the Overview counts match them.
--
-- The flow has exactly two approvals (docs/procurement/simplified-flow-spec.md):
--   1. Item approval   — a request approver approves what was asked for
--   2. Final approval  — the Super Admin approves the chosen vendors and prices
--
-- Sign-off 2 is already enforced (procurement_submit_award / _approve_award and the
-- award branch of fn_procurement_guard_approval). Sign-off 1 was only enforced in
-- app code: PR-260925-00002 reached quotations with no approver recorded, and a
-- requester holding the approve permission could approve their own request.
--
-- 1. fn_procurement_guard_approval — approving a request records who and when
--    (filled from auth.uid()/now() if the caller left them blank), and a requester
--    cannot approve their own request unless they are a Super Admin.
-- 2. trg_prfq_require_approved_request — quotations (an RFQ) can only be raised
--    from a request that was approved, with its approver recorded.
-- 3. procurement_overview_counts — bar 2 "waiting for quotes" counted requests in
--    'approved', but approval converts them at once, so the bar was always ~0; it
--    now counts open RFQs (draft / quotations_received). Bar 4 "ordered" also counts
--    partly received orders.
-- 4. requester read policies on the purchase's RFQ, orders and deliveries, so the
--    person who asked can follow it even without access to that college.

-- ── 1. Item approval: who/when recorded, no self-approval ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key  text;
  v_what text;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'procurement_rfqs'
     AND (NEW.status = 'awarded'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'pending_award_approval')) THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to approve or send back a vendor award — only a Super Admin can'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.request_approve';
        v_what := 'approve or reject a purchase requisition';
      END IF;
      IF NEW.status = 'approved' THEN
        -- Sign-off 1 must say who signed and when.
        NEW.approved_by := coalesce(NEW.approved_by, auth.uid());
        NEW.approved_at := coalesce(NEW.approved_at, now());
        IF NEW.approved_by IS NULL THEN
          RAISE EXCEPTION 'an approved request must record who approved it'
            USING ERRCODE = '23502';
        END IF;
        IF NEW.requested_by IS NOT DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
          RAISE EXCEPTION 'you cannot approve your own request — another approver must sign it off'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    WHEN 'procurement_rfqs' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.rfq_approve';
        v_what := 'approve or reject an RFQ';
      END IF;
    WHEN 'procurement_purchase_orders' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.po_approve';
        v_what := 'approve or reject a purchase order';
      END IF;
    WHEN 'procurement_grn' THEN
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested')
         AND (TG_OP = 'INSERT' OR OLD.status IN ('draft', 'pending_verification')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
      END IF;
  END CASE;
  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;
  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$function$;

-- ── 2. Quotations only from an approved request ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_procurement_rfq_require_approved_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status      text;
  v_approved_by uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.source_request_id IS NULL THEN
    RAISE EXCEPTION 'quotations must be raised from an approved request'
      USING ERRCODE = '23502';
  END IF;
  SELECT r.status, r.approved_by INTO v_status, v_approved_by
    FROM procurement_purchase_requests r
   WHERE r.id = NEW.source_request_id;
  IF v_status IS NULL OR v_status NOT IN ('approved', 'converted') OR v_approved_by IS NULL THEN
    RAISE EXCEPTION 'this request has not been approved yet — quotations start after item approval'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prfq_require_approved_request ON public.procurement_rfqs;
CREATE TRIGGER trg_prfq_require_approved_request
  BEFORE INSERT ON public.procurement_rfqs
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_rfq_require_approved_request();

-- ── 3. Overview counts that match the real stages ──────────────────────────────
CREATE OR REPLACE FUNCTION public.procurement_overview_counts(p_days integer DEFAULT 7)
 RETURNS TABLE(institution_id uuid, institution_name text, gate integer, pending integer, updated integer, recent integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH docs AS (
    -- 1 waiting for item approval
    SELECT r.institution_id, 1 AS gate, r.created_at, r.updated_at
    FROM procurement_purchase_requests r
    WHERE r.status = 'submitted'
    UNION ALL
    -- 2 getting quotes: approved and still collecting / comparing
    SELECT q.institution_id, 2, q.created_at, q.updated_at
    FROM procurement_rfqs q
    WHERE q.status IN ('draft', 'sent', 'quotations_received', 'compared')
    UNION ALL
    -- 3 waiting for the Super Admin's final approval
    SELECT q.institution_id, 3, q.created_at, q.updated_at
    FROM procurement_rfqs q
    WHERE q.status = 'pending_award_approval'
    UNION ALL
    -- 4 ordered, goods (still) to arrive
    SELECT o.institution_id, 4, o.created_at, o.updated_at
    FROM procurement_purchase_orders o
    WHERE o.status IN ('approved', 'sent', 'partially_received')
    UNION ALL
    -- 5 delivered, waiting to be checked into stock
    SELECT g.institution_id, 5, g.created_at, g.updated_at
    FROM procurement_grn g
    WHERE g.status = 'pending_verification'
  )
  SELECT d.institution_id,
         i.name,
         d.gate,
         count(*)::int,
         count(*) FILTER (WHERE d.updated_at >= now() - make_interval(days => p_days))::int,
         count(*) FILTER (WHERE d.created_at >= now() - make_interval(days => p_days))::int
  FROM docs d
  JOIN institutions i ON i.id = d.institution_id
  GROUP BY d.institution_id, i.name, d.gate;
$function$;

-- ── 4. The requester can follow their own purchase ─────────────────────────────
-- Requesters usually raise purchases for a college other than their profile's and
-- often have no access to it. ppr_requester_read already lets them read their own
-- request; these let them read that purchase's quotation, orders and deliveries
-- too, so its progress line and stage are not stuck at "Getting quotes". Read-only,
-- and not the quotations themselves — vendor prices stay with the store.
DROP POLICY IF EXISTS prfq_requester_read ON public.procurement_rfqs;
CREATE POLICY prfq_requester_read ON public.procurement_rfqs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM procurement_purchase_requests r
     WHERE r.id = procurement_rfqs.source_request_id
       AND r.requested_by = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS ppo_requester_read ON public.procurement_purchase_orders;
CREATE POLICY ppo_requester_read ON public.procurement_purchase_orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM procurement_rfqs q
      JOIN procurement_purchase_requests r ON r.id = q.source_request_id
     WHERE q.id = procurement_purchase_orders.rfq_id
       AND r.requested_by = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS pgrn_requester_read ON public.procurement_grn;
CREATE POLICY pgrn_requester_read ON public.procurement_grn
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM procurement_purchase_orders o
      JOIN procurement_rfqs q ON q.id = o.rfq_id
      JOIN procurement_purchase_requests r ON r.id = q.source_request_id
     WHERE o.id = procurement_grn.purchase_order_id
       AND r.requested_by = (SELECT auth.uid())
  ));
