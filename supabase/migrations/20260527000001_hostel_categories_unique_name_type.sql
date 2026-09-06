-- Relax UNIQUE from name-only to (name, type) so the same category name
-- can exist under different types (e.g., "Hostel A" for boys AND girls).

ALTER TABLE hostel_categories
  DROP CONSTRAINT hostel_categories_name_unique;

ALTER TABLE hostel_categories
  ADD CONSTRAINT hostel_categories_name_type_unique UNIQUE (name, type);
