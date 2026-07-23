-- Move the hostel category from the BLOCK to the ROOM.
-- A block is now just a gender (hostel_type); the category (room tier:
-- Classic/Deluxe/Premium…, gendered) belongs on each room, filtered by the
-- block's type in the add-room UI.
--
-- Room category is nullable at the DB level (existing rooms have none and
-- can't be sensibly backfilled; non-student rooms like warden/office never
-- have a tier) — the add-room FORM enforces it as required going forward.

ALTER TABLE hostel_rooms
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES hostel_categories(id);

CREATE INDEX IF NOT EXISTS idx_hostel_rooms_category
  ON hostel_rooms (category_id);

-- Block no longer carries a category (drops the FK with it; no views depend on it).
ALTER TABLE hostel_blocks
  DROP COLUMN IF EXISTS category_id;
