-- Remove a chosen subset of a batch's allocations (multi-select "Remove
-- selected" on the batch detail page), as opposed to fn_reset_allocation_batch
-- which discards the whole batch. Frees beds for just the selected
-- allocations, deletes just those rows, and re-syncs allocated_count from
-- what's actually left — mirrors fn_reset_allocation_batch's bed-freeing
-- step and permission check, scoped to p_allocation_ids.
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

  -- Free beds for just the selected allocations.
  UPDATE hostel_beds b SET status='available', current_occupant_id=NULL
    FROM hostel_allocations a
    WHERE a.batch_id = p_batch_id AND a.id = ANY(p_allocation_ids)
      AND a.bed_id = b.id AND a.status = 'active' AND b.status = 'occupied';

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
