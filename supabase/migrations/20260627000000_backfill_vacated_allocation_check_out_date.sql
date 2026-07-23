-- Backfill check_out_date for hostel_allocations rows that were vacated via the
-- old workflow (status → 'vacated') before PR1 added the check_out_date column
-- on 2026-05-26. Because the vacate service only set status, check_out_date was
-- left NULL on all pre-PR1 vacations. v_hostel_room_occupancy counts
-- "active_residents" using FILTER (WHERE check_out_date IS NULL), so these 25
-- vacated rows are incorrectly counted as occupied beds, inflating the block-wise
-- Residents total from 498 (correct) to 523.
-- Fix: use updated_at::date as the checkout date since that is when each row's
-- status was last changed to 'vacated'.
UPDATE public.hostel_allocations
SET check_out_date = updated_at::date
WHERE status = 'vacated'
  AND check_out_date IS NULL;
