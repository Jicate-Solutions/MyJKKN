-- Procurement: renegotiate an order's prices with the same vendor.
--
-- Until now an order was final once the Super Admin approved the award: the quotes
-- lock, the PO is created 'approved', and nothing could change its prices. Vendors do
-- come back with a better (or corrected) quotation after the order goes out, so:
--
--   1. The store opens "Renegotiate" on the order, uploads the vendor's revised
--      quotation (the AI reader fills the new prices), says why, and proposes it.
--      -> procurement_po_revisions row, status 'pending'. Deliveries on that order
--         wait until it is decided.
--   2. The Super Admin approves or rejects it — the same person who approved the
--      original prices signs the new ones.
--      -> approved: the SAME order is updated in place (same PO number, PO items keep
--         their ids so deliveries still link), revision_no + 1, quotation ref / date /
--         delivery / payment on the order header updated; the vendor's quotation lines
--         are updated too, so the comparison shows what was finally agreed. The old
--         prices stay in the revision row.
--
-- Only while nothing is delivered: an order with any goods receipt cannot be repriced
-- (receipts copy the PO price at the time they are made).

-- 1. Revision history -------------------------------------------------------------
ALTER TABLE public.procurement_purchase_orders
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revised_at timestamptz;

CREATE TABLE IF NOT EXISTS public.procurement_po_revisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               uuid NOT NULL REFERENCES public.procurement_purchase_orders(id) ON DELETE CASCADE,
  institution_id      uuid NOT NULL,
  -- Attempt number per order (1, 2, …); rejected / withdrawn attempts keep theirs.
  revision_no         integer NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reason              text NOT NULL,
  -- The vendor's revised quotation, as read from its PDF.
  vendor_quote_number text,
  quote_date          date,
  delivery_time_days  integer,
  payment_terms       text,
  document_url        text,
  -- [{po_item_id, item_name, quantity, unit_label, old_unit_price, new_unit_price}]
  lines               jsonb NOT NULL,
  old_total           numeric NOT NULL,
  new_total           numeric NOT NULL,
  requested_by        uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  decided_by          uuid REFERENCES public.profiles(id),
  decided_at          timestamptz,
  decision_note       text,
  UNIQUE (po_id, revision_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ppor_one_pending_per_po
  ON public.procurement_po_revisions (po_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ppor_pending
  ON public.procurement_po_revisions (institution_id) WHERE status = 'pending';

COMMENT ON TABLE public.procurement_po_revisions IS
  'Renegotiated prices for an order: proposed by the store from a revised vendor quotation, approved by the Super Admin. Old and new prices per line.';

ALTER TABLE public.procurement_po_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppor_institution_read ON public.procurement_po_revisions;
CREATE POLICY ppor_institution_read ON public.procurement_po_revisions
  FOR SELECT TO authenticated
  USING (role_has_institution_access(institution_id));
-- Writes only through the functions below.
REVOKE ALL ON public.procurement_po_revisions FROM PUBLIC, anon;
GRANT SELECT ON public.procurement_po_revisions TO authenticated;

-- 2. Let the approved revision update the locked quotation --------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_lock_decided_quotes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rfq_id uuid;
  v_status text;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  -- Set (transaction-local) only inside procurement_decide_po_revision, after its
  -- Super Admin check: the agreed revised prices are written back to the quotation.
  IF current_setting('procurement.applying_revision', true) = 'on' THEN
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
$function$;

-- 3. No delivery while new prices wait for approval ---------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_block_pending_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.procurement_po_revisions
              WHERE po_id = NEW.purchase_order_id AND status = 'pending') THEN
    RAISE EXCEPTION 'new prices for this order are waiting for the Super Admin — record the delivery after they are decided'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pgrn_block_pending_revision ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_block_pending_revision
  BEFORE INSERT ON public.procurement_grn
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_block_pending_revision();

-- 4. Propose ---------------------------------------------------------------------
-- p_lines: [{po_item_id, unit_price}] — every line of the order may be listed; lines
--          left out keep their price.
-- p_quote: {vendor_quote_number, quote_date (YYYY-MM-DD), delivery_time_days,
--           payment_terms, document_url} — all optional.
CREATE OR REPLACE FUNCTION public.procurement_propose_po_revision(
  p_po_id  uuid,
  p_lines  jsonb,
  p_reason text,
  p_quote  jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po        public.procurement_purchase_orders;
  v_lines     jsonb;
  v_old       numeric;
  v_new       numeric;
  v_changed   int;
  v_id        uuid;
  v_rev       int;
  v_recips    uuid[];
  v_notif     uuid;
  v_vendor    text;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('procurement.rfq_manage')
          OR public.user_has_permission('procurement.quotation_manage')) THEN
    RAISE EXCEPTION 'not authorized to renegotiate an order — this needs the quotation permission'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'say why the prices are changing' USING ERRCODE = '23502';
  END IF;

  SELECT * INTO v_po FROM public.procurement_purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.role_has_institution_access(v_po.institution_id) THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status NOT IN ('approved', 'sent') THEN
    RAISE EXCEPTION 'only an order that is not delivered yet can be renegotiated (this one is %)',
      replace(v_po.status, '_', ' ') USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.procurement_grn
              WHERE purchase_order_id = p_po_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'a delivery is already recorded on this order — it can no longer be renegotiated'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.procurement_po_revisions
              WHERE po_id = p_po_id AND status = 'pending') THEN
    RAISE EXCEPTION 'new prices for this order are already waiting for the Super Admin'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
     WHERE NOT EXISTS (SELECT 1 FROM public.procurement_purchase_order_items i
                        WHERE i.id = (l->>'po_item_id')::uuid AND i.po_id = p_po_id)
        OR coalesce((l->>'unit_price')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'every new price must be more than 0 and belong to this order' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'po_item_id', i.id,
           'item_name', i.item_name,
           'quantity', i.ordered_quantity,
           'unit_label', i.unit_label,
           'old_unit_price', i.unit_price,
           'new_unit_price', coalesce((l.v->>'unit_price')::numeric, i.unit_price)
         ) ORDER BY i.created_at),
         sum(i.unit_price * i.ordered_quantity),
         sum(coalesce((l.v->>'unit_price')::numeric, i.unit_price) * i.ordered_quantity),
         count(*) FILTER (WHERE coalesce((l.v->>'unit_price')::numeric, i.unit_price) <> i.unit_price)
    INTO v_lines, v_old, v_new, v_changed
    FROM public.procurement_purchase_order_items i
    LEFT JOIN LATERAL (
      SELECT x AS v FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
       WHERE (x->>'po_item_id')::uuid = i.id LIMIT 1
    ) l ON true
   WHERE i.po_id = p_po_id;

  IF coalesce(v_changed, 0) = 0
     AND nullif(trim(coalesce(p_quote->>'payment_terms', '')), '') IS NULL
     AND nullif(p_quote->>'delivery_time_days', '') IS NULL THEN
    RAISE EXCEPTION 'nothing changed — no price, delivery or payment terms are different'
      USING ERRCODE = '22023';
  END IF;

  -- Attempt number (rejected / withdrawn ones count too); the order's own
  -- revision_no only moves when a revision is approved.
  SELECT coalesce(max(revision_no), 0) + 1 INTO v_rev
    FROM public.procurement_po_revisions WHERE po_id = p_po_id;
  INSERT INTO public.procurement_po_revisions (
    po_id, institution_id, revision_no, reason,
    vendor_quote_number, quote_date, delivery_time_days, payment_terms, document_url,
    lines, old_total, new_total, requested_by
  ) VALUES (
    p_po_id, v_po.institution_id, v_rev, trim(p_reason),
    nullif(trim(coalesce(p_quote->>'vendor_quote_number', '')), ''),
    nullif(p_quote->>'quote_date', '')::date,
    nullif(p_quote->>'delivery_time_days', '')::int,
    nullif(trim(coalesce(p_quote->>'payment_terms', '')), ''),
    nullif(p_quote->>'document_url', ''),
    v_lines, v_old, v_new, auth.uid()
  ) RETURNING id INTO v_id;

  -- Tell the Super Admins: same people who approved the original prices.
  BEGIN
    SELECT array_agg(p.id) INTO v_recips FROM profiles p
     WHERE (p.is_super_admin = true OR p.role = 'super_admin')
       AND coalesce(p.is_active, true) AND NOT coalesce(p.is_login_disabled, false);
    SELECT name INTO v_vendor FROM ims_suppliers WHERE id = v_po.supplier_id;
    IF v_recips IS NOT NULL THEN
      INSERT INTO notifications (title, body, url, created_by, targeting, priority, category, metadata, idempotency_key)
      VALUES (
        'New prices for ' || v_po.po_number || ' need your approval',
        coalesce(v_vendor, 'The vendor') || ' revised the quotation: ₹' || to_char(v_old, 'FM99,99,99,990') ||
          ' → ₹' || to_char(v_new, 'FM99,99,99,990') || ' — ' || trim(p_reason),
        '/procurement/requests/' || coalesce((SELECT source_request_id FROM procurement_rfqs WHERE id = v_po.rfq_id)::text, '') || '#orders',
        coalesce(auth.uid(), v_recips[1]),
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recips)),
        'high', 'procurement',
        jsonb_build_object('type', 'info', 'source', 'procurement_po_revision', 'revision_id', v_id, 'action_label', 'Review new prices'),
        'procurement_po_revision:' || v_id
      )
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_notif;
      IF v_notif IS NOT NULL THEN
        INSERT INTO user_notifications (notification_id, user_id)
        SELECT v_notif, unnest(v_recips) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'procurement_propose_po_revision notify(%): %', v_id, SQLERRM;
  END;

  RETURN v_id;
