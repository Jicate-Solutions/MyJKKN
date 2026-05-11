-- 20260503100002_employment_categories_shows_extended_profile.sql
-- Per-category default for the extended profile toggle. When true,
-- staff added under this category get has_extended_profile = true
-- by default in the staff form.

ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS shows_extended_profile boolean NOT NULL DEFAULT false;
