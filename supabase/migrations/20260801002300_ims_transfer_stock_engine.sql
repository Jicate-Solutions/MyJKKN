-- Phase 2 of the warehouse -> operating-store distribution feature.
-- Repairs the shared stock engine used by ALL supply transfers.
--
-- The engine as shipped was unsafe in four ways (all verified on the live DB):
--   1. On receipt the DESTINATION's ims_stock_summary was never incremented —
--      only batch rows were created. Stock vanished from the ledger.
--   2. The dispatch decrement was `WHERE ss.item_id = si.item_id` with NO
--      store predicate. Since ims_stock_summary is UNIQUE(item_id, store_id),
--      one dispatch decremented EVERY store's row for that item.
--   3. Source batches were never depleted, so summary and batches diverged
--      permanently on every dispatch.
--   4. GREATEST(0, ...) silently clamped over-dispatch to zero instead of
--      failing, quietly destroying stock.
--
-- Safe to rewrite in place: ims_supply_shipments, ims_supply_shipment_items and
-- ims_supply_distribution_events all have 0 rows — this engine has never run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STATUS: APPLIED TO PRODUCTION. Verified 2026-08-04 by OBJECT, not by ledger:
--   pg_class has ims_stock_movements, pg_proc has ims_pick_fefo_batches, and
--   pg_policies carries every policy below. supabase_migrations.schema_migrations
--   holds NO row for version 20260801002300 (nor for 20260801002301, the version
--   PR #2782 proposes to rename this file to) — the ledger is simply not a
--   reliable index of this repo, so absence there is not evidence of "pending".
--
-- 2026-08-04 CORRECTION — two RLS predicates in this file were WEAKER than the
-- boundary production actually enforces, so re-running the file (which a rename
-- invites, by making an applied migration look pending) would have DOWNGRADED a
-- live tenant boundary:
--
--   · ims_stock_movements_insert was `WITH CHECK (true)`. Live enforces
--     super_admin OR institution_id = the caller's own institution.
--   · ims_supply_shipment_item_batches carried a FOR ALL policy with
--     USING (true) WITH CHECK (true). Live carries a SELECT-only policy scoped
--     through shipment_item -> shipment -> store -> institution. RLS policies are
--     OR'd, so re-adding the permissive one would have made every tenant's batch
--     cost_price / expiry / quantity readable by any authenticated user — and
--     unlike the movements hole, no table GRANT stands in the way of that read
--     (authenticated holds SELECT on both tables).
--
-- A third predicate, ims_stock_movements_select, diverged the OTHER way: this
-- file narrowed it and would have revoked the cross-institution store grants set
-- two days earlier by 20260730130000. A lockout, not a leak, but the same defect
-- shape — a file that no longer describes the boundary production runs. It is
-- now the live predicate too.
--
-- All three are now written to match the live predicates verbatim, as installed by
-- 20260801002800_ims_transfer_engine_auth_hardening.sql. Re-applying this file
-- is therefore a no-op against production rather than a regression. Ordering is
-- unchanged: the hardening migration still runs after this one and still ends at
-- the same state, on a fresh replay as well as against production.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotency stamps. A retried status update must not move stock twice.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ims_supply_shipments
  ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_applied_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.ims_supply_shipments.stock_released_at IS
  'Set when the source store''s stock has been decremented. Guards against double-dispatch.';
COMMENT ON COLUMN public.ims_supply_shipments.stock_applied_at IS
  'Set when the destination store''s stock has been incremented. Guards against double-receipt.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Batch allocation records.
--    ims_supply_shipment_items.source_batch_id is a SINGLE uuid and therefore
--    cannot express one line drawn from two batches with different expiry
--    dates. This child table can, so expiry granularity survives the hop.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ims_supply_shipment_item_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_item_id  UUID NOT NULL REFERENCES public.ims_supply_shipment_items(id) ON DELETE CASCADE,
  source_batch_id   UUID REFERENCES public.ims_stock_batches(id),
  quantity          NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  cost_price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  expiry_date       DATE,
  batch_number      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backstop: if the status guard is ever bypassed, a retry fails here rather
-- than silently allocating twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_shipment_item_batch
  ON public.ims_supply_shipment_item_batches (shipment_item_id, source_batch_id)
  WHERE source_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ims_shipment_item_batches_item
  ON public.ims_supply_shipment_item_batches (shipment_item_id);

ALTER TABLE public.ims_supply_shipment_item_batches ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped, SELECT only, reached through the shipment the batch hangs off.
-- Reproduces the live pg_policies row verbatim (policy
-- ims_supply_shipment_item_batches_select, read 2026-08-04). Writes go through
-- the SECURITY DEFINER functions below, which run as owner and ignore this.
--
-- This file previously created ims_supply_shipment_item_batches_all with
-- USING (true) WITH CHECK (true). Do not restore it: authenticated holds SELECT
-- on this table, policies are OR'd, and one permissive true policy therefore
-- publishes every tenant's batch cost_price, expiry and quantities.
DROP POLICY IF EXISTS ims_supply_shipment_item_batches_all    ON public.ims_supply_shipment_item_batches;
DROP POLICY IF EXISTS ims_supply_shipment_item_batches_select ON public.ims_supply_shipment_item_batches;
CREATE POLICY ims_supply_shipment_item_batches_select
  ON public.ims_supply_shipment_item_batches
  FOR SELECT TO authenticated
  USING (
    (SELECT public.get_current_user_role()) = 'super_admin'
    OR EXISTS (
      SELECT 1
        FROM public.ims_supply_shipment_items sit
        JOIN public.ims_supply_shipments sh ON sh.id = sit.shipment_id
        JOIN public.ims_stores s
          ON s.id IN (sh.source_store_id, sh.destination_store_id)
       WHERE sit.id = ims_supply_shipment_item_batches.shipment_item_id
         AND s.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Stock movement ledger.
--    NOT ims_stock_issues: its department_id is NOT NULL and
--    ims_department_stock_summary counts every row there as "a department
--    received this", so a store-to-store transfer would permanently inflate
--    department balances.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ims_stock_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type         TEXT NOT NULL CHECK (movement_type IN
                          ('transfer_out','transfer_in','grn','sale','issue','adjustment','return')),
  direction             SMALLINT NOT NULL CHECK (direction IN (-1, 1)),
  item_id               UUID NOT NULL REFERENCES public.ims_items(id),
  store_id              UUID NOT NULL REFERENCES public.ims_stores(id),
  batch_id              UUID REFERENCES public.ims_stock_batches(id),
  quantity              NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  unit_cost             NUMERIC(14,2),
  expiry_date           DATE,
  ref_type              TEXT NOT NULL,
  ref_id                UUID NOT NULL,
  counterparty_store_id UUID REFERENCES public.ims_stores(id),
  institution_id        UUID,
  actor_id              UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stock_movements_item_store
  ON public.ims_stock_movements (item_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_stock_movements_ref
  ON public.ims_stock_movements (ref_type, ref_id);

ALTER TABLE public.ims_stock_movements ENABLE ROW LEVEL SECURITY;

-- Reproduces the live pg_policies.qual verbatim (read 2026-08-04).
--
-- This file used to narrow the predicate to `institution_id = my own institution
-- OR role = super_admin`, dropping both ims_accessible_institution_ids() (the
-- cross-institution store grants added by 20260728103119) and is_super_admin().
-- That is a LOCKOUT rather than a leak — strictly fewer rows, not more — but it
-- silently reverted the wider scope 20260730130000 had set two days earlier, so
-- re-running this file would break every cross-institution store grant in IMS.
DROP POLICY IF EXISTS ims_stock_movements_select ON public.ims_stock_movements;
CREATE POLICY ims_stock_movements_select ON public.ims_stock_movements
  FOR SELECT TO authenticated
  USING (
    institution_id IN (SELECT public.ims_accessible_institution_ids())
    OR (SELECT public.get_current_user_role()) = 'super_admin'
    OR (SELECT public.is_super_admin())
  );

-- Reproduces the live pg_policies.with_check verbatim (read 2026-08-04). This
-- was `WITH CHECK (true)`, i.e. any signed-in user could forge ledger rows
-- against any college. Today a table GRANT (authenticated holds SELECT only,
-- set by 20260801002800) independently blocks the write — but that is the second
-- layer, not this one, and on a fresh replay this file runs BEFORE that revoke
-- while Supabase's default privileges still hand authenticated INSERT.
DROP POLICY IF EXISTS ims_stock_movements_insert ON public.ims_stock_movements;
CREATE POLICY ims_stock_movements_insert ON public.ims_stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_current_user_role()) = 'super_admin'
    OR institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FEFO pick list (read-only, reusable).
--    NULL expiry sorts LAST: unknown/non-perishable stock should not be shipped
--    ahead of dated stock that will expire. Matches idx_ims_stock_batches_fefo_read
--    and ImsStockService.getBatchesForItem's ordering.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_pick_fefo_batches(
  p_item_id  UUID,
  p_store_id UUID,
  p_quantity NUMERIC
)
RETURNS TABLE (batch_id UUID, take_qty NUMERIC, cost_price NUMERIC,
               expiry_date DATE, batch_number TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining NUMERIC := p_quantity;
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id, b.quantity_available, b.cost_price, b.expiry_date, b.batch_number
      FROM public.ims_stock_batches b
     WHERE b.item_id = p_item_id
       AND b.store_id = p_store_id
       AND COALESCE(b.quantity_available, 0) > 0
     ORDER BY (b.expiry_date IS NULL), b.expiry_date, b.entry_date, b.created_at, b.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    batch_id     := r.id;
    take_qty     := LEAST(v_remaining, r.quantity_available);
    cost_price   := COALESCE(r.cost_price, 0);
    expiry_date  := r.expiry_date;
    batch_number := r.batch_number;
    v_remaining  := v_remaining - take_qty;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.ims_pick_fefo_batches IS
  'First-Expiry-First-Out pick list for an item at a store. Read-only — safe to call from the UI to preview an allocation. Returns fewer rows than requested if stock is short; callers must check the total.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Dispatch: take stock OUT of the source store.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_ship_out_from_source(p_shipment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ship        RECORD;
  si            RECORD;
  alloc         RECORD;
  v_allocated   NUMERIC;
  v_new_qty     NUMERIC;
  v_inst        UUID;
  v_has_batches BOOLEAN;
BEGIN
  SELECT * INTO v_ship
    FROM public.ims_supply_shipments
   WHERE id = p_shipment_id
   FOR UPDATE;                                  -- serialises concurrent dispatch

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment % not found', p_shipment_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_ship.stock_released_at IS NOT NULL THEN
    RETURN;                                      -- already applied — idempotent
  END IF;

  IF v_ship.source_store_id IS NULL THEN
    RAISE EXCEPTION 'Shipment % has no source store', p_shipment_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT institution_id INTO v_inst FROM public.ims_stores WHERE id = v_ship.source_store_id;

  FOR si IN
    SELECT * FROM public.ims_supply_shipment_items
     WHERE shipment_id = p_shipment_id AND dispatched_qty > 0
     ORDER BY id
  LOOP
    -- (a) Summary: store-scoped. This UPDATE takes the row lock.
    UPDATE public.ims_stock_summary ss
       SET current_quantity   = COALESCE(ss.current_quantity, 0) - si.dispatched_qty,
           reserved_quantity  = GREATEST(0, COALESCE(ss.reserved_quantity, 0) - si.dispatched_qty),
           available_quantity = (COALESCE(ss.current_quantity, 0) - si.dispatched_qty)
                                - GREATEST(0, COALESCE(ss.reserved_quantity, 0) - si.dispatched_qty),
           total_value        = GREATEST(0, COALESCE(ss.total_value, 0)
                                            - si.dispatched_qty * COALESCE(si.cost_price, 0)),
           updated_at         = now()
     WHERE ss.item_id  = si.item_id
       AND ss.store_id = v_ship.source_store_id   -- ← the predicate that was missing
    RETURNING ss.current_quantity INTO v_new_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No stock row for item % at source store %',
        si.item_id, v_ship.source_store_id USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Block, never clamp. GREATEST(0,...) silently destroys stock.
    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for item % at store %: short by %',
        si.item_id, v_ship.source_store_id, abs(v_new_qty)
        USING ERRCODE = 'check_violation';
    END IF;

    -- (b) Batches. Stores with no batch coverage (e.g. every Pharmacy item)
    --     move on the summary alone rather than failing.
    SELECT EXISTS (
      SELECT 1 FROM public.ims_stock_batches
       WHERE item_id = si.item_id AND store_id = v_ship.source_store_id
         AND COALESCE(quantity_available, 0) > 0
    ) INTO v_has_batches;

    IF v_has_batches THEN
      v_allocated := 0;

      FOR alloc IN
        SELECT * FROM public.ims_pick_fefo_batches(
          si.item_id, v_ship.source_store_id, si.dispatched_qty)
      LOOP
        UPDATE public.ims_stock_batches
           SET quantity_available = quantity_available - alloc.take_qty,
               quantity           = GREATEST(0, COALESCE(quantity, 0) - alloc.take_qty),
               total_value        = GREATEST(0, COALESCE(quantity, 0) - alloc.take_qty)
                                    * COALESCE(cost_price, 0),
               updated_at         = now()
         WHERE id = alloc.batch_id;

        INSERT INTO public.ims_supply_shipment_item_batches
          (shipment_item_id, source_batch_id, quantity, cost_price, expiry_date, batch_number)
        VALUES (si.id, alloc.batch_id, alloc.take_qty, alloc.cost_price,
                alloc.expiry_date, alloc.batch_number)
        ON CONFLICT (shipment_item_id, source_batch_id) WHERE source_batch_id IS NOT NULL
          DO NOTHING;

        INSERT INTO public.ims_stock_movements
          (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
           expiry_date, ref_type, ref_id, counterparty_store_id, institution_id)
        VALUES ('transfer_out', -1, si.item_id, v_ship.source_store_id, alloc.batch_id,
                alloc.take_qty, alloc.cost_price, alloc.expiry_date,
                'shipment_item', si.id, v_ship.destination_store_id, v_inst);

        v_allocated := v_allocated + alloc.take_qty;
      END LOOP;

      IF v_allocated < si.dispatched_qty THEN
        RAISE EXCEPTION 'Insufficient batch stock for item % at store %: short by %',
          si.item_id, v_ship.source_store_id, si.dispatched_qty - v_allocated
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- Summary-only movement; still recorded in the ledger so the two sides balance.
      INSERT INTO public.ims_stock_movements
        (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
         ref_type, ref_id, counterparty_store_id, institution_id)
      VALUES ('transfer_out', -1, si.item_id, v_ship.source_store_id, NULL,
              si.dispatched_qty, COALESCE(si.cost_price, 0),
              'shipment_item', si.id, v_ship.destination_store_id, v_inst);
    END IF;
  END LOOP;

  UPDATE public.ims_supply_shipments
     SET stock_released_at = now()
   WHERE id = p_shipment_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Receipt: put stock INTO the destination store. This half never existed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_receive_into_destination(p_shipment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ship     RECORD;
  v_req_no   TEXT;
  si         RECORD;
  alloc      RECORD;
  v_ratio    NUMERIC;
  v_qty      NUMERIC;
  v_line     INT := 0;
  v_batch_id UUID;
  v_any      BOOLEAN;
BEGIN
  SELECT * INTO v_ship
    FROM public.ims_supply_shipments
   WHERE id = p_shipment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment % not found', p_shipment_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_ship.stock_applied_at IS NOT NULL THEN
    RETURN;                                      -- idempotent
  END IF;

  -- ON CONFLICT (item_id, store_id) can never match a NULL store_id (Postgres
  -- treats NULLs as distinct), so it would silently insert duplicates instead.
  IF v_ship.destination_store_id IS NULL THEN
    RAISE EXCEPTION 'Shipment % has no destination store — cannot credit stock', p_shipment_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT indent_number INTO v_req_no
    FROM public.ims_indent_requests WHERE id = v_ship.request_id;

  FOR si IN
    SELECT * FROM public.ims_supply_shipment_items
     WHERE shipment_id = p_shipment_id AND COALESCE(received_qty, 0) > 0
     ORDER BY id
  LOOP
    v_line := v_line + 1;

    -- (a) Summary: upsert — the destination may never have held this item.
    INSERT INTO public.ims_stock_summary
      (item_id, store_id, institution_id, current_quantity, reserved_quantity,
       available_quantity, opening_quantity, total_value, updated_at)
    VALUES (si.item_id, v_ship.destination_store_id, v_ship.destination_institution_id,
            si.received_qty, 0, si.received_qty, 0,
            si.received_qty * COALESCE(si.cost_price, 0), now())
    ON CONFLICT (item_id, store_id) DO UPDATE
      SET current_quantity   = COALESCE(public.ims_stock_summary.current_quantity, 0)
                               + EXCLUDED.current_quantity,
          available_quantity = (COALESCE(public.ims_stock_summary.current_quantity, 0)
                                + EXCLUDED.current_quantity)
                               - COALESCE(public.ims_stock_summary.reserved_quantity, 0),
          total_value        = COALESCE(public.ims_stock_summary.total_value, 0)
                               + EXCLUDED.total_value,
          updated_at         = now();

    -- (b) Batches: one destination batch per source allocation, so expiry and
    --     cost survive the hop. Short receipts are pro-rated across allocations.
    SELECT EXISTS (
      SELECT 1 FROM public.ims_supply_shipment_item_batches WHERE shipment_item_id = si.id
    ) INTO v_any;

    IF v_any THEN
      v_ratio := CASE WHEN si.dispatched_qty > 0
                      THEN si.received_qty / si.dispatched_qty ELSE 1 END;

      FOR alloc IN
        SELECT * FROM public.ims_supply_shipment_item_batches
         WHERE shipment_item_id = si.id ORDER BY created_at, id
      LOOP
        v_qty := ROUND(alloc.quantity * v_ratio, 2);
        CONTINUE WHEN v_qty <= 0;

        INSERT INTO public.ims_stock_batches
          (item_id, batch_number, expiry_date, quantity, quantity_available,
           entry_date, cost_price, gst_rate, total_value, grn_id, location_type,
           department_id, institution_id, store_id)
        VALUES (si.item_id,
                'SHP-' || COALESCE(v_req_no, 'NA') || '-' ||
                  substr(p_shipment_id::text, 1, 6) || '-' || lpad(v_line::text, 2, '0') ||
                  '-' || substr(COALESCE(alloc.source_batch_id::text, 'X'), 1, 4),
                alloc.expiry_date, v_qty, v_qty, CURRENT_DATE,
                alloc.cost_price, 0, v_qty * alloc.cost_price, NULL, 'central_store',
                NULL, v_ship.destination_institution_id, v_ship.destination_store_id)
        ON CONFLICT (item_id, store_id, batch_number) WHERE batch_number IS NOT NULL
          DO NOTHING
        RETURNING id INTO v_batch_id;

        INSERT INTO public.ims_stock_movements
          (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
           expiry_date, ref_type, ref_id, counterparty_store_id, institution_id)
        VALUES ('transfer_in', 1, si.item_id, v_ship.destination_store_id, v_batch_id,
                v_qty, alloc.cost_price, alloc.expiry_date,
                'shipment_item', si.id, v_ship.source_store_id,
                v_ship.destination_institution_id);
      END LOOP;
    ELSE
      -- Source had no batch coverage; credit the summary and log the movement.
      INSERT INTO public.ims_stock_movements
        (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
         ref_type, ref_id, counterparty_store_id, institution_id)
      VALUES ('transfer_in', 1, si.item_id, v_ship.destination_store_id, NULL,
              si.received_qty, COALESCE(si.cost_price, 0),
              'shipment_item', si.id, v_ship.source_store_id,
              v_ship.destination_institution_id);
    END IF;
  END LOOP;

  UPDATE public.ims_supply_shipments
     SET stock_applied_at = now()
   WHERE id = p_shipment_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The trigger now only sequences statuses and delegates the mutation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_apply_shipment_to_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'dispatched' AND OLD.status IS DISTINCT FROM 'dispatched' THEN
    PERFORM public.ims_ship_out_from_source(NEW.id);

    UPDATE public.ims_indent_requests
       SET status = 'shipped', updated_at = now()
     WHERE id = NEW.request_id AND status = 'approved';
  END IF;

  IF NEW.status IN ('received', 'received_with_variance')
     AND OLD.status NOT IN ('received', 'received_with_variance')
  THEN
    PERFORM public.ims_receive_into_destination(NEW.id);

    UPDATE public.ims_indent_requests
       SET status = CASE WHEN NEW.status = 'received_with_variance'
                         THEN 'received_with_variance' ELSE 'received' END,
           updated_at = now()
     WHERE id = NEW.request_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Close the RLS hole. These tables were USING(true)/WITH CHECK(true) on all
--    four commands, so ANY authenticated user could PATCH a shipment status and
--    thereby move real stock through the trigger above.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read ims_supply_shipments"   ON public.ims_supply_shipments;
DROP POLICY IF EXISTS "Authenticated users can insert ims_supply_shipments" ON public.ims_supply_shipments;
DROP POLICY IF EXISTS "Authenticated users can update ims_supply_shipments" ON public.ims_supply_shipments;
DROP POLICY IF EXISTS "Authenticated users can delete ims_supply_shipments" ON public.ims_supply_shipments;

CREATE POLICY ims_supply_shipments_select ON public.ims_supply_shipments
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.ims_stores s
       WHERE s.id IN (ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id)
         AND s.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY ims_supply_shipments_insert ON public.ims_supply_shipments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.ims_stores s
       WHERE s.id IN (ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id)
         AND s.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY ims_supply_shipments_update ON public.ims_supply_shipments
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.ims_stores s
       WHERE s.id IN (ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id)
         AND s.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY ims_supply_shipments_delete ON public.ims_supply_shipments
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'super_admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Lock anon.
--    Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, and
--    Postgres grants EXECUTE to PUBLIC by default, so without these an
--    unauthenticated caller holding the public anon key could read this stock
--    ledger and invoke the transfer engine directly. RLS is not a substitute.
--
--    Both tables are written ONLY by the SECURITY DEFINER functions below (which
--    run as owner and are unaffected by these grants), and no application code
--    reads or writes them through PostgREST — so authenticated gets SELECT only.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.ims_supply_shipment_item_batches FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.ims_supply_shipment_item_batches TO authenticated;

REVOKE ALL ON TABLE public.ims_stock_movements FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.ims_stock_movements TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ims_pick_fefo_batches(UUID, UUID, NUMERIC) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_pick_fefo_batches(UUID, UUID, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ims_ship_out_from_source(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_ship_out_from_source(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ims_receive_into_destination(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_receive_into_destination(UUID) TO authenticated;
