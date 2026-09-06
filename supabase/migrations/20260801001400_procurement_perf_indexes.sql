-- Migration: 20260801001400_procurement_perf_indexes
-- Purpose:  Performance — the procurement list services filter by store_id in
--           preference to institution_id (a store-scoped user's default), but only
--           institution_id was indexed, so those queries did full table scans. Add
--           the missing store_id indexes on the four header tables plus supplier_id
--           on the GRN header (also a filtered column). Safe/additive.

CREATE INDEX IF NOT EXISTS idx_ppr_store      ON public.procurement_purchase_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_prfq_store     ON public.procurement_rfqs(store_id);
CREATE INDEX IF NOT EXISTS idx_ppo_store      ON public.procurement_purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_pgrn_store     ON public.procurement_grn(store_id);
CREATE INDEX IF NOT EXISTS idx_pgrn_supplier  ON public.procurement_grn(supplier_id);
