-- 20260701T1458Z_cdc_internships_website_perks_duration.sql
-- Date: 2026-07-01
-- Reason: CDC corporate internship form (/cdc/internships/new) was missing four
--   capture fields:
--     BUG-004293 — company website URL
--     BUG-004295 — perks beyond stipend (accommodation / transport / food)
--     BUG-004292 — internship duration (in months)
--   Add the columns to the canonical CDC internship table (internship_assignments),
--   matching the additive style used for is_paid/stipend (BUG-004040).
-- Scope: additive only; every column is nullable or defaulted so existing rows and
--   inserts that omit them are unaffected. No SECURITY DEFINER functions added.

ALTER TABLE public.internship_assignments
  ADD COLUMN IF NOT EXISTS company_website_url text,
  ADD COLUMN IF NOT EXISTS has_accommodation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_transport    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_food         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_months  integer;

COMMENT ON COLUMN public.internship_assignments.company_website_url IS
  'BUG-004293: optional company/website URL for the internship host. NULL when not provided.';
COMMENT ON COLUMN public.internship_assignments.has_accommodation IS
  'BUG-004295: perk — accommodation provided in addition to any stipend. Default false.';
COMMENT ON COLUMN public.internship_assignments.has_transport IS
  'BUG-004295: perk — transport provided in addition to any stipend. Default false.';
COMMENT ON COLUMN public.internship_assignments.has_food IS
  'BUG-004295: perk — food/meals provided in addition to any stipend. Default false.';
COMMENT ON COLUMN public.internship_assignments.duration_months IS
  'BUG-004292: internship duration in months (e.g. 1, 2, 3, 6, 12). NULL when unspecified.';
