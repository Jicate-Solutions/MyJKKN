-- Add per-batch tracking columns to ims_stock_batches.
--
-- Resolves the schema drift where TypeScript types and the service layer
-- (lib/services/ims/stock-service.ts: addBatch / getBatchesForItem) expected
-- columns that never existed in production. The missing supplier FK was
-- breaking the embedded join in getBatchesForItem with an empty-{} PostgrestError.
--
-- Pre-migration row count: 285 batches, 0 with grn_id, 0 consumption recorded
-- (current_quantity == SUM(quantity) for every (item_id, store_id) pair).
-- This makes backfill values provably correct rather than guessed.

BEGIN;

-- 1. Add columns nullable first so backfill can run row-by-row without violating NOT NULL.
ALTER TABLE public.ims_stock_batches
  ADD COLUMN IF NOT EXISTS quantity_available numeric,
  ADD COLUMN IF NOT EXISTS gst_rate           numeric,
  ADD COLUMN IF NOT EXISTS entry_date         date,
  ADD COLUMN IF NOT EXISTS notes              text,
  ADD COLUMN IF NOT EXISTS supplier_id        uuid;

-- 2. Backfill existing rows.
--    quantity_available = quantity: verified safe — zero consumption recorded.
--    entry_date = created_at::date: the only physical-time signal available for seeded rows.
--    gst_rate = 0: no historical signal; matches "no GST recorded" rather than fabricating a rate.
UPDATE public.ims_stock_batches
SET quantity_available = COALESCE(quantity_available, quantity),
    entry_date         = COALESCE(entry_date, created_at::date),
    gst_rate           = COALESCE(gst_rate, 0);

-- 3. Lock in invariants. quantity_available and entry_date MUST be present going forward
--    (addBatch already supplies both). gst_rate keeps a default so any caller missing it
--    silently gets 0% rather than erroring — matches the addBatch coalesce behaviour at line 435.
ALTER TABLE public.ims_stock_batches
  ALTER COLUMN quantity_available SET NOT NULL,
  ALTER COLUMN entry_date         SET NOT NULL,
  ALTER COLUMN gst_rate           SET NOT NULL,
  ALTER COLUMN gst_rate           SET DEFAULT 0;

-- 4. quantity_available must be non-negative. We deliberately do NOT add `<= quantity` —
--    inbound transfers and adjustments legitimately push available above the original
--    inflow quantity for that batch row in some IMS flows.
ALTER TABLE public.ims_stock_batches
  ADD CONSTRAINT ims_stock_batches_quantity_available_nonneg
    CHECK (quantity_available >= 0);

-- 5. supplier_id FK. ON DELETE SET NULL so deleting a supplier doesn't cascade-delete
--    historical batch records (audit-trail preservation).
ALTER TABLE public.ims_stock_batches
  ADD CONSTRAINT ims_stock_batches_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.ims_suppliers(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_supplier_id
  ON public.ims_stock_batches (supplier_id);

-- 6. Composite index that matches the exact getBatchesForItem read path:
--    WHERE item_id = ? AND store_id = ? ORDER BY expiry_date NULLS LAST, created_at
--    Postgres can scan this index directly and skip the sort step entirely.
CREATE INDEX IF NOT EXISTS idx_ims_stock_batches_fefo_read
  ON public.ims_stock_batches (item_id, store_id, expiry_date NULLS LAST, created_at);

-- 7. Partial unique index on batch_number per (item_id, store_id). Skips NULL batch numbers
--    (legitimate for opening-stock seed rows) but prevents two user-typed "BTH-X" duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_stock_batches_batch_number_per_store
  ON public.ims_stock_batches (item_id, store_id, batch_number)
  WHERE batch_number IS NOT NULL;

COMMIT;
