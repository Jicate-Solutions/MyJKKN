-- Vendor & item ratings (closed feedback loop).
--   delivery     — store admin, one per GRN, at verify time
--   item_quality — requester, one per accepted GRN line, after using the item
-- Writes only through procurement_rate_delivery / procurement_rate_item (SECURITY DEFINER).
-- The vendor score itself is computed in app code (lib/procurement/vendor-score.ts)
-- from procurement_vendor_kpis(), so weights change without a migration.

CREATE TABLE IF NOT EXISTS public.procurement_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('delivery', 'item_quality')),
  grn_id        uuid NOT NULL REFERENCES public.procurement_grn(id) ON DELETE CASCADE,
  grn_item_id   uuid REFERENCES public.procurement_grn_items(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL REFERENCES public.ims_suppliers(id),
  item_id       uuid,                 -- procurement_grn_items.domain_item_id
  manufacturer  text,                 -- from the awarded quotation line
  request_id    uuid REFERENCES public.procurement_purchase_requests(id) ON DELETE SET NULL,
  rater_id      uuid NOT NULL REFERENCES public.profiles(id),
  stars         smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  meets_spec    text CHECK (meets_spec IN ('yes', 'partly', 'no')),
  tags          text[] NOT NULL DEFAULT '{}',
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procurement_ratings_shape CHECK (
    (kind = 'delivery'     AND grn_item_id IS NULL     AND meets_spec IS NULL) OR
    (kind = 'item_quality' AND grn_item_id IS NOT NULL AND meets_spec IS NOT NULL)),
  CONSTRAINT procurement_ratings_low_needs_comment CHECK (
    kind <> 'item_quality' OR stars > 2 OR length(trim(coalesce(comment, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS procurement_ratings_delivery_once
  ON public.procurement_ratings (grn_id, rater_id) WHERE kind = 'delivery';
CREATE UNIQUE INDEX IF NOT EXISTS procurement_ratings_item_once
  ON public.procurement_ratings (grn_item_id, rater_id) WHERE kind = 'item_quality';
CREATE INDEX IF NOT EXISTS procurement_ratings_supplier ON public.procurement_ratings (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS procurement_ratings_item     ON public.procurement_ratings (item_id, supplier_id);
CREATE INDEX IF NOT EXISTS procurement_ratings_request  ON public.procurement_ratings (request_id);

ALTER TABLE public.procurement_ratings ENABLE ROW LEVEL SECURITY;
-- Read = your own ratings, or any rating on a GRN you can already see (inherits procurement_grn RLS).
DROP POLICY IF EXISTS procurement_ratings_read ON public.procurement_ratings;
CREATE POLICY procurement_ratings_read ON public.procurement_ratings FOR SELECT TO authenticated
  USING (rater_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.procurement_grn g WHERE g.id = grn_id));
REVOKE ALL ON public.procurement_ratings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.procurement_ratings FROM authenticated;
GRANT SELECT ON public.procurement_ratings TO authenticated;

-- Store admin: one delivery rating per GRN (re-rating edits it).
CREATE OR REPLACE FUNCTION public.procurement_rate_delivery(
  p_grn_id uuid, p_stars int, p_tags text[] DEFAULT '{}', p_comment text DEFAULT NULL
) RETURNS public.procurement_ratings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g procurement_grn%ROWTYPE;
  r procurement_ratings;
BEGIN
  SELECT * INTO g FROM procurement_grn WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found.' USING ERRCODE = 'P0002'; END IF;
  IF g.status NOT IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed') THEN
    RAISE EXCEPTION 'Rate the delivery after it is verified.' USING ERRCODE = '55000';
  END IF;
  IF auth.uid() IS DISTINCT FROM g.verified_by AND auth.uid() IS DISTINCT FROM g.received_by
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the person who received or verified this delivery can rate it.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO procurement_ratings (kind, grn_id, supplier_id, rater_id, stars, tags, comment)
  VALUES ('delivery', g.id, g.supplier_id, auth.uid(), p_stars, coalesce(p_tags, '{}'),
          nullif(trim(p_comment), ''))
  ON CONFLICT (grn_id, rater_id) WHERE kind = 'delivery'
  DO UPDATE SET stars = EXCLUDED.stars, tags = EXCLUDED.tags, comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.procurement_rate_delivery(uuid, int, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_rate_delivery(uuid, int, text[], text) TO authenticated;

-- Requester: one quality rating per accepted GRN line. Low ratings alert the purchase team.
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
    SELECT array_agg(DISTINCT u) INTO v_team FROM (
      SELECT v_rfq.created_by AS u
      UNION SELECT v_rfq.award_submitted_by
      UNION SELECT p.id FROM profiles p
             WHERE coalesce(p.is_active, true) AND (p.is_super_admin = true OR p.role = 'super_admin')
    ) t WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
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
