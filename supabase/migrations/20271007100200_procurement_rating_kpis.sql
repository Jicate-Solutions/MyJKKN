-- Raw vendor KPIs for the score (lib/procurement/vendor-score.ts turns these into 0–100 + grade).
-- SECURITY DEFINER on purpose: every viewer must see the same score for a vendor, and a
-- store admin's GRN RLS would otherwise give them a partial history. Returns aggregates only.
-- Window: last 12 months.
-- Callers: anyone who can open Procurement (procurement.view) or a Super Admin;
-- auth.uid() IS NULL = postgres/service_role (server routes, cron).

CREATE OR REPLACE FUNCTION public.procurement_vendor_kpis(p_supplier_ids uuid[])
RETURNS TABLE (
  supplier_id uuid, grn_count int,
  on_time_eligible int, on_time int,
  ordered_qty numeric, received_qty numeric, accepted_qty numeric,
  invoice_lines int, invoice_matched int,
  price_lines int, price_held int,
  delivery_star_sum int, delivery_star_n int,
  item_star_sum int, item_star_n int,
  quote_requests int, quote_fast int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT DISTINCT unnest(p_supplier_ids) AS supplier_id),
  grn AS (
    SELECT g.id, g.supplier_id, g.created_at, po.expected_delivery_date
      FROM procurement_grn g JOIN procurement_purchase_orders po ON po.id = g.purchase_order_id
     WHERE g.supplier_id = ANY (p_supplier_ids)
       AND g.status IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed')
       AND g.created_at > now() - interval '12 months'),
  g_agg AS (
    SELECT grn.supplier_id, count(*)::int AS grn_count,
           count(*) FILTER (WHERE expected_delivery_date IS NOT NULL)::int AS on_time_eligible,
           count(*) FILTER (WHERE created_at::date <= expected_delivery_date + 2)::int AS on_time
      FROM grn GROUP BY grn.supplier_id),
  -- Orders past due (with 2 days' grace) and nothing received yet count as late deliveries.
  overdue AS (
    SELECT po.supplier_id, count(*)::int AS n
      FROM procurement_purchase_orders po
     WHERE po.supplier_id = ANY (p_supplier_ids)
       AND po.status IN ('approved', 'sent')
       AND po.expected_delivery_date + 2 < current_date
       AND po.expected_delivery_date > current_date - 365
       AND NOT EXISTS (SELECT 1 FROM procurement_grn g WHERE g.purchase_order_id = po.id)
     GROUP BY po.supplier_id),
  gi_agg AS (
    SELECT grn.supplier_id,
           sum(gi.ordered_quantity)  AS ordered_qty,
           sum(gi.received_quantity) AS received_qty,
           sum(gi.accepted_quantity) AS accepted_qty,
           count(*) FILTER (WHERE gi.match_status IS NOT NULL AND gi.match_status <> 'awaiting_invoice')::int AS invoice_lines,
           count(*) FILTER (WHERE gi.match_status = 'matched')::int AS invoice_matched
      FROM grn JOIN procurement_grn_items gi ON gi.grn_id = grn.id
     GROUP BY grn.supplier_id),
  price AS (
    SELECT po.supplier_id, count(*)::int AS price_lines,
           count(*) FILTER (WHERE poi.unit_price <= qi.unit_price)::int AS price_held
      FROM procurement_purchase_orders po
      JOIN procurement_purchase_order_items poi ON poi.po_id = po.id
      JOIN procurement_quotation_items qi ON qi.id = poi.source_quotation_item_id
     WHERE po.supplier_id = ANY (p_supplier_ids)
       AND po.approved_at > now() - interval '12 months'
       AND qi.unit_price IS NOT NULL
     GROUP BY po.supplier_id),
  stars AS (
    SELECT r.supplier_id,
           sum(r.stars) FILTER (WHERE r.kind = 'delivery')::int     AS delivery_star_sum,
           count(*)     FILTER (WHERE r.kind = 'delivery')::int     AS delivery_star_n,
           sum(r.stars) FILTER (WHERE r.kind = 'item_quality')::int AS item_star_sum,
           count(*)     FILTER (WHERE r.kind = 'item_quality')::int AS item_star_n
      FROM procurement_ratings r
     WHERE r.supplier_id = ANY (p_supplier_ids) AND r.created_at > now() - interval '12 months'
     GROUP BY r.supplier_id),
  -- RFQs sent at least 3 days ago (or already answered): did a quote come back within 3 days?
  quotes AS (
    SELECT rv.supplier_id, count(*)::int AS quote_requests,
           count(*) FILTER (WHERE fast.ok)::int AS quote_fast
      FROM procurement_rfq_vendors rv
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM procurement_quotations q
                        WHERE q.rfq_id = rv.rfq_id AND q.supplier_id = rv.supplier_id
                          AND q.created_at <= rv.sent_at + interval '3 days') AS ok) fast
     WHERE rv.supplier_id = ANY (p_supplier_ids)
       AND rv.sent_at > now() - interval '12 months'
       AND (rv.sent_at < now() - interval '3 days' OR fast.ok)
     GROUP BY rv.supplier_id)
  SELECT s.supplier_id,
         coalesce(g.grn_count, 0),
         coalesce(g.on_time_eligible, 0) + coalesce(od.n, 0),
         coalesce(g.on_time, 0),
         coalesce(gi.ordered_qty, 0), coalesce(gi.received_qty, 0), coalesce(gi.accepted_qty, 0),
         coalesce(gi.invoice_lines, 0), coalesce(gi.invoice_matched, 0),
         coalesce(p.price_lines, 0), coalesce(p.price_held, 0),
         coalesce(st.delivery_star_sum, 0), coalesce(st.delivery_star_n, 0),
         coalesce(st.item_star_sum, 0), coalesce(st.item_star_n, 0),
         coalesce(qq.quote_requests, 0), coalesce(qq.quote_fast, 0)
    FROM s
    LEFT JOIN g_agg   g  USING (supplier_id)
    LEFT JOIN overdue od USING (supplier_id)
    LEFT JOIN gi_agg  gi USING (supplier_id)
    LEFT JOIN price   p  USING (supplier_id)
    LEFT JOIN stars   st USING (supplier_id)
    LEFT JOIN quotes  qq USING (supplier_id)
   WHERE (auth.uid() IS NULL OR public.is_super_admin() OR public.user_has_permission('procurement.view'));