END;
$function$;

-- 5. Decide (Super Admin) / withdraw (whoever proposed it) ---------------------------
CREATE OR REPLACE FUNCTION public.procurement_decide_po_revision(
  p_revision_id uuid,
  p_approve     boolean,
  p_note        text DEFAULT NULL
)
RETURNS public.procurement_po_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rev   public.procurement_po_revisions;
  v_po    public.procurement_purchase_orders;
  v_notif uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only a Super Admin can approve or reject new prices' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_rev FROM public.procurement_po_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_rev.status <> 'pending' THEN
    RAISE EXCEPTION 'these prices were already %', v_rev.status USING ERRCODE = '55000';
  END IF;
  IF NOT p_approve AND nullif(trim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'say why the new prices are rejected' USING ERRCODE = '23502';
  END IF;

  SELECT * INTO v_po FROM public.procurement_purchase_orders WHERE id = v_rev.po_id FOR UPDATE;

  IF p_approve THEN
    IF v_po.status NOT IN ('approved', 'sent')
       OR EXISTS (SELECT 1 FROM public.procurement_grn
                   WHERE purchase_order_id = v_po.id AND status <> 'cancelled') THEN
      RAISE EXCEPTION 'this order has moved on (delivered or closed) — the new prices can no longer be applied'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.procurement_purchase_order_items i
       SET unit_price = (l->>'new_unit_price')::numeric,
           line_total = (l->>'new_unit_price')::numeric * i.ordered_quantity
      FROM jsonb_array_elements(v_rev.lines) l
     WHERE i.id = (l->>'po_item_id')::uuid AND i.po_id = v_po.id;

    UPDATE public.procurement_purchase_orders o
       SET subtotal = s.total,
           total_amount = s.total + coalesce(o.tax_amount, 0),
           payment_terms = coalesce(v_rev.payment_terms, o.payment_terms),
           header_field_values = coalesce(o.header_field_values, '{}'::jsonb)
             || CASE WHEN v_rev.vendor_quote_number IS NOT NULL
                     THEN jsonb_build_object('quotation_no', v_rev.vendor_quote_number) ELSE '{}'::jsonb END
             || CASE WHEN v_rev.quote_date IS NOT NULL
                     THEN jsonb_build_object('quotation_date', to_char(v_rev.quote_date, 'DD-MM-YYYY')) ELSE '{}'::jsonb END
             || CASE WHEN v_rev.delivery_time_days IS NOT NULL
                     THEN jsonb_build_object('delivery', v_rev.delivery_time_days || ' days') ELSE '{}'::jsonb END
             || CASE WHEN v_rev.payment_terms IS NOT NULL
                     THEN jsonb_build_object('payment', v_rev.payment_terms) ELSE '{}'::jsonb END,
           revision_no = o.revision_no + 1,
           revised_at = now(),
           updated_at = now()
      FROM (SELECT sum(line_total) AS total FROM public.procurement_purchase_order_items WHERE po_id = v_po.id) s
     WHERE o.id = v_po.id;

    -- The comparison shows what was finally agreed (old prices stay on the revision).
    PERFORM set_config('procurement.applying_revision', 'on', true);
    UPDATE public.procurement_quotation_items qi
       SET unit_price = (l->>'new_unit_price')::numeric
      FROM jsonb_array_elements(v_rev.lines) l
      JOIN public.procurement_purchase_order_items i ON i.id = (l->>'po_item_id')::uuid
     WHERE qi.id = i.source_quotation_item_id;
    UPDATE public.procurement_quotations q
       SET vendor_quote_number = coalesce(v_rev.vendor_quote_number, q.vendor_quote_number),
           quote_date          = coalesce(v_rev.quote_date, q.quote_date),
           delivery_time_days  = coalesce(v_rev.delivery_time_days, q.delivery_time_days),
           payment_terms       = coalesce(v_rev.payment_terms, q.payment_terms),
           total_amount        = (SELECT sum(qi.unit_price * coalesce(qi.quantity, ri.quantity))
                                    FROM public.procurement_quotation_items qi
                                    JOIN public.procurement_rfq_items ri ON ri.id = qi.rfq_item_id
                                   WHERE qi.quotation_id = q.id AND qi.unit_price IS NOT NULL),
           updated_at          = now()
     WHERE q.rfq_id = v_po.rfq_id AND q.supplier_id = v_po.supplier_id;
    PERFORM set_config('procurement.applying_revision', 'off', true);
  END IF;

  UPDATE public.procurement_po_revisions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   WHERE id = p_revision_id
  RETURNING * INTO v_rev;

  BEGIN
    IF v_rev.requested_by IS NOT NULL THEN
      INSERT INTO notifications (title, body, url, created_by, targeting, priority, category, metadata, idempotency_key)
      VALUES (
        CASE WHEN p_approve THEN 'New prices for ' || v_po.po_number || ' approved — send the revised order to the vendor'
             ELSE 'New prices for ' || v_po.po_number || ' were rejected' END,
        CASE WHEN p_approve THEN 'Revised order total ₹' || to_char(v_rev.new_total, 'FM99,99,99,990')
             ELSE coalesce(v_rev.decision_note, '') END,
        '/procurement/requests/' || coalesce((SELECT source_request_id FROM procurement_rfqs WHERE id = v_po.rfq_id)::text, '') || '#orders',
        coalesce(auth.uid(), v_rev.requested_by),
        jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(v_rev.requested_by)),
        'high', 'procurement',
        jsonb_build_object('type', CASE WHEN p_approve THEN 'success' ELSE 'warning' END,
                           'source', 'procurement_po_revision_decided', 'revision_id', v_rev.id),
        'procurement_po_revision_decided:' || v_rev.id
      )
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_notif;
      IF v_notif IS NOT NULL THEN
        INSERT INTO user_notifications (notification_id, user_id)
        VALUES (v_notif, v_rev.requested_by) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'procurement_decide_po_revision notify(%): %', v_rev.id, SQLERRM;
  END;

  RETURN v_rev;
END;
$function$;

CREATE OR REPLACE FUNCTION public.procurement_withdraw_po_revision(p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.procurement_po_revisions
     SET status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
   WHERE id = p_revision_id
     AND status = 'pending'
     AND (requested_by = auth.uid() OR public.is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only the person who proposed these prices can withdraw them, while they are pending'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.procurement_propose_po_revision(uuid, jsonb, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_decide_po_revision(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_withdraw_po_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_propose_po_revision(uuid, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_decide_po_revision(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_withdraw_po_revision(uuid) TO authenticated;
