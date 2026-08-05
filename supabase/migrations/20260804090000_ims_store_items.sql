-- ============================================================================
-- Which stores actually CARRY an item.
--
-- An item added at the Dental Student Store also showed up in the Dental
-- Warehouse's list, and flagging it "At POS" put it on every other counter in
-- the institution. Both are the same missing layer.
--
-- IMS had two layers and needed three:
--
--   definition  ims_items          UNIQUE (institution_id, code)   institution-wide
--   assortment  -- MISSING --                                      per-store
--   stock       ims_stock_summary  UNIQUE (item_id, store_id)      per-store
--
-- ims_items.store_id looks like the missing layer but is not. 20260221 added it
-- and backfilled it to each institution's FIRST store; 20260801002200 then
-- promoted the oldest store of each institution to warehouse. What it records is
-- "which store created this row", and it is never rewritten when the item is
-- later stocked somewhere else. Live proof: item 03c98ed6 ("test") is stamped
-- with the Dental Student Store while its only stock row sits under the Dental
-- Warehouse. 272e3c2ad reached the same conclusion and stopped filtering on it.
--
-- So assortment gets its own table. The catalogue deliberately stays ONE ROW PER
-- (institution, code): forking items per store would collide with
-- ims_items_institution_code_unique and break ims_create_push_transfer, which
-- moves a single item_id between stores. Carrying an item is a MEMBERSHIP
-- question, not an identity question.
--
-- The per-store POS flag rides along here rather than on ims_items, because
-- "sold at this counter" is a property of the counter, not of the item.
-- ============================================================================

SET lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.ims_store_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id                UUID NOT NULL REFERENCES public.ims_stores(id) ON DELETE CASCADE,
    item_id                 UUID NOT NULL REFERENCES public.ims_items(id)  ON DELETE CASCADE,

    -- Per-store "At POS". Replaces ims_items.is_sellable_to_students as the
    -- value the counter reads; the item-level column stays as the default for
    -- newly added stores and is no longer authoritative on its own.
    is_sellable_to_students BOOLEAN NOT NULL DEFAULT false,

    -- Carried, but temporarily delisted. Distinct from deleting the row: keeping
    -- it preserves the POS flag and the audit of who added it.
    is_active               BOOLEAN NOT NULL DEFAULT true,

    added_by                UUID REFERENCES public.profiles(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ims_store_items_store_item_unique UNIQUE (store_id, item_id)
);

COMMENT ON TABLE public.ims_store_items IS
    'Assortment: which stores carry which catalogue items. ims_items stays one row '
    'per (institution, code); this table says where it is listed, and whether that '
    'store sells it at the counter.';
COMMENT ON COLUMN public.ims_store_items.is_sellable_to_students IS
    'Per-store "At POS". The counter reads THIS, not ims_items.is_sellable_to_students, '
    'so adding an item to one store''s till no longer adds it to every till in the institution.';

-- The (store_id, item_id) unique index already serves store-scoped lookups.
CREATE INDEX IF NOT EXISTS idx_ims_store_items_item
    ON public.ims_store_items(item_id);

-- Partial: the POS catalogue query is "this store, sellable, listed", and at the
-- Pharmacy that is 0 of 761 rows.
CREATE INDEX IF NOT EXISTS idx_ims_store_items_store_pos
    ON public.ims_store_items(store_id)
    WHERE is_sellable_to_students AND is_active;

DROP TRIGGER IF EXISTS update_ims_store_items_updated_at ON public.ims_store_items;
CREATE TRIGGER update_ims_store_items_updated_at
    BEFORE UPDATE ON public.ims_store_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Backfill.
--
-- A store carries an item if it HOLDS STOCK of it (the honest signal) or if it
-- CREATED it (the only signal available for items that have never been stocked —
-- 24 of the 77 Dental items, and 321 of the 761 Pharmacy ones).
--
-- The institution guard is not theoretical bookkeeping: nothing in the existing
-- schema stops an ims_stock_summary row from pointing at a store in one
-- institution and an item in another, and importing such a pair here would let a
-- store list an item its own RLS cannot read.
--
-- Seeding is_sellable_to_students from the item preserves today's behaviour for
-- the store that already sells it. Stores that merely inherited the flag by
-- being in the same institution lose it — that is the bug being fixed.
-- ============================================================================
INSERT INTO public.ims_store_items (store_id, item_id, is_sellable_to_students)
SELECT m.store_id, m.item_id, i.is_sellable_to_students
  FROM (
        SELECT store_id, item_id FROM public.ims_stock_summary WHERE store_id IS NOT NULL
        UNION
        SELECT store_id, id      FROM public.ims_items         WHERE store_id IS NOT NULL
       ) m
  JOIN public.ims_items  i ON i.id = m.item_id
  JOIN public.ims_stores s ON s.id = m.store_id
                          AND s.institution_id IS NOT DISTINCT FROM i.institution_id
