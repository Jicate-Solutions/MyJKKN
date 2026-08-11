-- ============================================================================
-- Two things an item master has to get right: you cannot delete what other
-- documents point at, and you cannot add the same thing twice.
--
-- Neither was handled. Deleting an item that had ever been stocked failed with
--
--   update or delete on table "ims_items" violates foreign key constraint
--   "ims_stock_summary_item_id_fkey" on table "ims_stock_summary"
--
-- which is Postgres telling the truth in a language no storekeeper reads. And
-- nothing stopped a second "Amoxicillin 500mg" being created next to the first —
-- previously the unique code was an accidental brake on that, but codes are
-- generated now (20260804120000), so the brake is gone.
-- ============================================================================

SET lock_timeout = '15s';

-- ============================================================================
-- 1. DELETING AN ITEM
--
-- 15 tables reference ims_items with NO ACTION. They are not equal, and the fix
-- is not to cascade them:
--
--   DOCUMENTS — sales, GRNs, indents, issues, consumption, financial
--   transactions, shipments, kit rules, bundle membership. Each is a record of
--   something that happened, or an obligation to someone else. Deleting the item
--   would orphan a line on a document that has to keep adding up. These BLOCK.
--
--   THE ITEM'S OWN LEDGER — stock summary, batches, movements, unit conversions,
--   store listings. Private bookkeeping about an item that, if no document names
--   it, nobody outside this row has ever relied on. These are CLEANED UP.
--
-- WHY "HAS STOCK" IS NOT A BLOCKER, WHICH IS THE UNOBVIOUS PART. The instinct is
-- to refuse while quantity > 0. That builds a trap: zeroing the stock means
-- posting an adjustment, an adjustment writes ims_stock_movements, and if
-- movements blocked deletion then nothing that ever held stock could EVER be
-- deleted. The mistaken item you are trying to undo becomes permanent by trying
-- to undo it. So on-hand stock is reported to the caller to confirm, not
-- refused — an item on no document was never really acquired.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ims_delete_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_item     public.ims_items;
    v_blocks   TEXT[] := ARRAY[]::TEXT[];
    v_n        BIGINT;
    v_qty      NUMERIC;
    v_batches  BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_item FROM public.ims_items WHERE id = p_item_id FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Item not found' USING ERRCODE = 'no_data_found';
    END IF;

    -- Same rule as the ims_items_delete policy (20260731160000). Restated because
    -- SECURITY DEFINER bypasses RLS, so this function owns the check.
    IF NOT (
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        OR (
            v_item.institution_id IN (SELECT public.ims_accessible_institution_ids())
            AND public.user_has_permission('ims.inventory.delete')
        )
    ) THEN
        RAISE EXCEPTION 'You do not have permission to delete items'
            USING ERRCODE = '42501';
    END IF;

    -- ── Documents that must keep adding up ──────────────────────────────────
    SELECT count(*) INTO v_n FROM public.ims_sale_items WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s sale line(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_grn_items WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s goods-receipt line(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_indent_request_items WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s indent line(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_stock_issues WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s department issue(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_department_consumption WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s consumption record(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_financial_transactions WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s financial transaction(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_supply_shipment_items
     WHERE item_id = p_item_id OR bundle_parent_item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s transfer line(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_kit_entitlements WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s kit entitlement(s)', v_n); END IF;

    SELECT count(*) INTO v_n FROM public.ims_kit_rule_items WHERE item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s kit rule(s)', v_n); END IF;

    -- Being a component of SOMEONE ELSE'S bundle blocks. Having your own
    -- components does not — that list dies with the bundle (FK is CASCADE).
    SELECT count(*) INTO v_n FROM public.ims_item_bundle_components
     WHERE component_item_id = p_item_id;
    IF v_n > 0 THEN v_blocks := v_blocks || format('%s bundle(s) that contain it', v_n); END IF;

    IF array_length(v_blocks, 1) > 0 THEN
        RAISE EXCEPTION
            '"%" cannot be deleted because it is used by %. Deactivate it instead — that hides it everywhere without breaking the records that refer to it.',
            v_item.name, array_to_string(v_blocks, ', ')
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- ── Nothing points at it. Clear its own ledger, then the row. ───────────
    SELECT coalesce(sum(current_quantity), 0) INTO v_qty
      FROM public.ims_stock_summary WHERE item_id = p_item_id;
    SELECT count(*) INTO v_batches
      FROM public.ims_stock_batches WHERE item_id = p_item_id;

    DELETE FROM public.ims_stock_movements  WHERE item_id = p_item_id;
    DELETE FROM public.ims_stock_batches    WHERE item_id = p_item_id;
    DELETE FROM public.ims_stock_summary    WHERE item_id = p_item_id;
    DELETE FROM public.ims_unit_conversions WHERE item_id = p_item_id;
    -- ims_store_items, ims_item_change_requests and this item's own bundle
    -- component list all cascade.
    DELETE FROM public.ims_items WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'deleted',          true,
        'name',             v_item.name,
        'code',             v_item.code,
        'discarded_qty',    v_qty,
        'discarded_batches', v_batches
    );
END;
$function$;

COMMENT ON FUNCTION public.ims_delete_item(UUID) IS
    'Deletes an item, or explains in plain language which documents prevent it. '
    'Cleans up the item''s own stock ledger; refuses when any document line refers '
    'to it. On-hand stock is reported, not refused — see the migration header for '
    'why blocking on it would make deletion impossible.';

REVOKE ALL     ON FUNCTION public.ims_delete_item(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ims_delete_item(UUID) TO   authenticated;

-- ============================================================================
-- 2. THE SAME ITEM, TWICE
--
-- The key is (institution, name, CATEGORY) — not name alone. Live data settles
-- it: BROMO THYMOL BLUE and PICRIC ACID each exist twice at Pharmacy, once under
-- AUTO-LIQUID and once under AUTO-SOLID. Same chemical, different physical form,
-- genuinely different items. A name-only rule would forbid the second one.
--
-- WHY A TRIGGER AND NOT A UNIQUE INDEX. Two groups already violate even the
-- name+category rule — MERCURIC CHLORIDE (SOL-216, SOL-229) and the "test" pair
-- at Dental. CREATE UNIQUE INDEX would simply fail against that data, and the
-- alternative is asking someone to merge production rows before an unrelated
-- feature can ship. A trigger fires only on writes, so the existing pairs are
-- grandfathered untouched while nothing new can join them.
--
-- Deactivated items still count. "You already have this, it is switched off" is
-- more useful than silently allowing a second copy — that is exactly how the
-- MERCURIC CHLORIDE pair happened.
-- ============================================================================

-- Case, leading/trailing space AND runs of internal whitespace all collapse.
-- btrim+lower alone is not enough: "BROMO  THYMOL BLUE" with a double space is
-- the same item to a human and a different string to Postgres, and typing an
-- extra space is exactly the accident this guard exists to catch.
CREATE OR REPLACE FUNCTION public.ims_normalise_item_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g');
$function$;

CREATE OR REPLACE FUNCTION public.ims_items_reject_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_existing public.ims_items;
BEGIN
    SELECT * INTO v_existing
      FROM public.ims_items i
     WHERE i.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
       AND i.institution_id IS NOT DISTINCT FROM NEW.institution_id
       AND i.category_id    IS NOT DISTINCT FROM NEW.category_id
       AND public.ims_normalise_item_name(i.name)
         = public.ims_normalise_item_name(NEW.name)
     LIMIT 1;

    IF v_existing.id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_existing.is_active THEN
        RAISE EXCEPTION
            'This item already exists: "%" (code %). Edit that item instead of adding it again.',
            v_existing.name, v_existing.code
            USING ERRCODE = 'unique_violation';
    ELSE
        RAISE EXCEPTION
            'This item already exists as "%" (code %), but it is deactivated. Reactivate it instead of adding a second copy.',
            v_existing.name, v_existing.code
            USING ERRCODE = 'unique_violation';
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.ims_items_reject_duplicate() IS
    'Refuses a second item with the same name in the same category and institution. '
    'Category is part of the key because the same substance legitimately exists as '
    'both a liquid and a solid. Existing duplicates are grandfathered: a trigger '
    'only sees writes.';

DROP TRIGGER IF EXISTS ims_items_reject_duplicate_insert ON public.ims_items;
CREATE TRIGGER ims_items_reject_duplicate_insert
    BEFORE INSERT ON public.ims_items
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_items_reject_duplicate();

-- Renaming or recategorising INTO a collision is the same mistake arriving by a
-- different road. Scoped with WHEN so that editing the price of one of the
-- grandfathered duplicates still works.
DROP TRIGGER IF EXISTS ims_items_reject_duplicate_update ON public.ims_items;
CREATE TRIGGER ims_items_reject_duplicate_update
    BEFORE UPDATE OF name, category_id, institution_id ON public.ims_items
    FOR EACH ROW
    WHEN (
        public.ims_normalise_item_name(OLD.name)
          IS DISTINCT FROM public.ims_normalise_item_name(NEW.name)
        OR OLD.category_id    IS DISTINCT FROM NEW.category_id
        OR OLD.institution_id IS DISTINCT FROM NEW.institution_id
    )
    EXECUTE FUNCTION public.ims_items_reject_duplicate();
