-- Clear the hostel upgrade waitlist for a fresh start (campus living)
--
-- Context: after the 2026-06-16 category-upgrade waitlist reset (20260616050000)
-- and the deletion of room-category upgrade bills (20260616060000), 16 NEW
-- 'waiting' upgrade entries appeared (all girls -> Premium Room, each holding a
-- reserved bed, none with an upgrade bill). User decision: wipe the entire
-- upgrade waitlist and release all held beds to begin fresh.
--
-- Actions:
--   1. Release the 16 reserved beds back to 'available'. Guarded on status =
--      'reserved' so beds referenced by stale/expired holds (now re-available or
--      occupied) are never touched.
--   2. Delete ALL upgrade waitlist rows (125 = 16 waiting + 4 declined + 105
--      expired).
--
-- Not touched: allocations, the 7 unpaid mess category bills, the 64 base
-- (academic) hostel bills, room-category bills (already 0). No waitlist row held
-- an upgrade_bill_id, so no bill cleanup was required.
--
-- Backups (drop after smoke):
--   _bak_hostel_waitlist_clear_20260616  (125 rows)
--   _bak_released_beds_20260616          (16 beds, old_status)

CREATE TABLE IF NOT EXISTS _bak_hostel_waitlist_clear_20260616 AS
SELECT * FROM hostel_waitlist WHERE entry_kind = 'upgrade';

CREATE TABLE IF NOT EXISTS _bak_released_beds_20260616 AS
SELECT b.id, b.status AS old_status, b.bed_number, b.room_id
FROM hostel_beds b
WHERE b.status = 'reserved'
  AND b.id IN (
    SELECT held_bed_id FROM hostel_waitlist
    WHERE entry_kind='upgrade' AND status='waiting' AND held_bed_id IS NOT NULL
  );

UPDATE hostel_beds
SET status = 'available'
WHERE id IN (SELECT id FROM _bak_released_beds_20260616) AND status = 'reserved';

DELETE FROM hostel_waitlist WHERE entry_kind = 'upgrade';
