-- Migration: 20260730140000_ims_expiry_controls
-- Purpose: Stop the POS dispensing expired stock, and stop expiry-tracked items
--          being stocked without an expiry date.
--
-- WHAT WAS WRONG (measured on live data):
--
--  1. ims_pick_fefo_batches orders by earliest expiry with NO cut-off, so it hands
--     out the oldest batch even when that date has passed. Tested against Dental
--     Store: item "T.CIP ZOX", batch BTH-202410190, expired 2025-07-10 — 385 days
--     ago — was the batch FEFO would pick first. 12 such batches carry available
--     stock right now. "First-expiry-first-out" had quietly become "sell the
--     expired one first", which for a pharmacy is a patient-safety and regulatory
--     problem rather than a reporting quirk.
--
--  2. ims_items.track_expiry is decorative. It appears in three places in the
--     codebase, all inside the bulk-import DTO; nothing reads it to alert, warn or
--     block. 103 items have track_expiry = true and not one batch carrying an
--     expiry date, so they could never have produced an expiry warning.
--
-- DECISION: hard block at both ends, not a warning. A warning a busy cashier
-- clicks past is not a control, and dispensing expired medicine is not a
-- judgement call. Expired stock becomes unsellable and has to be written off
-- through ims_stock_adjustments, which is what that flow is for.
--
-- Deliberately NOT changed: the transfer engine still ships expired stock, because
-- ims_ship_out_from_source / ims_receive_into_destination call the same picker and
-- rewriting warehouse distribution behaviour on POS go-live day is blast radius
-- without reward. The new parameter defaults to the old behaviour so those callers
-- are untouched. Worth a follow-up.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Teach the FEFO picker to skip expired batches, opt-in.
--
--    DROP + CREATE rather than CREATE OR REPLACE with an extra argument: adding a
--    defaulted 4th parameter alongside the existing 3-arg function would leave two
--    overloads, and a 3-arg call would then fail as ambiguous. Recreating with the
--    default keeps every existing 3-arg call resolving to the old behaviour.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.ims_pick_fefo_batches(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.ims_pick_fefo_batches(
    p_item_id         UUID,
    p_store_id        UUID,
    p_quantity        NUMERIC,
    p_exclude_expired BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    batch_id     UUID,
    take_qty     NUMERIC,
    cost_price   NUMERIC,
    expiry_date  DATE,
    batch_number TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id, b.quantity_available, b.cost_price AS cp, b.expiry_date AS ed,
           b.batch_number AS bn
      FROM public.ims_stock_batches b
     WHERE b.item_id = p_item_id
       AND b.store_id = p_store_id
       AND COALESCE(b.quantity_available, 0) > 0
       -- A batch that expires TODAY is still good today, hence < not <=.
       AND (
            NOT p_exclude_expired
            OR b.expiry_date IS NULL
            OR b.expiry_date >= (now() AT TIME ZONE 'Asia/Kolkata')::DATE
       )
     ORDER BY (b.expiry_date IS NULL), b.expiry_date, b.entry_date, b.created_at, b.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    batch_id     := r.id;
    take_qty     := LEAST(v_remaining, r.quantity_available);
    cost_price   := COALESCE(r.cp, 0);
    expiry_date  := r.ed;
    batch_number := r.bn;
    v_remaining  := v_remaining - take_qty;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ims_pick_fefo_batches(uuid, uuid, numeric, boolean)
  FROM PUBLIC, anon;

COMMENT ON FUNCTION public.ims_pick_fefo_batches(uuid, uuid, numeric, boolean) IS
'FEFO pick list. Pass p_exclude_expired => true for anything that DISPENSES stock '
'(the POS does); expired batches are then skipped so they cannot be sold. Defaults '
'to false so the transfer engine keeps its existing behaviour.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Refuse to stock an expiry-tracked item without an expiry date.
--
--    A trigger rather than a CHECK constraint, because the rule depends on another
--    table (ims_items.track_expiry).
--
--    BEFORE INSERT ONLY, on purpose. 45 of Dental Store's 119 existing batches have
--    a NULL expiry; firing on UPDATE would make those rows uneditable and block
--    unrelated corrections. New stock is held to the rule; historical rows are left
--    for someone to clean up deliberately.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ims_require_expiry_on_tracked_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_track BOOLEAN;
  v_name  TEXT;
BEGIN
  IF NEW.expiry_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT track_expiry, name INTO v_track, v_name
    FROM public.ims_items WHERE id = NEW.item_id;

  IF COALESCE(v_track, FALSE) THEN
    RAISE EXCEPTION
      '% is set to track expiry, so this batch needs an expiry date. Enter the date printed on the pack, or turn expiry tracking off for this item.',
      COALESCE(v_name, NEW.item_id::TEXT)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ims_require_expiry_on_tracked_batch ON public.ims_stock_batches;

CREATE TRIGGER trg_ims_require_expiry_on_tracked_batch
  BEFORE INSERT ON public.ims_stock_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.ims_require_expiry_on_tracked_batch();

COMMENT ON FUNCTION public.ims_require_expiry_on_tracked_batch() IS
'Blocks new batches with no expiry_date on items flagged track_expiry. Before this, '
'103 items were flagged to track expiry while holding no batch that carried one, so '
'no expiry alert could ever fire for them. INSERT-only: pre-existing NULL-expiry '
'rows stay editable.';