ON CONFLICT (store_id, item_id) DO NOTHING;

-- ============================================================================
-- Keep it true afterwards.
--
-- A store starts carrying an item through GRN receipt, transfer receipt
-- (ims_receive_into_destination), a stock adjustment, or bulk import. Every one
-- of those ends in an ims_stock_summary INSERT, so one trigger there covers all
-- of them — and covers whatever the next such path turns out to be. Doing it in
-- four services instead would work until someone adds a fifth.
--
-- Item CREATION is not covered here: a new item has no stock row yet. The
-- service inserts that membership row itself.
--
-- Deliberately INSERT-only. An item whose stock falls to zero is still carried;
-- dropping the listing would erase its POS flag every time the shelf ran empty.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ims_sync_store_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        INSERT INTO public.ims_store_items (store_id, item_id)
        VALUES (NEW.store_id, NEW.item_id)
        ON CONFLICT (store_id, item_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.ims_sync_store_item() IS
    'Lists an item at a store the moment that store first holds stock of it, so a '
    'warehouse push makes the item appear in the destination''s catalogue without '
    'every receiving path having to remember to do it.';

DROP TRIGGER IF EXISTS ims_stock_summary_sync_store_item ON public.ims_stock_summary;
CREATE TRIGGER ims_stock_summary_sync_store_item
    AFTER INSERT ON public.ims_stock_summary
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_sync_store_item();

-- ============================================================================
-- RLS — mirrors 20260731160000 on ims_items.
--
-- Ceiling worth stating: the only helper available is
-- ims_accessible_institution_ids(), and a store grant widens to the whole
-- institution. There is no ims_accessible_store_ids(). So RLS here is
-- institution-tight, not store-tight — a Dental user can read another Dental
-- store's listings. That matches every other IMS table today; the per-store
-- BEHAVIOUR is enforced by the queries, and narrowing it properly is a separate,
-- wider change than this one.
-- ============================================================================
ALTER TABLE public.ims_store_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ims_store_items_select ON public.ims_store_items;
CREATE POLICY ims_store_items_select
    ON public.ims_store_items
    FOR SELECT
    TO authenticated
    USING (
        public.get_current_user_role() = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM public.ims_items i
             WHERE i.id = ims_store_items.item_id
               AND i.institution_id IN (SELECT public.ims_accessible_institution_ids())
        )
    );

DROP POLICY IF EXISTS ims_store_items_insert ON public.ims_store_items;
CREATE POLICY ims_store_items_insert
    ON public.ims_store_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        OR EXISTS (
            SELECT 1 FROM public.ims_items i
             WHERE i.id = ims_store_items.item_id
               AND i.institution_id IN (SELECT public.ims_accessible_institution_ids())
               AND public.user_has_permission('ims.inventory.edit')
        )
    );

DROP POLICY IF EXISTS ims_store_items_update ON public.ims_store_items;
CREATE POLICY ims_store_items_update
    ON public.ims_store_items
    FOR UPDATE
    TO authenticated
    USING (
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        OR EXISTS (
            SELECT 1 FROM public.ims_items i
             WHERE i.id = ims_store_items.item_id
               AND i.institution_id IN (SELECT public.ims_accessible_institution_ids())
               AND public.user_has_permission('ims.inventory.edit')
        )
    );

DROP POLICY IF EXISTS ims_store_items_delete ON public.ims_store_items;
CREATE POLICY ims_store_items_delete
    ON public.ims_store_items
    FOR DELETE
    TO authenticated
    USING (
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        OR EXISTS (
            SELECT 1 FROM public.ims_items i
             WHERE i.id = ims_store_items.item_id
               AND i.institution_id IN (SELECT public.ims_accessible_institution_ids())
               AND public.user_has_permission('ims.inventory.edit')
        )
    );

-- anon has no business here; see 20260731160000 for what happens when a table is
-- reachable with nothing but the publishable key.
REVOKE ALL ON public.ims_store_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ims_store_items TO authenticated;

-- ============================================================================
-- Retire the stamp.
-- ============================================================================
COMMENT ON COLUMN public.ims_items.store_id IS
    'LEGACY: which store created this row. NOT a scope key — it was backfilled to '
    'each institution''s first store in 20260221 and is never rewritten when the item '
    'is stocked elsewhere. Use ims_store_items for "does this store carry it" and '
    'ims_stock_summary for "how much does it hold". Still written on create for '
    'continuity, and still set by procurement''s reconcileNewItem().';
