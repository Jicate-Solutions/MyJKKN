-- Remove a chosen subset of a batch's allocations (multi-select "Remove
-- selected" on the batch detail page), as opposed to fn_reset_allocation_batch
-- which discards the whole batch. Frees beds for just the selected
-- allocations, deletes just those rows, and re-syncs allocated_count from
-- what's actually left — mirrors fn_reset_allocation_batch's bed-freeing
-- step, permission check, and dependent-FK handling
-- (20260724120000_fix_reset_allocation_batch_dependent_fks.sql), scoped to
-- p_allocation_ids instead of the whole batch.
CREATE OR REPLACE FUNCTION public.fn_remove_batch_allocations(p_batch_id uuid, p_allocation_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('campus_living.allocations.delete')
          OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to remove allocations';
  END IF;

  IF p_allocation_ids IS NULL OR array_length(p_allocation_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Deposits are financial records — never auto-delete them. Refuse with a
  -- clear message instead of surfacing a raw 23503 (NO ACTION FK).
  IF EXISTS (
    SELECT 1 FROM hostel_deposits d
    WHERE d.allocation_id = ANY(p_allocation_ids)
  ) THEN
    RAISE EXCEPTION 'Cannot remove: one or more selected allocations have a deposit record. Settle or remove those deposits first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Free beds for just the selected allocations.
  UPDATE hostel_beds b SET status='available', current_occupant_id=NULL
    FROM hostel_allocations a
    WHERE a.batch_id = p_batch_id AND a.id = ANY(p_allocation_ids)
      AND a.bed_id = b.id AND a.status = 'active' AND b.status = 'occupied';

  -- Vacate requests FK the allocation ON DELETE RESTRICT; removing an
  -- allocation makes any vacate request against it moot — drop those first
  -- (their clearance items / documents cascade) so the delete below isn't
  -- blocked.
  DELETE FROM hostel_vacate_requests vr
    WHERE vr.allocation_id = ANY(p_allocation_ids);

  -- Remove just the selected allocations, scoped to this batch (never
  -- touches allocations outside p_batch_id even if a stray id is passed).
  DELETE FROM hostel_allocations WHERE batch_id = p_batch_id AND id = ANY(p_allocation_ids);

  -- Re-sync the batch's allocated_count with what's actually left.
  UPDATE hostel_allocation_batches
    SET allocated_count = (SELECT count(*) FROM hostel_allocations WHERE batch_id = p_batch_id)
    WHERE id = p_batch_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_remove_batch_allocations(uuid, uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_remove_batch_allocations(uuid, uuid[]) TO authenticated;
