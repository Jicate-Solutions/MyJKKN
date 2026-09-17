-- Girls Hostel A ("Block A") is a shared/mixed block housing learners from six
-- institutions (Pharmacy, Nursing, Allied Health Sciences, Dental, Arts &
-- Science, Engineering). Until now, 13 active hostel_room_eligibility_rules
-- reserved specific rooms in the block for specific institution/program/
-- semester cohorts (38 of the block's 44 Classic Room rooms were locked to
-- one cohort each), leaving only a handful of unreserved rooms open to
-- everyone else.
--
-- That produced a real capacity problem: B.Pharm Semester I girls (e.g.
-- KOWSALYA J) have no matching room-reservation rule at all (the "Bpharm 1st
-- yr" rule only covers Semester II/III, a separate pre-existing gap — see
-- room-allocation notes), so every one of them funnels into the same tiny
-- unreserved pool, which had shrunk to a single room with free beds.
--
-- Decision: for this block, stop reserving rooms by institution/program/
-- semester entirely. Every room becomes open to any institution's learner,
-- gated only by what already applies regardless of these rules: gender
-- (block hostel_type), institution-serving (hostel_block_institutions),
-- room category, and free-bed availability. Soft-disable (is_active = false)
-- rather than delete, so this is reversible — the rules and their room lists
-- are preserved and can be flipped back on if cohort-specific reservations
-- are needed again later.
--
-- Existing occupants are untouched: these rules gate NEW allocation
-- eligibility only (fn_cl_admin_allocatable_rooms, fn_auto_allocate_*); they
-- never touch hostel_allocations rows directly.

UPDATE hostel_room_eligibility_rules
SET is_active = false,
    updated_at = now()
WHERE block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a'  -- Girls Hostel A
  AND is_active = true;
