-- =====================================================================
-- Backfill batch_id on already-upgraded (transfer) allocations          2026-06-17
--
-- Learners upgraded before 20260617190000 have an active 'transfer' allocation
-- with batch_id NULL, while their original (now vacated) batch allocation still
-- carries the batch_id. Copy the batch_id forward so the batch detail page picks
-- up the upgraded room. Only touches allocation_type='transfer' (upgrade moves),
-- never 'fresh' self-bookings.
-- =====================================================================
UPDATE hostel_allocations a
   SET batch_id = v.batch_id, updated_at = now()
  FROM (
    SELECT DISTINCT ON (learner_id) learner_id, batch_id
    FROM hostel_allocations
    WHERE status = 'vacated' AND batch_id IS NOT NULL
    ORDER BY learner_id, allocation_date DESC, created_at DESC
  ) v
 WHERE a.learner_id = v.learner_id
   AND a.status = 'active'
   AND a.allocation_type = 'transfer'
   AND a.batch_id IS NULL;
