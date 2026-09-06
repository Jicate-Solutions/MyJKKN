-- P0.1 — Add allocation_mode to room categories (auto|manual) and reconcile
-- room category_id from the reliable tier_access data.
--
-- WHY: three competing tier taxonomies existed (hostel_categories.category_id
-- [unreliable], hostel_rooms.tier_access [reliable], hostel_tier_policy).
-- We make hostel_categories canonical, flag Classic as the AUTO-allocation
-- category, and backfill every student room's category_id from tier_access,
-- gender-matched via the room's block.

-- 1. allocation_mode flag (Classic = auto-allocated; others = manual self-select).
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS allocation_mode text NOT NULL DEFAULT 'manual'
  CHECK (allocation_mode IN ('auto','manual'));

UPDATE public.hostel_categories SET allocation_mode = 'auto' WHERE name = 'Classic Room';

-- 2. Backfill student-room category_id from tier_access, gender-matched.
--    Non-student rooms (warden/mess/office/sick_room/tv_hall/...) are left
--    uncategorised. tier_access has no 'premium_plus', so Premium Plus
--    categories get no rooms here (configured manually later).
UPDATE public.hostel_rooms r
SET category_id = c.id
FROM public.hostel_blocks b, public.hostel_categories c
WHERE r.block_id = b.id
  AND r.room_purpose = 'student'
  AND b.hostel_type::text IN ('boys','girls')
  AND c.is_active
  AND c.type = b.hostel_type::text
  AND c.name = CASE r.tier_access
                 WHEN 'classic' THEN 'Classic Room'
                 WHEN 'deluxe'  THEN 'Deluxe Room'
                 WHEN 'premium' THEN 'Premium Room'
                 ELSE NULL
               END;
