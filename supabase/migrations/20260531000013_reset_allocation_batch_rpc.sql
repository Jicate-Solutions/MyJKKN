-- Reset (completely remove) an allocation batch: frees any beds its active
-- allocations occupy, deletes all of the batch's allocations, then the batch.
-- Destructive — used to discard a generated/approved batch entirely.
CREATE OR REPLACE FUNCTION public.fn_reset_allocation_batch(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('campus_living.allocations.delete')
          OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to reset allocations';
  END IF;

  -- Free beds currently occupied by this batch's active allocations.
  UPDATE hostel_beds b SET status='available', current_occupant_id=NULL
    FROM hostel_allocations a
    WHERE a.batch_id=p_batch_id AND a.bed_id=b.id AND a.status='active' AND b.status='occupied';

  -- Remove the batch's allocations, then the batch itself.
  DELETE FROM hostel_allocations WHERE batch_id=p_batch_id;
  DELETE FROM hostel_allocation_batches WHERE id=p_batch_id;
END $$;
