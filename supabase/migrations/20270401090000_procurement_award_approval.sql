-- Migration: 20270401090000_procurement_award_approval
-- Purpose:  Phase 1 of the simplified procurement flow
--           (docs/procurement/simplified-flow-spec.md).
--
--           BEFORE: PR approve → RFQ submit → RFQ approve → Mark sent → quotes →
--                   award → Generate POs (draft) → PO submit → PO approve → Send.
--           AFTER:  quotes → award → "Send to Super Admin" → Super Admin approves →
--                   POs are created already approved, in one transaction.
--
--           The Super Admin now approves the thing that commits money — the chosen
--           vendors and prices — once. The RFQ-review and PO-approval steps it
--           replaces looked at the same items and quantities again.
--
--           New RFQ status: pending_award_approval. A NEW value rather than reusing
--           pending_review/approved: those still describe the old review gate on
--           in-flight rows, and reusing a status with a new meaning is how the IMS
--           warehouse-distribution columns ended up inverted.
--
--           Reversible: drop the three functions and the lock trigger, restore the
--           status CHECK without pending_award_approval, and re-create the previous
--           fn_procurement_guard_approval (20260816000100).

-- ---------------------------------------------------------------------------
-- 1. RFQ status + award-approval audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_rfqs
    ADD COLUMN IF NOT EXISTS award_submitted_by     UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS award_submitted_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS award_approved_by      UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS award_approved_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS award_rejection_reason TEXT;

ALTER TABLE public.procurement_rfqs
    DROP CONSTRAINT IF EXISTS procurement_rfqs_status_check;
ALTER TABLE public.procurement_rfqs
    ADD CONSTRAINT procurement_rfqs_status_check
    CHECK (status IN (
        'draft', 'pending_review', 'approved', 'rejected',
        'sent', 'quotations_received', 'compared',
        'pending_award_approval',
        'awarded', 'closed', 'cancelled'
    ));

CREATE INDEX IF NOT EXISTS idx_prfq_pending_award
    ON public.procurement_rfqs (institution_id)
    WHERE status = 'pending_award_approval';

-- ---------------------------------------------------------------------------
-- 2. Guard: only a Super Admin may decide an award
--
--    Same trigger function as before, one new branch. Leaving
--    pending_award_approval (approve → awarded, send back → draft) and landing on
--    'awarded' from anywhere are Super-Admin-only. is_admin() is deliberately NOT
--    accepted here: the decision (2026-09-25) is "Super Admin is always the final
--    approver". Every other branch is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

  -- Award decisions: Super Admin only, no permission-key path.
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
$$;

