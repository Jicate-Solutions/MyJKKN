-- ============================================================================
-- Which stores are actually SHOPS.
--
-- Not every store sells. A lab store issues to departments, a central supply store
-- distributes to other stores — neither has a counter or a customer. Until now the
-- POS was offered for all of them, so a cashier switching to the lab store landed
-- on a till for a place that has never sold anything and never will.
--
-- NOTE THE BACKFILL, WHICH IS THE RISKY PART. The column defaults to FALSE so that
-- a newly created store must be declared a counter deliberately. Applying that
-- default to EXISTING rows would have silently switched off every working till in
-- the system — including JKKN Pharmacy, which is production. Sales history is not a
-- safe proxy either: Pharmacy has zero rows in ims_sales today, so "turn on the
-- ones that have sold something" would have disabled it just as thoroughly.
--
-- So existing stores are switched ON, preserving exactly today's behaviour, and
-- only the store explicitly named as a non-counter is switched off.
-- ============================================================================

SET lock_timeout = '15s';

ALTER TABLE public.ims_stores
    ADD COLUMN IF NOT EXISTS is_pos_store BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ims_stores.is_pos_store IS
    'True when this store has a selling counter. Controls whether the POS is offered '
    'for it and whether ims_pos_checkout will book a sale against it. New stores '
    'default to false — being a shop is opt-in.';

-- Preserve current behaviour for every store that already exists.
UPDATE public.ims_stores SET is_pos_store = true WHERE is_pos_store = false;

-- The one store explicitly declared NOT a counter (issues to the lab, never sells).
UPDATE public.ims_stores
   SET is_pos_store = false, updated_at = now()
 WHERE code = 'DCH-LAB'
   AND institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';

-- ============================================================================
-- Enforce it where it actually matters.
--
-- Hiding the POS menu item is a courtesy, not a control: the checkout RPC is
-- callable directly. A sale booked against a store with no counter would move
-- stock out of a lab and issue an invoice nobody can explain, so the refusal
-- belongs next to the booking.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ims_assert_pos_store(p_store_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_ok   BOOLEAN;
    v_name TEXT;
BEGIN
    SELECT is_pos_store, name INTO v_ok, v_name
      FROM public.ims_stores WHERE id = p_store_id;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Store not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT v_ok THEN
        RAISE EXCEPTION '% does not have a selling counter, so a sale cannot be booked against it', v_name
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.ims_assert_pos_store(UUID) IS
    'Raises unless the store is flagged as having a selling counter. Called by '
    'ims_pos_checkout so the rule holds for direct RPC callers, not just the UI.';

REVOKE ALL     ON FUNCTION public.ims_assert_pos_store(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ims_assert_pos_store(UUID) TO   authenticated;
