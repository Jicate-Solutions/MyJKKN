-- =====================================================================
-- Fix: time-window-aware reservation approval guard
-- =====================================================================
-- Root cause: fn_reservation_approved_decrement_stock used a single,
-- time-blind current_stock_quantity counter as the approval gate. On
-- approval it did `current_stock_quantity -= quantity`, restored only on
-- complete / cancel / no_show. For a single-unit resource (a room / hall),
-- the FIRST approved booking drained the unit to 0 and HELD it until that
-- booking ended -- so EVERY other booking, even one on a completely
-- non-overlapping date, then failed approval with:
--   "Insufficient stock: this resource has 0 unit(s) available but 1
--    unit(s) are needed to approve this reservation".
-- (The same bug hits multi-unit resources booked on different days.)
--
-- Double-booking of the same time window is ALREADY prevented at creation
-- time by the time-overlap check in ReservationService.checkAvailability,
-- so the global counter added a second, time-blind constraint that was
-- simply wrong for time-shared resources.
--
-- The earlier auto-complete-past-due cron (20260606103000) was only a
-- partial band-aid: it freed stock AFTER a booking's end_time passed, so a
-- FUTURE approved booking still blocked everything until it was over.
--
-- Fix: evaluate availability WITHIN the booking's [start_time, end_time)
-- window. At approval, sum the quantities of OTHER approved reservations
-- whose window OVERLAPS this one, and block only if that plus this
-- reservation's quantity exceeds the resource's total units
-- (initial_stock_quantity). No persistent counter, no restore bookkeeping.
-- current_stock_quantity is backfilled to capacity and is now display-only.
--
-- NOTE: the function name (fn_reservation_approved_decrement_stock) is kept
-- to avoid re-wiring the AFTER UPDATE OF status trigger; it no longer
-- decrements anything -- it is now a windowed availability guard.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Approval guard: windowed availability check (no counter mutation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reservation_approved_decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     int;
  v_committed int;
BEGIN
  -- Only guard the transition INTO 'approved'.
  IF NEW.status = 'approved'
     AND (OLD.status IS NULL OR OLD.status <> 'approved')
     AND COALESCE(NEW.quantity, 0) > 0
     AND NEW.start_time IS NOT NULL
     AND NEW.end_time   IS NOT NULL THEN

    -- Total units this resource provides (capacity).
    SELECT initial_stock_quantity INTO v_total
    FROM public.resources
    WHERE id = NEW.resource_id;

    -- NULL capacity = resource does not track units -> no limit.
    IF v_total IS NOT NULL THEN
      -- Units already committed by OTHER approved reservations whose time
      -- window OVERLAPS this one. Non-overlapping bookings (different day /
      -- slot) do NOT consume capacity for this window.
      SELECT COALESCE(SUM(rr.quantity), 0) INTO v_committed
      FROM public.resource_reservations rr
      WHERE rr.resource_id = NEW.resource_id
        AND rr.id <> NEW.id
        AND rr.status = 'approved'
        AND rr.start_time < NEW.end_time
        AND rr.end_time   > NEW.start_time;

      IF v_committed + NEW.quantity > v_total THEN
        RAISE EXCEPTION
          'Insufficient stock: only % unit(s) of this resource are free for the selected time window, but % unit(s) are needed to approve this reservation',
          GREATEST(v_total - v_committed, 0), NEW.quantity
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. End-of-life trigger: drop the stock-restore (there is no live
--    counter to restore anymore); KEEP the waitlist promotion.
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
  -- Promote the next waitlist entry on any cancellation.
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
-- 3. Backfill: current_stock_quantity now mirrors capacity (display-only).
--    Repairs every row the old counter model left drained (e.g. the
--    "Exam Hall - Pharmacy" resource stuck at 0).
-- ---------------------------------------------------------------------
UPDATE public.resources
   SET current_stock_quantity = initial_stock_quantity
 WHERE current_stock_quantity IS DISTINCT FROM initial_stock_quantity;

COMMIT;
