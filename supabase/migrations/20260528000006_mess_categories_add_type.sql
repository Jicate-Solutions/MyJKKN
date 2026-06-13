-- ─── mess_categories: add `type` (boys/girls/mixed) ────────────────────
-- Mirrors hostel_categories.type. Plain text (the form constrains the
-- values). Added with a temporary default to backfill existing rows, then
-- the default is dropped so the column matches hostel_categories (the form
-- always supplies a type on insert).

ALTER TABLE mess_categories
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'boys';

ALTER TABLE mess_categories
  ALTER COLUMN type DROP DEFAULT;
