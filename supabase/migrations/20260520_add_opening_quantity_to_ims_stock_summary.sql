-- Migration: Add opening_quantity to ims_stock_summary
-- Date: 2026-05-20
-- Branch: ims-on-main
-- Purpose: Expose "opening stock" as a first-class column on ims_stock_summary so
--          the Items table UI can render it independently of the live current_quantity.
--          Admins set it via the inline-edit pencil on /ims/inventory/items, which
--          calls ImsStockService.updateOpeningQuantity.
--
-- Backward-compat: DEFAULT 0 NOT NULL — existing rows get 0, never NULL.
--
-- NOTE on backfill: an earlier draft of this migration backfilled from
-- ims_stock_batches WHERE notes='Opening stock', but the production
-- ims_stock_batches table does not have a `notes` column (schema drift between
-- types/ims/stock.ts and the live schema). Backfill omitted as a result —
-- admins set opening_quantity manually via the new inline-edit UI.

ALTER TABLE public.ims_stock_summary
  ADD COLUMN IF NOT EXISTS opening_quantity NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ims_stock_summary.opening_quantity IS
  'Opening stock recorded at item creation or set by admin via inline edit. '
  'Does NOT auto-update on transfers/adjustments — use current_quantity for live balance.';

NOTIFY pgrst, 'reload schema';
