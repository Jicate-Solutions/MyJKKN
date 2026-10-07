-- Poor-rating alert goes to the people who handled THIS purchase (RFQ creator, award
-- sender, award approver) instead of every Super Admin — live has 14, so one bad rating
-- paged 14 people. Body otherwise identical to 20271007100100.
CREATE OR REPLACE FUNCTION public.procurement_rate_item(
  p_grn_item_id uuid, p_stars int, p_meets_spec text, p_comment text DEFAULT NULL
) RETURNS public.procurement_ratings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gi     procurement_grn_items%ROWTYPE;
  g      procurement_grn%ROWTYPE;
  v_rfq  procurement_rfqs%ROWTYPE;
  v_req  procurement_purchase_requests%ROWTYPE;
  v_mfr  text;
  r      procurement_ratings;
  v_team uuid[];
BEGIN
  SELECT * INTO gi FROM procurement_grn_items WHERE id = p_grn_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found.' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(gi.accepted_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Only items you received can be rated.' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO g FROM procurement_grn WHERE id = gi.grn_id;
  SELECT rfq.* INTO v_rfq FROM procurement_purchase_orders po
    JOIN procurement_rfqs rfq ON rfq.id = po.rfq_id WHERE po.id = g.purchase_order_id;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = v_rfq.source_request_id;
  IF auth.uid() IS DISTINCT FROM v_req.requested_by AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the person who asked for this item can rate it.' USING ERRCODE = '42501';
  END IF;
  SELECT qi.manufacturer INTO v_mfr FROM procurement_purchase_order_items poi
    JOIN procurement_quotation_items qi ON qi.id = poi.source_quotation_item_id
   WHERE poi.id = gi.po_item_id;

  INSERT INTO procurement_ratings
    (kind, grn_id, grn_item_id, supplier_id, item_id, manufacturer, request_id, rater_id,
     stars, meets_spec, comment)
  VALUES ('item_quality', g.id, gi.id, g.supplier_id, gi.domain_item_id, nullif(trim(v_mfr), ''),
          v_req.id, auth.uid(), p_stars, p_meets_spec, nullif(trim(p_comment), ''))
  ON CONFLICT (grn_item_id, rater_id) WHERE kind = 'item_quality'
  DO UPDATE SET stars = EXCLUDED.stars, meets_spec = EXCLUDED.meets_spec,
                comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO r;

  IF v_req.id IS NOT NULL AND (r.stars <= 2 OR r.meets_spec = 'no') THEN
    SELECT array_agg(DISTINCT u) INTO v_team
      FROM unnest(ARRAY[v_rfq.created_by, v_rfq.award_submitted_by, v_rfq.award_approved_by]) AS u
     WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
    PERFORM procurement_notify_users(
      v_req.id, v_team,
      'Poor rating: ' || gi.item_name,
      r.stars || '★' || CASE WHEN r.meets_spec = 'no' THEN ', not to spec' ELSE '' END
        || ' — ' || left(coalesce(r.comment, ''), 140),
      'Open request',
      'rating-low-' || r.id || '-' || r.stars || '-' || r.meets_spec);
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.procurement_rate_item(uuid, int, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_rate_item(uuid, int, text, text) TO authenticated;
