-- =====================================================================
-- Fix: Stock decrement guard + restore-on-complete + data recalculation
-- =====================================================================
-- Three layered issues:
--
-- 1. fn_reservation_approved_decrement_stock has no guard:
--    UPDATE blindly subtracts quantity with no floor check, so the
--    positive_stock_quantities constraint fires with a cryptic message
--    instead of a clear "insufficient stock" exception.
--
-- 2. fn_reservation_cancelled_restore_stock_and_waitlist only restores
--    stock when NEW.status = 'cancelled' AND OLD.status = 'approved'.
--    Transitions to 'completed' and 'no_show' are missing, so every
--    approved→completed cycle permanently consumes stock — the root cause
--    of current_stock_quantity = 0 on "Testing Resource".
--
-- 3. Data corruption: resources whose stock drained via the missing
--    restore-on-complete need their current_stock_quantity recalculated.
--    Correct value = initial_stock_quantity - SUM(approved reservation
--    quantities), floored at 0.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Fix approve-decrement trigger: guard + clear error message
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reservation_approved_decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock int;
BEGIN
  IF NEW.status = 'approved'
     AND (OLD.status IS NULL OR OLD.status <> 'approved')
     AND COALESCE(NEW.quantity, 0) > 0 THEN

    SELECT current_stock_quantity INTO v_stock
    FROM public.resources
    WHERE id = NEW.resource_id;

    -- Only decrement when the resource tracks stock (field is not NULL).
    IF v_stock IS NOT NULL THEN
      IF v_stock < NEW.quantity THEN
        RAISE EXCEPTION
          'Insufficient stock: this resource has % unit(s) available but % unit(s) are needed to approve this reservation',
          v_stock, NEW.quantity
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.resources
         SET current_stock_quantity = current_stock_quantity - NEW.quantity
       WHERE id = NEW.resource_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Fix restore trigger: also restore on completed / no_show
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reservation_cancelled_restore_stock_and_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_waitlist_id UUID;
BEGIN
  -- Restore stock whenever an APPROVED reservation ends for any reason.
  -- Previous version only covered 'cancelled'; 'completed' and 'no_show'
  -- were missing, causing permanent stock drain.
  IF NEW.status IN ('cancelled', 'completed', 'no_show')
     AND OLD.status = 'approved'
     AND COALESCE(OLD.quantity, 0) > 0 THEN

    UPDATE public.resources
       SET current_stock_quantity = LEAST(
             COALESCE(current_stock_quantity, 0) + OLD.quantity,
             COALESCE(initial_stock_quantity,
                      COALESCE(current_stock_quantity, 0) + OLD.quantity)
           )
     WHERE id = OLD.resource_id;
  END IF;

  -- Promote next waitlist entry on any cancellation.
  IF NEW.status = 'cancelled' THEN
    SELECT id INTO next_waitlist_id
    FROM public.event_waitlist
    WHERE resource_reservation_id = NEW.id
      AND status = 'waiting'
    ORDER BY position ASC LIMIT 1;

    IF next_waitlist_id IS NOT NULL THEN
      UPDATE public.event_waitlist
         SET status = 'promoted', promoted_at = now()
       WHERE id = next_waitlist_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Recalculate current_stock_quantity for all affected resources.
--    Correct value = initial_stock_quantity - SUM of quantities for
--    reservations whose status is currently 'approved' (stock is held).
--    Pending, completed, cancelled, and rejected reservations do not
--    hold stock.
-- ---------------------------------------------------------------------
UPDATE public.resources r
   SET current_stock_quantity = GREATEST(
         r.initial_stock_quantity - COALESCE((
           SELECT SUM(rr.quantity)
             FROM public.resource_reservations rr
            WHERE rr.resource_id = r.id
              AND rr.status = 'approved'
         ), 0),
         0
       )
 WHERE r.initial_stock_quantity IS NOT NULL
   AND r.current_stock_quantity IS NOT NULL;

COMMIT;
