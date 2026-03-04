-- ============================================================
-- IMS Batch Management — Add missing columns + RPCs
-- Applied: 2026-03-04
-- ============================================================

-- ── 1. Add missing columns to ims_stock_batches ─────────────
ALTER TABLE ims_stock_batches
  ADD COLUMN IF NOT EXISTS gst_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS supplier_id         UUID         REFERENCES ims_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS quantity_available  NUMERIC      NOT NULL DEFAULT 0;

-- Backfill: existing rows get quantity_available = quantity
UPDATE ims_stock_batches
SET quantity_available = quantity
WHERE quantity_available = 0;

-- ── 2. Batch number counter table ────────────────────────────
-- Mirrors the ims_grn_number_counters / ims_indent_number_counters pattern.
CREATE TABLE IF NOT EXISTS ims_batch_number_counters (
  store_id  UUID NOT NULL REFERENCES ims_stores(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  counter   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, date)
);

ALTER TABLE ims_batch_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ims_batch_counters_auth"
  ON ims_batch_number_counters
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 3. RPC: ims_next_batch_number ────────────────────────────
-- Atomically increments the per-store per-day counter.
-- Returns the new counter value (caller formats as BTH-YYMMDD-XXXXX).
CREATE OR REPLACE FUNCTION ims_next_batch_number(p_store_id UUID, p_date DATE)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO ims_batch_number_counters (store_id, date, counter)
    VALUES (p_store_id, p_date, 1)
    ON CONFLICT (store_id, date) DO UPDATE
      SET counter = ims_batch_number_counters.counter + 1
    RETURNING counter INTO v_next;
  RETURN v_next;
END;
$$;

-- ── 4. RPC: ims_add_batch ─────────────────────────────────────
-- Atomically inserts a batch row AND upserts ims_stock_summary.
-- Returns the new batch UUID.
CREATE OR REPLACE FUNCTION ims_add_batch(
  p_item_id        UUID,
  p_batch_number   TEXT,
  p_quantity       NUMERIC,
  p_cost_price     NUMERIC,
  p_gst_rate       NUMERIC,
  p_entry_date     DATE,
  p_expiry_date    DATE,
  p_supplier_id    UUID,
  p_notes          TEXT,
  p_store_id       UUID,
  p_institution_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id   UUID;
  v_cost_with_gst NUMERIC;
  v_total_val  NUMERIC;
BEGIN
  v_cost_with_gst := p_cost_price * (1 + COALESCE(p_gst_rate, 0) / 100);
  v_total_val     := p_quantity * v_cost_with_gst;

  INSERT INTO ims_stock_batches (
    item_id, batch_number, quantity, quantity_available,
    cost_price, gst_rate, total_value,
    entry_date, expiry_date, supplier_id, notes,
    location_type, store_id, institution_id
  ) VALUES (
    p_item_id, p_batch_number, p_quantity, p_quantity,
    p_cost_price, COALESCE(p_gst_rate, 0), v_total_val,
    p_entry_date, p_expiry_date, p_supplier_id, p_notes,
    'central_store', p_store_id, p_institution_id
  )
  RETURNING id INTO v_batch_id;

  -- Upsert stock summary: add to current totals
  INSERT INTO ims_stock_summary (
    item_id, store_id, institution_id,
    current_quantity, available_quantity, reserved_quantity, total_value
  ) VALUES (
    p_item_id, p_store_id, p_institution_id,
    p_quantity, p_quantity, 0, v_total_val
  )
  ON CONFLICT (item_id, store_id) DO UPDATE
    SET current_quantity   = ims_stock_summary.current_quantity   + p_quantity,
        available_quantity = ims_stock_summary.available_quantity + p_quantity,
        total_value        = ims_stock_summary.total_value        + v_total_val,
        updated_at         = NOW();

  RETURN v_batch_id;
END;
$$;

-- ── 5. RPC: ims_deduct_batch_fefo ────────────────────────────
-- Deducts p_quantity from batches in FEFO order (earliest expiry first,
-- then FIFO by created_at). Only touches quantity_available — the
-- ims_stock_summary deduction is handled separately in the sale service.
CREATE OR REPLACE FUNCTION ims_deduct_batch_fefo(
  p_item_id  UUID,
  p_quantity NUMERIC,
  p_store_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r          RECORD;
  remaining  NUMERIC := p_quantity;
  deduct_qty NUMERIC;
BEGIN
  FOR r IN
    SELECT id, quantity_available
    FROM   ims_stock_batches
    WHERE  item_id            = p_item_id
      AND  store_id           = p_store_id
      AND  quantity_available > 0
    ORDER BY expiry_date ASC NULLS LAST, created_at ASC
  LOOP
    EXIT WHEN remaining <= 0;
    deduct_qty := LEAST(r.quantity_available, remaining);
    UPDATE ims_stock_batches
      SET quantity_available = quantity_available - deduct_qty
    WHERE id = r.id;
    remaining := remaining - deduct_qty;
  END LOOP;
END;
$$;
