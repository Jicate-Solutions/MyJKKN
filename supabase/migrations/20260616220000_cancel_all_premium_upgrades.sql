-- Admin bulk-cancel: revert ALL waiting Premium-category upgrade requests + free reserved rooms
-- (user decision 2026-06-16). 39 Premium Room (girls) holds: each learner reverted to her original
-- category, reserved bed freed, request set 'cancelled'. No bills (below-threshold reservations).
-- Backup: _bak_premium_upgrade_cancel_20260616 (drop after smoke). On a fresh env this matches 0 rows.
CREATE TABLE IF NOT EXISTS public._bak_premium_upgrade_cancel_20260616 AS
SELECT w.*, lp.id AS lp_id, lp.hostel_category_id AS lp_hostel_category_id_before, now() AS backed_up_at
FROM hostel_waitlist w
JOIN hostel_categories hc ON hc.id = w.target_hostel_category_id
JOIN profiles p ON p.id = w.learner_id
JOIN learners_profiles lp ON lp.id = p.learner_id
WHERE w.entry_kind='upgrade' AND w.status='waiting' AND hc.name ILIKE '%premium%';

-- 1) Restore each learner's original category (still flipped onto the Premium target).
UPDATE learners_profiles lp
   SET hostel_category_id = w.from_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now()
  FROM hostel_waitlist w
  JOIN hostel_categories hc ON hc.id = w.target_hostel_category_id
  JOIN profiles p ON p.id = w.learner_id
 WHERE lp.id = p.learner_id
   AND w.entry_kind='upgrade' AND w.status='waiting' AND hc.name ILIKE '%premium%'
   AND w.from_hostel_category_id IS NOT NULL
   AND lp.hostel_category_id = w.target_hostel_category_id;

-- 2) Free the reserved beds.
UPDATE hostel_beds b SET status='available'
  FROM hostel_waitlist w
  JOIN hostel_categories hc ON hc.id = w.target_hostel_category_id
 WHERE b.id = w.held_bed_id AND b.status='reserved'
   AND w.entry_kind='upgrade' AND w.status='waiting' AND hc.name ILIKE '%premium%';

-- 3) Cancel any unpaid upgrade bills (no receipts).
UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
  FROM hostel_waitlist w
  JOIN hostel_categories hc ON hc.id = w.target_hostel_category_id
 WHERE bb.id = w.upgrade_bill_id AND bb.status='unpaid'
   AND w.entry_kind='upgrade' AND w.status='waiting' AND hc.name ILIKE '%premium%'
   AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);

-- 4) Mark the requests cancelled (status flip LAST).
UPDATE hostel_waitlist w SET status='cancelled', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
  FROM hostel_categories hc
 WHERE hc.id = w.target_hostel_category_id
   AND w.entry_kind='upgrade' AND w.status='waiting' AND hc.name ILIKE '%premium%';
