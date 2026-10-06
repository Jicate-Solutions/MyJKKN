-- What the requester can rate. procurement_grn_items RLS is institution-scoped, so a
-- requester can't always read their own delivered lines — these definer functions return
-- only the caller's lines (or any, for a Super Admin) with the caller's existing rating.

CREATE OR REPLACE FUNCTION public.procurement_rateable_lines(p_request_id uuid)
RETURNS TABLE (
  grn_item_id uuid, grn_id uuid, grn_number text, received_on date,
  item_name text, accepted_quantity numeric, supplier_id uuid, supplier_name text,
  manufacturer text, my_stars smallint, my_meets_spec text, my_comment text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gi.id, g.id, g.grn_number, coalesce(g.verified_at, g.created_at)::date,
         gi.item_name, gi.accepted_quantity, g.supplier_id, s.name,
         nullif(trim(qi.manufacturer), ''),
         r.stars, r.meets_spec, r.comment
    FROM procurement_purchase_requests req
    JOIN procurement_rfqs rfq            ON rfq.source_request_id = req.id
    JOIN procurement_purchase_orders po  ON po.rfq_id = rfq.id
    JOIN procurement_grn g               ON g.purchase_order_id = po.id
    JOIN procurement_grn_items gi        ON gi.grn_id = g.id AND gi.accepted_quantity > 0
    JOIN ims_suppliers s                 ON s.id = g.supplier_id
    LEFT JOIN procurement_purchase_order_items poi ON poi.id = gi.po_item_id
    LEFT JOIN procurement_quotation_items qi       ON qi.id = poi.source_quotation_item_id
    LEFT JOIN procurement_ratings r ON r.grn_item_id = gi.id AND r.kind = 'item_quality'
                                   AND r.rater_id = auth.uid()
   WHERE req.id = p_request_id
     AND (req.requested_by = auth.uid() OR is_super_admin())
     AND g.status IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed')
   ORDER BY coalesce(g.verified_at, g.created_at), gi.item_name;
$$;

-- "N to rate" per request for the current user (My requests badge).
CREATE OR REPLACE FUNCTION public.procurement_my_unrated_counts()
RETURNS TABLE (request_id uuid, unrated int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT req.id, count(*)::int
    FROM procurement_purchase_requests req
    JOIN procurement_rfqs rfq            ON rfq.source_request_id = req.id
    JOIN procurement_purchase_orders po  ON po.rfq_id = rfq.id
    JOIN procurement_grn g               ON g.purchase_order_id = po.id
    JOIN procurement_grn_items gi        ON gi.grn_id = g.id AND gi.accepted_quantity > 0
   WHERE req.requested_by = auth.uid()
     AND g.status IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed')
     AND NOT EXISTS (SELECT 1 FROM procurement_ratings r
                      WHERE r.grn_item_id = gi.id AND r.kind = 'item_quality' AND r.rater_id = auth.uid())
   GROUP BY req.id;
$$;

REVOKE ALL ON FUNCTION public.procurement_rateable_lines(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_my_unrated_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_rateable_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_my_unrated_counts() TO authenticated;
