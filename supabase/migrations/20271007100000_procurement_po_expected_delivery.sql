-- POs carry an expected delivery date: approval day + the vendor's quoted delivery days.
-- It is the baseline for the vendor on-time score (procurement_vendor_kpis). Until now
-- procurement_award_create_pos never set it, so every PO had NULL.
-- Body is 20271006130000 unchanged except the two marked lines.

CREATE OR REPLACE FUNCTION public.procurement_award_create_pos(p_rfq_id uuid, p_approver uuid)
RETURNS SETOF public.procurement_purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rfq     public.procurement_rfqs;
  v_vendor  record;
  v_po      public.procurement_purchase_orders;
  v_num     int;
  v_created int := 0;
BEGIN
  SELECT * INTO v_rfq FROM public.procurement_rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_rfq.status <> 'pending_award_approval' THEN
    RAISE EXCEPTION 'This RFQ is %, not waiting for approval — refresh the page',
      replace(v_rfq.status, '_', ' ') USING ERRCODE = '55000';
  END IF;
  PERFORM set_config('procurement.chain_ok', 'on', true);
  FOR v_vendor IN
    SELECT q.supplier_id,
           max(q.payment_terms)                                   AS payment_terms,
           max(q.delivery_time_days)                              AS delivery_days,  -- new
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
      subtotal, tax_amount, total_amount, payment_terms, po_format_id, expected_delivery_date,
      approved_by, approved_at, created_by
    )
    SELECT v_rfq.institution_id, v_rfq.store_id,
           'PO-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_num::text, 5, '0'),
           v_vendor.supplier_id, p_rfq_id, v_rfq.domain, 'approved',
           v_vendor.subtotal, 0, v_vendor.subtotal, v_vendor.payment_terms,
           s.default_po_format_id,
           current_date + v_vendor.delivery_days,                              -- new (NULL if not quoted)
           p_approver, now(), coalesce(v_rfq.award_submitted_by, v_rfq.created_by)
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
     SET status = 'awarded', award_approved_by = p_approver, award_approved_at = now(), updated_at = now()
   WHERE id = p_rfq_id;
  PERFORM set_config('procurement.chain_ok', 'off', true);
  IF v_created = 0 AND NOT EXISTS (
       SELECT 1 FROM public.procurement_purchase_orders WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'No vendor is chosen on this RFQ — send it back instead'
      USING ERRCODE = '22023';
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.procurement_award_create_pos(uuid, uuid) FROM public, anon, authenticated;

-- Backfill existing POs from their vendor's quote.
UPDATE public.procurement_purchase_orders po
   SET expected_delivery_date = po.approved_at::date + q.delivery_time_days
  FROM public.procurement_quotations q
 WHERE q.rfq_id = po.rfq_id AND q.supplier_id = po.supplier_id
   AND po.expected_delivery_date IS NULL
   AND po.approved_at IS NOT NULL AND q.delivery_time_days IS NOT NULL;
