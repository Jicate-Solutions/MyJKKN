-- =============================================================================
-- Procurement: a vendor's order details are typed once, then carried forward
-- =============================================================================
-- "Details printed on the order" (warranty, delivery, payment, special note, T&C,
-- custom format fields, the print format) are mostly about the VENDOR, not the
-- order. Store staff were retyping them on every PO to the same vendor.
--
-- On INSERT of a purchase order, anything left empty is filled from that vendor's
-- most recent order that has details:
--   * header_field_values — minus the per-order keys (quotation ref/date, call
--     date, advance cheque/NEFT, its date, bank and amount), which never carry
--   * footer_field_values, terms_and_conditions, po_format_id
-- Then the per-order quotation keys are filled from THIS order's own quotation
-- (vendor_quote_number, quote_date) and delivery/payment from it when still empty.
--
-- Only empty values are filled, so anything the caller passes wins. Existing POs
-- are not touched. Editing and saving a PO's details is what the next order copies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_procurement_po_carry_vendor_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last  public.procurement_purchase_orders%ROWTYPE;
  v_quote record;
  v_hdr   jsonb := coalesce(NEW.header_field_values, '{}'::jsonb);
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_last
    FROM public.procurement_purchase_orders po
   WHERE po.supplier_id = NEW.supplier_id
     AND po.status <> 'cancelled'
     AND (po.header_field_values <> '{}'::jsonb
          OR po.footer_field_values <> '{}'::jsonb
          OR po.terms_and_conditions IS NOT NULL)
   ORDER BY po.updated_at DESC NULLS LAST, po.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_hdr = '{}'::jsonb THEN
      v_hdr := coalesce(v_last.header_field_values, '{}'::jsonb)
               - 'quotation_no' - 'quotation_date' - 'call_dated'
               - 'payment_mode' - 'paid_on' - 'bank' - 'amount_paid';
    END IF;
    IF coalesce(NEW.footer_field_values, '{}'::jsonb) = '{}'::jsonb THEN
      NEW.footer_field_values := coalesce(v_last.footer_field_values, '{}'::jsonb);
    END IF;
    IF NEW.terms_and_conditions IS NULL THEN
      NEW.terms_and_conditions := v_last.terms_and_conditions;
    END IF;
    IF NEW.po_format_id IS NULL THEN
      NEW.po_format_id := v_last.po_format_id;
    END IF;
  END IF;

  -- This order's own quotation supplies its reference, date and (if still empty)
  -- delivery and payment terms.
  IF NEW.rfq_id IS NOT NULL THEN
    SELECT q.vendor_quote_number, q.quote_date, q.delivery_time_days, q.payment_terms
      INTO v_quote
      FROM public.procurement_quotations q
     WHERE q.rfq_id = NEW.rfq_id
       AND q.supplier_id = NEW.supplier_id
     ORDER BY q.updated_at DESC
     LIMIT 1;

    IF FOUND THEN
      IF coalesce(v_hdr->>'quotation_no', '') = '' AND coalesce(v_quote.vendor_quote_number, '') <> '' THEN
        v_hdr := v_hdr || jsonb_build_object('quotation_no', v_quote.vendor_quote_number);
      END IF;
      IF coalesce(v_hdr->>'quotation_date', '') = '' AND v_quote.quote_date IS NOT NULL THEN
        v_hdr := v_hdr || jsonb_build_object('quotation_date', to_char(v_quote.quote_date, 'DD-MM-YYYY'));
      END IF;
      IF coalesce(v_hdr->>'delivery', '') = '' AND v_quote.delivery_time_days IS NOT NULL THEN
        v_hdr := v_hdr || jsonb_build_object('delivery', v_quote.delivery_time_days || ' days');
      END IF;
      IF coalesce(v_hdr->>'payment', '') = '' AND coalesce(v_quote.payment_terms, '') <> '' THEN
        v_hdr := v_hdr || jsonb_build_object('payment', v_quote.payment_terms);
      END IF;
    END IF;
  END IF;

  NEW.header_field_values := v_hdr;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_procurement_po_carry_vendor_details() IS
  'BEFORE INSERT on procurement_purchase_orders: fills empty printed details from the '
  'vendor''s most recent PO with details (minus per-order quotation/advance keys), then '
  'quotation ref/date and delivery/payment from this order''s own quotation.';

DROP TRIGGER IF EXISTS trg_ppo_carry_vendor_details ON public.procurement_purchase_orders;
CREATE TRIGGER trg_ppo_carry_vendor_details
  BEFORE INSERT ON public.procurement_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_po_carry_vendor_details();
