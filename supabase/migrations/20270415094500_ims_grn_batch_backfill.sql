-- 20270415090000_ims_grn_batch_backfill.sql
--
-- BUG-005900 / BUG-005901: approveGRN inserted ims_stock_batches without the
-- NOT NULL columns quantity_available and entry_date, so every insert failed
-- and the unread error hid it. Approved GRNs raised ims_stock_summary but left
-- no batch, and "View Batches" said "No batches found". The app now writes
-- both columns; this backfills one batch per approved GRN line that has none.
--
-- quantity_available is capped at what the store still holds that no other
-- batch already accounts for (summary.current_quantity minus the other
-- batches' quantity_available, floored at 0). Stock issued since approval
-- therefore is not counted twice. On 2026-09-28 this is 5 GRN lines.
--
-- Data only. No schema, function, policy or grant change. Idempotent: a line
-- that already has a batch for its GRN is skipped.

INSERT INTO public.ims_stock_batches (
  item_id, batch_number, expiry_date, quantity, quantity_available,
  cost_price, gst_rate, total_value, entry_date, grn_id, supplier_id,
  location_type, department_id, institution_id, store_id
)
SELECT
  gi.item_id,
  gi.batch_number,
  gi.expiry_date,
  gi.quantity,
  LEAST(
    gi.quantity,
    GREATEST(
      COALESCE(ss.current_quantity, 0) - COALESCE((
        SELECT SUM(b.quantity_available)
          FROM public.ims_stock_batches b
         WHERE b.item_id = gi.item_id
           AND b.store_id IS NOT DISTINCT FROM g.store_id
      ), 0),
      0
    )
  ),
  gi.cost_price,
  COALESCE(gi.cgst_percent, 0) + COALESCE(gi.sgst_percent, 0) + COALESCE(gi.igst_percent, 0),
  gi.total,
  (COALESCE(g.approved_at, g.updated_at, now()) AT TIME ZONE 'Asia/Kolkata')::date,
  g.id,
  g.supplier_id,
  'central_store',
  NULL,
  g.institution_id,
  g.store_id
FROM public.ims_goods_received_notes g
JOIN public.ims_grn_items gi ON gi.grn_id = g.id
LEFT JOIN public.ims_stock_summary ss
  ON ss.item_id = gi.item_id
 AND ss.store_id IS NOT DISTINCT FROM g.store_id
WHERE g.status = 'approved'
  AND NOT EXISTS (
    SELECT 1
      FROM public.ims_stock_batches b
     WHERE b.grn_id = g.id
       AND b.item_id = gi.item_id
  );
