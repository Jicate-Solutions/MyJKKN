-- procurement_revise_quotation: the AI now reads the validity date from the vendor's
-- revised quotation too (quotation reader v6), so the revision updates it as well.

CREATE OR REPLACE FUNCTION public.procurement_revise_quotation(
  p_quotation_id uuid,
  p_lines        jsonb,
  p_reason       text,
  p_quote        jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_q      public.procurement_quotations;
  v_status text;
  v_old    jsonb;
  v_new    jsonb;
  v_rev    int;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('procurement.quotation_manage')
          OR public.user_has_permission('procurement.rfq_manage')) THEN
    RAISE EXCEPTION 'not authorized to change a quotation — this needs the quotation permission'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'say why the quotation is revised' USING ERRCODE = '23502';
  END IF;

  SELECT * INTO v_q FROM public.procurement_quotations WHERE id = p_quotation_id FOR UPDATE;
  IF NOT FOUND OR NOT public.role_has_institution_access(v_q.institution_id) THEN
    RAISE EXCEPTION 'quotation not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT status INTO v_status FROM public.procurement_rfqs WHERE id = v_q.rfq_id;
  IF v_status = 'pending_award_approval' THEN
    RAISE EXCEPTION 'quotes are with the Super Admin — ask them to send it back first'
      USING ERRCODE = '55000';
  ELSIF v_status IN ('awarded', 'closed') THEN
    RAISE EXCEPTION 'the order is already placed — use Renegotiate on the order instead'
      USING ERRCODE = '55000';
  ELSIF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'this quotation request is cancelled' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
     WHERE NOT EXISTS (SELECT 1 FROM public.procurement_quotation_items i
                        WHERE i.id = (l->>'quotation_item_id')::uuid AND i.quotation_id = p_quotation_id)
        OR coalesce((l->>'unit_price')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'every new price must be more than 0 and belong to this quotation' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
           'header', jsonb_build_object('vendor_quote_number', v_q.vendor_quote_number, 'quote_date', v_q.quote_date,
                                        'delivery_time_days', v_q.delivery_time_days, 'payment_terms', v_q.payment_terms,
                                        'total_amount', v_q.total_amount),
           'lines', coalesce(jsonb_agg(jsonb_build_object('quotation_item_id', i.id, 'rfq_item_id', i.rfq_item_id,
                                                          'unit_price', i.unit_price) ORDER BY i.created_at), '[]'::jsonb))
    INTO v_old
    FROM public.procurement_quotation_items i WHERE i.quotation_id = p_quotation_id;

  UPDATE public.procurement_quotation_items i
     SET previous_unit_price = i.unit_price,
         unit_price = (l->>'unit_price')::numeric
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
   WHERE i.id = (l->>'quotation_item_id')::uuid
     AND i.quotation_id = p_quotation_id
     AND i.unit_price IS DISTINCT FROM (l->>'unit_price')::numeric;

  v_rev := v_q.revision_no + 1;
  UPDATE public.procurement_quotations q
     SET vendor_quote_number = coalesce(nullif(trim(coalesce(p_quote->>'vendor_quote_number', '')), ''), q.vendor_quote_number),
         quote_date          = coalesce(nullif(p_quote->>'quote_date', '')::date, q.quote_date),
         validity_date       = coalesce(nullif(p_quote->>'validity_date', '')::date, q.validity_date),
         delivery_time_days  = coalesce(nullif(p_quote->>'delivery_time_days', '')::int, q.delivery_time_days),
         payment_terms       = coalesce(nullif(trim(coalesce(p_quote->>'payment_terms', '')), ''), q.payment_terms),
         total_amount        = (SELECT sum(qi.unit_price * coalesce(qi.quantity, ri.quantity))
                                  FROM public.procurement_quotation_items qi
                                  JOIN public.procurement_rfq_items ri ON ri.id = qi.rfq_item_id
                                 WHERE qi.quotation_id = q.id AND qi.unit_price IS NOT NULL),
         revision_no         = v_rev,
         revised_at          = now(),
         revision_reason     = trim(p_reason),
         updated_at          = now()
   WHERE q.id = p_quotation_id
  RETURNING jsonb_build_object('vendor_quote_number', vendor_quote_number, 'quote_date', quote_date,
                               'delivery_time_days', delivery_time_days, 'payment_terms', payment_terms,
                               'total_amount', total_amount)
    INTO v_new;

  SELECT jsonb_build_object('header', v_new,
           'lines', coalesce(jsonb_agg(jsonb_build_object('quotation_item_id', i.id, 'rfq_item_id', i.rfq_item_id,
                                                          'unit_price', i.unit_price) ORDER BY i.created_at), '[]'::jsonb))
    INTO v_new
    FROM public.procurement_quotation_items i WHERE i.quotation_id = p_quotation_id;

  INSERT INTO public.procurement_quotation_revisions (quotation_id, institution_id, revision_no, reason, old, new, created_by)
  VALUES (p_quotation_id, v_q.institution_id, v_rev, trim(p_reason), v_old, v_new, auth.uid());

  RETURN v_rev;
END;
$function$;

REVOKE ALL ON FUNCTION public.procurement_revise_quotation(uuid, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_revise_quotation(uuid, jsonb, text, jsonb) TO authenticated;
