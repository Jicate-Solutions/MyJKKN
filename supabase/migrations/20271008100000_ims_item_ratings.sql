-- IMS item ratings: the lab assistant (indent requester) rates what they received.
-- One pool with Procurement: rows go in procurement_ratings (kind 'ims_item'), so the same
-- item average and vendor score cover both modules. Vendor = supplier of the latest stock
-- batch of that item (prefers the indent's store); no batch supplier = item-only rating.
-- Writes only through ims_rate_indent_item(); reads through the definer RPCs below.

-- 1. Table: allow rating rows that come from an indent line instead of a GRN line.
ALTER TABLE public.procurement_ratings
  ADD COLUMN IF NOT EXISTS indent_item_id uuid REFERENCES public.ims_indent_request_items(id) ON DELETE CASCADE,
  ALTER COLUMN grn_id DROP NOT NULL,
  ALTER COLUMN supplier_id DROP NOT NULL;

ALTER TABLE public.procurement_ratings DROP CONSTRAINT IF EXISTS procurement_ratings_kind_check;
ALTER TABLE public.procurement_ratings ADD CONSTRAINT procurement_ratings_kind_check
  CHECK (kind IN ('delivery', 'item_quality', 'ims_item'));

ALTER TABLE public.procurement_ratings DROP CONSTRAINT IF EXISTS procurement_ratings_shape;
ALTER TABLE public.procurement_ratings ADD CONSTRAINT procurement_ratings_shape CHECK (
  (kind = 'delivery'     AND grn_id IS NOT NULL AND supplier_id IS NOT NULL
                         AND grn_item_id IS NULL AND meets_spec IS NULL) OR
  (kind = 'item_quality' AND grn_id IS NOT NULL AND supplier_id IS NOT NULL
                         AND grn_item_id IS NOT NULL AND meets_spec IS NOT NULL) OR
  (kind = 'ims_item'     AND grn_id IS NULL AND grn_item_id IS NULL
                         AND indent_item_id IS NOT NULL AND item_id IS NOT NULL AND meets_spec IS NOT NULL));

ALTER TABLE public.procurement_ratings DROP CONSTRAINT IF EXISTS procurement_ratings_low_needs_comment;
ALTER TABLE public.procurement_ratings ADD CONSTRAINT procurement_ratings_low_needs_comment CHECK (
  kind = 'delivery' OR stars > 2 OR length(trim(coalesce(comment, ''))) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS procurement_ratings_ims_item_once
  ON public.procurement_ratings (indent_item_id, rater_id) WHERE kind = 'ims_item';

-- 2. The score and item averages now count IMS item ratings too. Patch the live bodies so
-- nothing else in them can drift from what is deployed.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.procurement_vendor_kpis(uuid[])'::regprocedure) INTO d;
  d := replace(d, 'r.kind = ''item_quality''', 'r.kind IN (''item_quality'', ''ims_item'')');
  EXECUTE d;

  SELECT pg_get_functiondef('public.procurement_rating_means()'::regprocedure) INTO d;
  d := replace(d, 'FILTER (WHERE kind = ''item_quality'')', 'FILTER (WHERE kind IN (''item_quality'', ''ims_item''))');
  EXECUTE d;

  SELECT pg_get_functiondef('public.procurement_item_vendor_ratings(uuid[])'::regprocedure) INTO d;
  d := replace(d, 'r.kind = ''item_quality''', 'r.kind IN (''item_quality'', ''ims_item'')');
  EXECUTE d;
END $$;

-- 3. Lines the caller (indent requester) can rate: delivered indents, issued items only.
CREATE OR REPLACE FUNCTION public.ims_rateable_indent_lines(p_indent_id uuid)
RETURNS TABLE (
  indent_item_id uuid, item_id uuid, item_name text, item_code text,
  supplier_id uuid, supplier_name text, delivered_on timestamptz,
  my_stars smallint, my_meets_spec text, my_comment text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ii.id, ii.item_id, i.name, i.code, b.supplier_id, s.name, ind.updated_at,
         r.stars, r.meets_spec, r.comment
    FROM ims_indent_requests ind
    JOIN ims_indent_request_items ii ON ii.indent_id = ind.id AND coalesce(ii.issued_quantity, 0) > 0
    JOIN ims_items i ON i.id = ii.item_id
    LEFT JOIN LATERAL (
      SELECT sb.supplier_id FROM ims_stock_batches sb
       WHERE sb.item_id = ii.item_id AND sb.supplier_id IS NOT NULL
       ORDER BY (sb.store_id IS NOT DISTINCT FROM coalesce(ind.source_store_id, ind.store_id)) DESC,
                sb.entry_date DESC NULLS LAST, sb.created_at DESC
       LIMIT 1) b ON true
    LEFT JOIN ims_suppliers s ON s.id = b.supplier_id
    LEFT JOIN procurement_ratings r
           ON r.indent_item_id = ii.id AND r.kind = 'ims_item' AND r.rater_id = auth.uid()
   WHERE ind.id = p_indent_id
     AND ind.status IN ('delivered', 'received', 'received_with_variance')
     AND (ind.requested_by = auth.uid() OR public.is_super_admin())
   ORDER BY i.name;
$$;

-- 4. Save / change a rating.
CREATE OR REPLACE FUNCTION public.ims_rate_indent_item(
  p_indent_item_id uuid, p_stars int, p_meets_spec text, p_comment text DEFAULT NULL
) RETURNS public.procurement_ratings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ii  ims_indent_request_items%ROWTYPE;
  ind ims_indent_requests%ROWTYPE;
  v_supplier uuid;
  r   procurement_ratings;
BEGIN
  SELECT * INTO ii FROM ims_indent_request_items WHERE id = p_indent_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO ind FROM ims_indent_requests WHERE id = ii.indent_id;
  IF auth.uid() IS DISTINCT FROM ind.requested_by AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only the person who requested this indent can rate its items.' USING ERRCODE = '42501';
  END IF;
  IF ind.status NOT IN ('delivered', 'received', 'received_with_variance')
     OR coalesce(ii.issued_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Rate an item after you have received it.' USING ERRCODE = '55000';
  END IF;

  SELECT sb.supplier_id INTO v_supplier FROM ims_stock_batches sb
   WHERE sb.item_id = ii.item_id AND sb.supplier_id IS NOT NULL
   ORDER BY (sb.store_id IS NOT DISTINCT FROM coalesce(ind.source_store_id, ind.store_id)) DESC,
            sb.entry_date DESC NULLS LAST, sb.created_at DESC
   LIMIT 1;

  INSERT INTO procurement_ratings
    (kind, supplier_id, item_id, indent_item_id, rater_id, stars, meets_spec, comment)
  VALUES ('ims_item', v_supplier, ii.item_id, ii.id, auth.uid(), p_stars, p_meets_spec,
          nullif(trim(p_comment), ''))
  ON CONFLICT (indent_item_id, rater_id) WHERE kind = 'ims_item'
  DO UPDATE SET stars = EXCLUDED.stars, meets_spec = EXCLUDED.meets_spec,
                comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;

-- 5. Item master: average per item (both modules), and the last few ratings of one item.
CREATE OR REPLACE FUNCTION public.ims_item_rating_summary(p_item_ids uuid[])
RETURNS TABLE (item_id uuid, star_sum int, star_n int, meets_no int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.item_id, sum(r.stars)::int, count(*)::int, count(*) FILTER (WHERE r.meets_spec = 'no')::int
    FROM procurement_ratings r
   WHERE r.kind IN ('item_quality', 'ims_item') AND r.item_id = ANY (p_item_ids)
     AND auth.uid() IS NOT NULL
   GROUP BY r.item_id;
$$;

CREATE OR REPLACE FUNCTION public.ims_item_recent_ratings(p_item_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (stars smallint, meets_spec text, comment text, supplier_name text, rated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.stars, r.meets_spec, r.comment, s.name, r.updated_at
    FROM procurement_ratings r LEFT JOIN ims_suppliers s ON s.id = r.supplier_id
   WHERE r.kind IN ('item_quality', 'ims_item') AND r.item_id = p_item_id AND auth.uid() IS NOT NULL
   ORDER BY r.updated_at DESC
   LIMIT least(coalesce(p_limit, 5), 20);
$$;

REVOKE ALL ON FUNCTION public.ims_rateable_indent_lines(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.ims_rate_indent_item(uuid, int, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.ims_item_rating_summary(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.ims_item_recent_ratings(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ims_rateable_indent_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ims_rate_indent_item(uuid, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ims_item_rating_summary(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ims_item_recent_ratings(uuid, int) TO authenticated;
