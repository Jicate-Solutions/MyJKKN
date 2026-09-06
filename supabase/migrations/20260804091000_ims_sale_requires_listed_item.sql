-- ============================================================================
-- A counter can only sell what that counter lists.
--
-- 20260804090000 moved the sellable flag onto the store's listing, but the flag
-- was only ever read by the POS *query*. Nothing enforced it at the point of
-- sale: ims_pos_checkout validates the store, the permission, the tender and the
-- stock, and then takes the cart's item ids on trust. A crafted RPC call could
-- book a sale for an item the store does not list and has never been meant to
-- sell — the same shape of hole 20260731160000 closed on ims_items, where the
-- application never offered the button but the button was not the control.
--
-- WHY A TRIGGER AND NOT AN EDIT TO ims_pos_checkout. That function is ~250 lines
-- of SECURITY DEFINER logic, and CREATE OR REPLACE means restating all of it. The
-- live definition has been changed outside this repo before, so re-emitting it
-- from a migration file risks reverting something. A trigger on the line rows
-- adds the check without touching the function, and covers any other path that
-- writes ims_sale_items too.
--
-- The rule is exactly what the till already shows, so no legitimate sale changes
-- shape. It is deliberately NOT "has stock" — ims_pos_checkout already refuses an
-- oversell, and duplicating that here would just produce a worse error message.
-- ============================================================================

SET lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.ims_assert_sale_item_listed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_store_id  UUID;
    v_item_name TEXT;
    v_listed    BOOLEAN;
BEGIN
    SELECT store_id INTO v_store_id
      FROM public.ims_sales
     WHERE id = NEW.sale_id;

    -- Sales predating the multi-store work can carry a null store. Those have no
    -- counter to check against, so there is nothing to enforce.
    IF v_store_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT si.is_sellable_to_students AND si.is_active
      INTO v_listed
      FROM public.ims_store_items si
     WHERE si.store_id = v_store_id
       AND si.item_id  = NEW.item_id;

    IF COALESCE(v_listed, false) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_item_name FROM public.ims_items WHERE id = NEW.item_id;

    RAISE EXCEPTION '% is not sold at this counter', COALESCE(v_item_name, NEW.item_id::TEXT)
        USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.ims_assert_sale_item_listed() IS
    'Refuses a sale line for an item the selling store does not list as sellable. '
    'Makes the per-store POS flag a control rather than a display detail.';

DROP TRIGGER IF EXISTS ims_sale_items_require_listing ON public.ims_sale_items;
CREATE TRIGGER ims_sale_items_require_listing
    BEFORE INSERT ON public.ims_sale_items
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_assert_sale_item_listed();