REVOKE ALL ON FUNCTION public.fn_procurement_guard_approval() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3. Freeze quotations while the Super Admin is looking at them
--
--    Awards and prices live on procurement_quotation_items, which has no status of
--    its own. Without this lock the store keeper could change a price or move an
--    award AFTER sending it for approval, and the Super Admin would approve a table
--    that no longer exists. Frozen while pending_award_approval and once decided.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_lock_decided_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rfq_id uuid;
  v_status text;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'procurement_quotations' THEN
    v_rfq_id := coalesce(NEW.rfq_id, OLD.rfq_id);
  ELSE
    SELECT q.rfq_id INTO v_rfq_id
      FROM public.procurement_quotations q
     WHERE q.id = coalesce(NEW.quotation_id, OLD.quotation_id);
  END IF;

  SELECT r.status INTO v_status FROM public.procurement_rfqs r WHERE r.id = v_rfq_id;

  IF v_status IN ('pending_award_approval', 'awarded', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'quotations are locked — this RFQ is %', replace(v_status, '_', ' ')
      USING ERRCODE = '55000',
            HINT = 'Ask the Super Admin to send it back if something needs to change.';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_procurement_lock_decided_quotes() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_pq_lock_decided ON public.procurement_quotations;
CREATE TRIGGER trg_pq_lock_decided
  BEFORE INSERT OR UPDATE OR DELETE ON public.procurement_quotations
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_lock_decided_quotes();

DROP TRIGGER IF EXISTS trg_pqi_lock_decided ON public.procurement_quotation_items;
CREATE TRIGGER trg_pqi_lock_decided
  BEFORE INSERT OR UPDATE OR DELETE ON public.procurement_quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_lock_decided_quotes();

-- ---------------------------------------------------------------------------
-- 4. RPC: store keeper sends the chosen vendors to the Super Admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procurement_submit_award(p_rfq_id uuid)
RETURNS public.procurement_rfqs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rfq      public.procurement_rfqs;
  v_items    int;
  v_awarded  int;
BEGIN
  IF NOT (is_super_admin()
          OR user_has_permission('procurement.quotation_manage')
          OR user_has_permission('procurement.rfq_manage')) THEN
    RAISE EXCEPTION 'not authorized to send an award for approval'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rfq FROM public.procurement_rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = 'P0002';
  END IF;

  -- Every pre-decision state. pending_review/approved/rejected/sent are the old
  -- review gate; in-flight RFQs sitting there can go straight to award approval.
  IF v_rfq.status NOT IN ('draft', 'pending_review', 'approved', 'rejected',
                          'sent', 'quotations_received', 'compared') THEN
    RAISE EXCEPTION 'This RFQ is already %; it cannot be sent for approval',
      replace(v_rfq.status, '_', ' ') USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_items FROM public.procurement_rfq_items WHERE rfq_id = p_rfq_id;

  SELECT count(DISTINCT qi.rfq_item_id) INTO v_awarded
    FROM public.procurement_quotation_items qi
    JOIN public.procurement_quotations q ON q.id = qi.quotation_id
   WHERE q.rfq_id = p_rfq_id AND qi.awarded AND qi.unit_price IS NOT NULL;

  IF v_awarded = 0 THEN
    RAISE EXCEPTION 'Choose a vendor for at least one item before sending for approval'
      USING ERRCODE = '22023';
  END IF;

  -- Partial awards are allowed (an item nobody quoted can be bought later), but
  -- the Super Admin sees the count on the approval card.
  UPDATE public.procurement_rfqs
     SET status                 = 'pending_award_approval',
         award_submitted_by     = auth.uid(),
         award_submitted_at     = now(),
         award_rejection_reason = NULL,
         updated_at             = now()
   WHERE id = p_rfq_id
  RETURNING * INTO v_rfq;

  RETURN v_rfq;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: Super Admin approves → one APPROVED PO per awarded vendor, atomically
--
--    Replaces the client-side ProcurementPurchaseOrderService.generateFromRfq loop,
--    which had no transaction and needed resume logic for half-created POs. Here
--    it is all-or-nothing, so that repair path is not needed for new awards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procurement_approve_award(p_rfq_id uuid)
RETURNS SETOF public.procurement_purchase_orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rfq      public.procurement_rfqs;
  v_vendor   record;
  v_po       public.procurement_purchase_orders;
  v_num      int;
  v_created  int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can approve a vendor award'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rfq FROM public.procurement_rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_rfq.status <> 'pending_award_approval' THEN
    RAISE EXCEPTION 'This RFQ is %, not waiting for approval — refresh the page',
      replace(v_rfq.status, '_', ' ') USING ERRCODE = '55000';
  END IF;

  -- Legacy RFQs can already own POs from the old Generate-POs button. Never raise
  -- a second PO to the same vendor for the same RFQ.
  FOR v_vendor IN
    SELECT q.supplier_id,
           max(q.payment_terms)                                   AS payment_terms,
           sum(qi.unit_price * coalesce(qi.quantity, ri.quantity)) AS subtotal
      FROM public.procurement_quotations q
      JOIN public.procurement_quotation_items qi ON qi.quotation_id = q.id
      JOIN public.procurement_rfq_items ri       ON ri.id = qi.rfq_item_id
     WHERE q.rfq_id = p_rfq_id
       AND qi.awarded
       AND qi.unit_price IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.procurement_purchase_orders po
                        WHERE po.rfq_id = p_rfq_id AND po.supplier_id = q.supplier_id)
     GROUP BY q.supplier_id
     ORDER BY q.supplier_id
  LOOP
    v_num := public.procurement_next_number(v_rfq.institution_id, 'PO', current_date);

    INSERT INTO public.procurement_purchase_orders (
      institution_id, store_id, po_number, supplier_id, rfq_id, domain, status,
      subtotal, tax_amount, total_amount, payment_terms, po_format_id,
      approved_by, approved_at, created_by
    )
    SELECT v_rfq.institution_id, v_rfq.store_id,
           'PO-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_num::text, 5, '0'),
           v_vendor.supplier_id, p_rfq_id, v_rfq.domain, 'approved',
           v_vendor.subtotal, 0, v_vendor.subtotal, v_vendor.payment_terms,
           s.default_po_format_id,
           auth.uid(), now(), coalesce(v_rfq.award_submitted_by, v_rfq.created_by)
      FROM (SELECT 1) one
      LEFT JOIN public.ims_suppliers s ON s.id = v_vendor.supplier_id
    RETURNING * INTO v_po;

    INSERT INTO public.procurement_purchase_order_items (
      po_id, rfq_item_id, source_quotation_item_id, domain_item_id,
      item_name, item_spec, ordered_quantity, unit_id, unit_label,
      unit_price, line_total
    )
    SELECT v_po.id, ri.id, qi.id, ri.domain_item_id,
           ri.item_name, ri.item_spec, coalesce(qi.quantity, ri.quantity),
           ri.unit_id, ri.unit_label,
           qi.unit_price, qi.unit_price * coalesce(qi.quantity, ri.quantity)
      FROM public.procurement_quotations q
      JOIN public.procurement_quotation_items qi ON qi.quotation_id = q.id
      JOIN public.procurement_rfq_items ri       ON ri.id = qi.rfq_item_id
     WHERE q.rfq_id = p_rfq_id
       AND q.supplier_id = v_vendor.supplier_id
       AND qi.awarded
       AND qi.unit_price IS NOT NULL
     ORDER BY ri.created_at;

    v_created := v_created + 1;
    RETURN NEXT v_po;
  END LOOP;

  UPDATE public.procurement_rfqs
     SET status            = 'awarded',
         award_approved_by = auth.uid(),
         award_approved_at = now(),
         updated_at        = now()
   WHERE id = p_rfq_id;

  IF v_created = 0 AND NOT EXISTS (
       SELECT 1 FROM public.procurement_purchase_orders WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'No vendor is chosen on this RFQ — send it back instead'
      USING ERRCODE = '22023';
  END IF;

  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: Super Admin sends the award back to the store keeper (same RFQ record)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procurement_send_back_award(p_rfq_id uuid, p_reason text)
RETURNS public.procurement_rfqs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rfq public.procurement_rfqs;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can send an award back'
      USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Say what needs to change before sending it back'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.procurement_rfqs
     SET status                 = 'draft',
         award_rejection_reason = btrim(p_reason),
         updated_at             = now()
   WHERE id = p_rfq_id AND status = 'pending_award_approval'
  RETURNING * INTO v_rfq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This RFQ is not waiting for approval — refresh the page'
      USING ERRCODE = '55000';
  END IF;

  RETURN v_rfq;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — authenticated only (Supabase grants EXECUTE to anon by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.procurement_submit_award(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_approve_award(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_send_back_award(uuid, text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_submit_award(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_approve_award(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_send_back_award(uuid, text) TO authenticated;
