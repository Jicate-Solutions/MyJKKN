-- Fix: resetting an allocation batch failed with 23503 whenever any allocation
-- in the batch was still referenced by hostel_vacate_requests
-- (FK hostel_vacate_requests_allocation_id_fkey is ON DELETE RESTRICT).
--
-- Tables that FK hostel_allocations.id and how the reset must handle them:
--   hostel_cleaning_bookings  -> CASCADE    (auto-cleaned on allocation delete)
--   hostel_premium_invites    -> CASCADE    (auto-cleaned)
--   hostel_vacate_requests    -> RESTRICT   (blocked the delete — fixed below)
--   hostel_deposits           -> NO ACTION  (would also block — guarded below)
--
-- A batch reset "completely removes the batch" (undo), so a vacate request
-- against an allocation being deleted is moot -> delete those first (their own
-- children, clearance items / documents, cascade). Deposits are financial
-- records, so refuse with a clear message instead of auto-deleting (mirrors the
-- single-row reset fn_cl_admin_reset_allocation).
CREATE OR REPLACE FUNCTION public.fn_reset_allocation_batch(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('campus_living.allocations.delete')
          OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to reset allocations';
  END IF;

  -- Deposits are financial records — never auto-delete them. If any allocation
  -- in the batch has one, refuse with a clear message (the FK is ON DELETE
  -- NO ACTION and would otherwise surface a raw 23503).
  IF EXISTS (
    SELECT 1 FROM hostel_deposits d
    JOIN hostel_allocations a ON a.id = d.allocation_id
    WHERE a.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'Cannot reset: one or more allocations in this batch have a deposit record. Settle or remove those deposits first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Free beds currently occupied by this batch's active allocations.
  UPDATE hostel_beds b SET status='available', current_occupant_id=NULL
    FROM hostel_allocations a
    WHERE a.batch_id=p_batch_id AND a.bed_id=b.id AND a.status='active' AND b.status='occupied';

  -- Vacate requests FK the batch's allocations ON DELETE RESTRICT; a reset undoes
  -- the batch, so those requests are moot. Remove them first (their clearance
  -- items / documents cascade) so the allocation delete below isn't blocked.
  DELETE FROM hostel_vacate_requests vr
    USING hostel_allocations a
    WHERE vr.allocation_id = a.id AND a.batch_id = p_batch_id;

  -- Remove the batch's allocations, then the batch itself.
  DELETE FROM hostel_allocations WHERE batch_id=p_batch_id;
  DELETE FROM hostel_allocation_batches WHERE id=p_batch_id;
END $function$;