$$;

-- Global star means, the prior that small samples are shrunk toward.
CREATE OR REPLACE FUNCTION public.procurement_rating_means()
RETURNS TABLE (delivery_mean numeric, item_mean numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT avg(stars) FILTER (WHERE kind = 'delivery'),
         avg(stars) FILTER (WHERE kind = 'item_quality')
    FROM procurement_ratings
   WHERE created_at > now() - interval '12 months'
     AND (auth.uid() IS NULL OR public.is_super_admin() OR public.user_has_permission('procurement.view'));
$$;

-- Item × vendor × manufacturer ratings, for the request item picker and Ask AI.
-- latest_comment is shown without the rater's name.
CREATE OR REPLACE FUNCTION public.procurement_item_vendor_ratings(p_item_ids uuid[])
RETURNS TABLE (item_id uuid, supplier_id uuid, supplier_name text, manufacturer text,
               star_sum int, star_n int, meets_no int, latest_comment text, last_rated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.item_id, r.supplier_id, s.name, r.manufacturer,
         sum(r.stars)::int, count(*)::int,
         count(*) FILTER (WHERE r.meets_spec = 'no')::int,
         (array_agg(r.comment ORDER BY r.updated_at DESC) FILTER (WHERE r.comment IS NOT NULL))[1],
         max(r.updated_at)
    FROM procurement_ratings r JOIN ims_suppliers s ON s.id = r.supplier_id
   WHERE r.kind = 'item_quality' AND r.item_id = ANY (p_item_ids)
     AND (auth.uid() IS NULL OR public.is_super_admin() OR public.user_has_permission('procurement.view'))
   GROUP BY r.item_id, r.supplier_id, s.name, r.manufacturer;
$$;

REVOKE ALL ON FUNCTION public.procurement_vendor_kpis(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_rating_means() FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_item_vendor_ratings(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_vendor_kpis(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_rating_means() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_item_vendor_ratings(uuid[]) TO authenticated;
