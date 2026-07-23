-- File: supabase/migrations/20260529000004_mess_categories_unique_name_type.sql
-- mess_categories is a GENDERED catalog (type ∈ boys/girls/mixed), so the same
-- category name must be allowed once per gender — exactly like hostel_categories
-- (UNIQUE (name, type)). It shipped with UNIQUE(name) alone, which blocked
-- creating a "Classic"/"Premium" row for girls when boys already had it
-- (23505 mess_categories_name_unique). Align the constraint with
-- hostel_categories so per-gender duplicates of a name are valid.
BEGIN;

ALTER TABLE public.mess_categories
  DROP CONSTRAINT IF EXISTS mess_categories_name_unique;

ALTER TABLE public.mess_categories
  ADD CONSTRAINT mess_categories_name_type_unique UNIQUE (name, type);

COMMIT;
