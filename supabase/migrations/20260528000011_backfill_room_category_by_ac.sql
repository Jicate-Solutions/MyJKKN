-- Backfill hostel_rooms.category_id for existing STUDENT rooms from AC status.
--   AC rooms       -> "Premium Room"  (matched to the block's boys/girls type)
--   Non-AC/cooler  -> "Classic Room"  (matched to the block's boys/girls type)
--
-- Scope: room_purpose = 'student' only (194 rooms). Non-student rooms
-- (warden / office_room / tv_hall / sick_room / staff) are intentionally left
-- uncategorised -- a student room tier doesn't apply to them.
--
-- Idempotent: only fills rooms whose category_id IS NULL, so re-running won't
-- clobber later manual assignments. Categories are gendered, so we match
-- hostel_categories.type to the room's block hostel_type.

UPDATE hostel_rooms r
SET category_id = c.id,
    updated_at = now()
FROM hostel_blocks b,
     hostel_categories c
WHERE r.block_id = b.id
  AND r.room_purpose = 'student'
  AND r.category_id IS NULL
  AND c.is_active = true
  AND c.type = b.hostel_type::text
  AND c.name = CASE
        WHEN r.ac_status = 'ac' THEN 'Premium Room'
        ELSE 'Classic Room'
      END;
