-- =====================================================================
-- Reset Premium room category — start fresh                          2026-06-17
--
-- Office request: clear all in-flight Premium room-category state so Premium
-- starts from zero. Premium = the 6 manual-allocation room categories
-- (Premium Room, Premium Room + AC, Premium Plus Room — boys + girls).
--
-- Verified state before reset:
--   - 12 learners with hostel_category_id = a Premium category (optimistic flip),
--     all revert cleanly to a non-premium base (8 -> Classic Room, 4 -> Deluxe Room)
--     via the recorded hostel_waitlist.from_hostel_category_id.
--   - 23 waiting upgrade requests targeting Premium, each holding 1 reserved bed
--     (23 reserved beds), 0 with an upgrade bill.
--   - 0 active allocations in Premium rooms; 0 Premium upgrade bills.
--     => no room moves to undo, no billing/refund impact. Fully reversible from backup.
--
-- Historical declined (14) + cancelled (42) requests are LEFT as history.
-- Backups: _bak_premium_reset_*_20260617 (drop after smoke).
-- =====================================================================

-- 1) Backups -----------------------------------------------------------
DROP TABLE IF EXISTS public._bak_premium_reset_waitlist_20260617;
CREATE TABLE public._bak_premium_reset_waitlist_20260617 AS
SELECT w.* FROM hostel_waitlist w
WHERE w.entry_kind='upgrade' AND w.status='waiting'
  AND w.target_hostel_category_id IN (SELECT id FROM hostel_categories WHERE allocation_mode='manual');

DROP TABLE IF EXISTS public._bak_premium_reset_learner_cat_20260617;
CREATE TABLE public._bak_premium_reset_learner_cat_20260617 AS
SELECT lp.id AS learner_id, lp.hostel_category_id, lp.pending_hostel_category_id, now() AS backed_up_at
FROM learners_profiles lp
WHERE lp.hostel_category_id IN (SELECT id FROM hostel_categories WHERE allocation_mode='manual');

-- 2) Revert the 12 learners to their recorded original category --------
-- (read from the still-'waiting' request; runs BEFORE the cancel below).
WITH prem AS (SELECT id FROM hostel_categories WHERE allocation_mode='manual'),
revert AS (
  SELECT lp.id AS lp_id,
    (SELECT w.from_hostel_category_id
       FROM hostel_waitlist w JOIN profiles p ON p.id = w.learner_id
      WHERE p.learner_id = lp.id AND w.entry_kind='upgrade' AND w.status='waiting'
        AND w.target_hostel_category_id = lp.hostel_category_id
        AND w.from_hostel_category_id IS NOT NULL
      ORDER BY w.updated_at DESC LIMIT 1) AS orig_cat
  FROM learners_profiles lp
  WHERE lp.hostel_category_id IN (SELECT id FROM prem)
)
UPDATE learners_profiles lp
   SET hostel_category_id = r.orig_cat, pending_hostel_category_id = NULL, updated_at = now()
  FROM revert r
 WHERE lp.id = r.lp_id AND r.orig_cat IS NOT NULL;

-- 3) Release the reserved beds held by waiting Premium requests --------
WITH prem AS (SELECT id FROM hostel_categories WHERE allocation_mode='manual')
UPDATE hostel_beds b SET status='available'
  FROM hostel_waitlist w
 WHERE w.entry_kind='upgrade' AND w.status='waiting'
   AND w.target_hostel_category_id IN (SELECT id FROM prem)
   AND w.held_bed_id = b.id AND b.status='reserved';

-- 4) Cancel the waiting Premium upgrade requests -----------------------
WITH prem AS (SELECT id FROM hostel_categories WHERE allocation_mode='manual')
UPDATE hostel_waitlist
   SET status='cancelled', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
 WHERE entry_kind='upgrade' AND status='waiting'
   AND target_hostel_category_id IN (SELECT id FROM hostel_categories WHERE allocation_mode='manual');
