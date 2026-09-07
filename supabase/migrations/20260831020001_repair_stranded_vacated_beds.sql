-- Data repair — release beds stranded by the pre-RPC vacate path.
--
-- Companion to 20260831020000_cl_vacate_allocation_rpc.sql. The old
-- HostelAllocationService.vacate() flipped status to 'vacated' without setting
-- check_out_date or freeing hostel_beds, so the bed stayed both invisible to
-- the allocators (hostel_beds.status = 'occupied') and locked by the partial
-- unique index hostel_allocations_room_bed_active_uidx (check_out_date IS NULL).
--
-- Measured before this migration (prod, 2026-08-31):
--   398 vacated allocations, 396 correctly released, 2 stranded --
--   e0172650 (Girls Hostel B, room 23 bed 1, vacated 2026-08-24) and
--   26e1779a (Girls Hostel B, room 25 bed 4, vacated 2026-08-31).
-- Both beds still carried current_occupant_id = the departed learner.
--
-- Written set-based and idempotent rather than as two hardcoded ids: a re-run
-- is a no-op, and any row stranded between the audit and this deploy is caught
-- too. Deliberately scoped to status='vacated' with check_out_date IS NULL --
-- it does NOT touch active or pending_approval rows.
--
-- NOT IN SCOPE: the 5 learners marked accommodation 'dayscholar' who still hold
-- an ACTIVE allocation and an occupied bed. Those are a separate defect (the
-- Residents page "Remove from hostel" button writes only
-- learners_profiles.accommodation_type_id) and resolving them needs a human
-- decision per learner about whether they still live in the hostel. Left alone.

BEGIN;

-- 1. Backfill check_out_date from the recorded vacate date, releasing the
--    (room_id, bed_id) slot held by the partial unique index.
UPDATE hostel_allocations
   SET check_out_date = COALESCE(actual_vacate_date, CURRENT_DATE),
       updated_at     = now()
 WHERE status = 'vacated'
   AND check_out_date IS NULL;

-- 2. Free the beds those rows were holding, but only where no OTHER open
--    allocation legitimately claims the same bed.
UPDATE hostel_beds b
   SET status              = 'available',
       current_occupant_id = NULL,
       updated_at          = now()
 WHERE b.status = 'occupied'
   AND EXISTS (
     SELECT 1 FROM hostel_allocations a
      WHERE a.bed_id = b.id
        AND a.status = 'vacated'
        AND a.check_out_date IS NOT NULL
        AND b.current_occupant_id = a.learner_id
   )
   AND NOT EXISTS (
     SELECT 1 FROM hostel_allocations a2
      WHERE a2.bed_id = b.id
        AND a2.status IN ('active', 'pending_approval')
        AND a2.check_out_date IS NULL
   );

COMMIT;
